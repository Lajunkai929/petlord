import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { chmod, mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const require = createRequire(import.meta.url);
const { createDesktopCompanionController, createDesktopWasteAdapter } = require("../electron/desktop-companion.cjs");
const { createDesktopWastePlatform } = require("../electron/desktop-waste-platform.cjs");
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

function controllerFixture(enabled = false, overrides: Record<string, unknown> = {}) {
  let bounds = { x: -80, y: 50, width: 60, height: 80 };
  let dragging = false;
  const create = vi.fn(async () => ({ ok: true, id: "owned-file" }));
  const setBounds = vi.fn((next: typeof bounds) => { bounds = next; });
  const controller = createDesktopCompanionController({ getBounds: () => bounds, getWorkArea: () => ({ x: -200, y: 20, width: 200, height: 140 }), setBounds, isDragging: () => dragging, isWasteEnabled: () => enabled, wasteAdapter: { create }, speed: 100, initialFacing: "right", ...overrides });
  return { controller, create, setBounds, bounds: () => bounds, drag: () => { dragging = true; } };
}

describe("desktop companion lifecycle", () => {
  it("defaults to no waste and requires a matching completed action", async () => {
    const f = controllerFixture();
    await f.controller.handleAction({ actionId: "a", semanticKey: "poop", phase: "started" });
    await f.controller.handleAction({ actionId: "a", semanticKey: "poop", phase: "completed" });
    expect(f.create).not.toHaveBeenCalled();
    const on = controllerFixture(true);
    await on.controller.handleAction({ actionId: "unregistered", semanticKey: "pee", phase: "completed" });
    await on.controller.handleAction({ actionId: "b", semanticKey: "poop", phase: "started" });
    await on.controller.handleAction({ actionId: "b", semanticKey: "poop", phase: "interrupted" });
    await on.controller.handleAction({ actionId: "b", semanticKey: "poop", phase: "completed" });
    expect(on.create).not.toHaveBeenCalled();
  });
  it("emits one waste file per action even with duplicate completions and loop updates", async () => {
    const f = controllerFixture(true);
    await f.controller.handleAction({ actionId: "a", semanticKey: "pee", phase: "started" });
    await Promise.all([f.controller.handleAction({ actionId: "a", semanticKey: "pee", phase: "completed" }), f.controller.handleAction({ actionId: "a", semanticKey: "pee", phase: "completed" })]);
    await f.controller.handleAction({ actionId: "a", semanticKey: "pee", phase: "started" });
    await f.controller.handleAction({ actionId: "a", semanticKey: "pee", phase: "completed" });
    expect(f.create).toHaveBeenCalledTimes(1);
    expect(f.create).toHaveBeenCalledWith({ actionId: "a", kind: "pee", position: { x: -50, y: 130 } });
  });
  it("moves only run actions within negative-origin monitor bounds and stops on drag/interruption", async () => {
    const f = controllerFixture();
    await f.controller.handleAction({ actionId: "r", semanticKey: "run", phase: "started" });
    const movement = f.controller.tick(1000);
    expect(movement.facing).toBe("left");
    expect(f.bounds().x).toBeGreaterThan(-80);
    expect(f.bounds().x).toBeLessThanOrEqual(-60);
    expect(f.bounds().y).toBeGreaterThanOrEqual(20);
    expect(f.bounds().y + f.bounds().height).toBeLessThanOrEqual(160);
    f.drag(); f.controller.tick(16);
    const afterDrag = f.bounds(); f.controller.tick(1000);
    expect(f.bounds()).toEqual(afterDrag);
    const next = controllerFixture();
    await next.controller.handleAction({ actionId: "r", semanticKey: "run", phase: "started" });
    next.controller.interrupt("manual"); next.controller.tick(1000);
    expect(next.setBounds).not.toHaveBeenCalled();
  });
  it("a different action interrupts movement and prevents the superseded waste completion", async () => {
    const f = controllerFixture(true);
    await f.controller.handleAction({ actionId: "a", semanticKey: "poop", phase: "started" });
    await f.controller.handleAction({ actionId: "b", semanticKey: "sit", phase: "started" });
    await f.controller.handleAction({ actionId: "a", semanticKey: "poop", phase: "completed" });
    f.controller.tick(1000);
    expect(f.create).not.toHaveBeenCalled(); expect(f.setBounds).not.toHaveBeenCalled();
  });
  it("uses the trusted canvas footpoint, clamps it to the work area and refuses non-finite coordinates", async () => {
    const point = vi.fn().mockReturnValueOnce({ x: -65.4, y: 110.2 }).mockReturnValueOnce({ x: -999, y: 999 }).mockReturnValueOnce({ x: NaN, y: 1 });
    const f = controllerFixture(true, { getWastePosition: point });
    for (const id of ["custom", "clamped", "invalid"]) {
      await f.controller.handleAction({ actionId: id, semanticKey: "pee", phase: "started" });
      const result = await f.controller.handleAction({ actionId: id, semanticKey: "pee", phase: "completed" });
      if (id === "invalid") { expect(result.ok).toBe(false); expect(result.error).toContain("position"); }
    }
    expect(point).toHaveBeenCalledWith({ x: -80, y: 50, width: 60, height: 80 }, "pee");
    expect(f.create).toHaveBeenNthCalledWith(1, { actionId: "custom", kind: "pee", position: { x: -65, y: 110 } });
    expect(f.create).toHaveBeenNthCalledWith(2, { actionId: "clamped", kind: "pee", position: { x: -200, y: 160 } });
    expect(f.create).toHaveBeenCalledTimes(2);
  });
  it("bounds recent action deduplication while preserving recent IDs", async () => {
    const f = controllerFixture();
    for (let index = 0; index < 4097; index++) {
      await f.controller.handleAction({ actionId: `loop-${index}`, semanticKey: "dig", phase: "started" });
      await f.controller.handleAction({ actionId: `loop-${index}`, semanticKey: "dig", phase: "completed" });
    }
    expect(await f.controller.handleAction({ actionId: "loop-4096", semanticKey: "dig", phase: "started" })).toMatchObject({ ignored: true });
    expect(await f.controller.handleAction({ actionId: "loop-0", semanticKey: "dig", phase: "started" })).not.toHaveProperty("ignored");
    f.controller.interrupt("test");
    expect(await f.controller.handleAction({ actionId: "loop-0", semanticKey: "dig", phase: "started" })).toMatchObject({ ignored: true });
  });
});

async function adapterFixture() {
  const root = await mkdtemp(join(tmpdir(), "petlord-waste-test-")); roots.push(root);
  const desktopPath = join(root, "Desktop"), stateDirectory = join(root, "profile"), trash = join(root, "Trash");
  await mkdir(desktopPath); await mkdir(trash);
  const platform = { setIcon: vi.fn(async () => undefined), positionFile: vi.fn(async () => undefined) };
  const trashItem = vi.fn(async (path: string) => rename(path, join(trash, path.split("/").at(-1)!)));
  const options = { desktopPath, stateDirectory, platform, trashItem };
  return { root, desktopPath, stateDirectory, trash, platform, trashItem, options, adapter: createDesktopWasteAdapter(options) };
}

describe("owned desktop waste files", () => {
  it("keeps durable waste deduplication after the controller evicts an old playback ID", async () => {
    const files = await adapterFixture();
    const f = controllerFixture(true, { wasteAdapter: files.adapter });
    await f.controller.handleAction({ actionId: "old-waste", semanticKey: "poop", phase: "started" });
    const first = await f.controller.handleAction({ actionId: "old-waste", semanticKey: "poop", phase: "completed" });
    for (let index = 0; index < 4096; index++) {
      await f.controller.handleAction({ actionId: `idle-${index}`, semanticKey: "dig", phase: "started" });
      await f.controller.handleAction({ actionId: `idle-${index}`, semanticKey: "dig", phase: "completed" });
    }
    await f.controller.handleAction({ actionId: "old-waste", semanticKey: "poop", phase: "started" });
    const replay = await f.controller.handleAction({ actionId: "old-waste", semanticKey: "poop", phase: "completed" });
    expect(replay).toMatchObject({ ok: true, duplicate: true, id: first.id });
    expect(await readdir(files.desktopPath)).toHaveLength(1);
    expect(files.platform.setIcon).toHaveBeenCalledTimes(1);
  });
  it("creates unique plain-text files, sanitizes action IDs and persists completion deduplication", async () => {
    const f = await adapterFixture();
    await writeFile(join(f.desktopPath, "PetLord-poop.txt"), "existing user file");
    const [one, duplicate] = await Promise.all([f.adapter.create({ actionId: "../../first", kind: "poop", position: { x: 50, y: 80 } }), f.adapter.create({ actionId: "../../first", kind: "poop", position: { x: 50, y: 80 } })]);
    expect(one.ok).toBe(true); expect(duplicate.id).toBe(one.id);
    const two = await f.adapter.create({ actionId: "second", kind: "pee", position: { x: 50, y: 80 } });
    expect(two.path).not.toBe(one.path);
    expect(await readFile(join(f.desktopPath, "PetLord-poop.txt"), "utf8")).toBe("existing user file");
    expect(await readFile(one.path, "utf8")).toContain("PetLord");
    expect(f.platform.setIcon).toHaveBeenCalledTimes(2);
    const restarted = createDesktopWasteAdapter(f.options);
    expect((await restarted.create({ actionId: "../../first", kind: "poop", position: { x: 1, y: 2 } })).id).toBe(one.id);
    expect(await readdir(f.desktopPath)).toHaveLength(3);
  });
  it("retains the file and reports exact platform limitations", async () => {
    const f = await adapterFixture();
    f.platform.setIcon.mockRejectedValue(new Error("AppKit icon failed"));
    f.platform.positionFile.mockRejectedValue(new Error("Finder automation permission denied (-1743)"));
    const result = await f.adapter.create({ actionId: "denied", kind: "pee", position: { x: 1, y: 2 } });
    expect(result.ok).toBe(true); expect(result.warnings.join(" ")).toContain("-1743");
    expect(result.warnings.join(" ")).toContain("AppKit icon failed");
    expect(await readFile(result.path, "utf8")).toContain("PetLord");
  });
  it("trashes only exact, unchanged owned files and rejects caller paths or replaced files", async () => {
    const f = await adapterFixture();
    const one = await f.adapter.create({ actionId: "first", kind: "poop", position: { x: 1, y: 2 } });
    expect((await f.adapter.trashOwned("../../user.txt")).ok).toBe(false);
    await rm(one.path); await writeFile(one.path, "user replacement");
    expect((await f.adapter.trashOwned(one.id)).ok).toBe(false);
    expect(f.trashItem).not.toHaveBeenCalled();
    const two = await f.adapter.create({ actionId: "second", kind: "pee", position: { x: 1, y: 2 } });
    expect((await f.adapter.trashOwned(two.id)).ok).toBe(true);
    expect(f.trashItem).toHaveBeenCalledTimes(1);
    expect(await readFile(one.path, "utf8")).toBe("user replacement");
    expect((await f.adapter.create({ actionId: "second", kind: "pee", position: { x: 1, y: 2 } })).id).toBe(two.id);
  });
  it("refuses symlink substitutions and a corrupt ownership registry", async () => {
    const f = await adapterFixture();
    const one = await f.adapter.create({ actionId: "first", kind: "poop", position: { x: 1, y: 2 } });
    const userFile = join(f.root, "user.txt"); await writeFile(userFile, "keep");
    await rm(one.path); await symlink(userFile, one.path);
    expect((await f.adapter.trashOwned(one.id)).ok).toBe(false);
    expect(await readFile(userFile, "utf8")).toBe("keep");
    await writeFile(join(f.stateDirectory, "desktop-waste-owned.json"), "invalid");
    const restarted = createDesktopWasteAdapter(f.options);
    const result = await restarted.create({ actionId: "second", kind: "pee", position: { x: 1, y: 2 } });
    expect(result.ok).toBe(false); expect(result.error).toContain("registry");
    expect(await readdir(f.desktopPath)).toHaveLength(1);
  });
  it("runs the packaged icon helper from a real temporary file and treats paths as argv", async () => {
    let helperPath = "";
    const run = vi.fn(async (executable: string, args: string[]) => {
      if (executable === "/usr/bin/swift") { helperPath = args[0]; expect(await readFile(helperPath, "utf8")).toContain("NSWorkspace.shared.setIcon"); }
      return {stdout: executable === "/usr/bin/osascript" ? "-10, 80\n" : "", stderr:""};
    });
    const platform = createDesktopWastePlatform({ platform: "darwin", run });
    const target = '/tmp/isolated desktop/not-a-"command".txt';
    await platform.setIcon(target, "poop");
    expect(helperPath).not.toContain("/electron/");
    await expect(readFile(helperPath)).rejects.toThrow();
    await platform.positionFile(target, { x: -10, y: 80 });
    expect(run.mock.calls[0][1].slice(1)).toEqual([target, "poop"]);
    expect(run.mock.calls[1][1].slice(-3)).toEqual([target, "-10", "80"]);
  });
  it("uses a packaged executable without invoking Swift and reports missing packaged helpers", async () => {
    const f = await adapterFixture();
    const iconHelperPath = join(f.root, "desktop-waste-icon");
    await writeFile(iconHelperPath, "fixture helper"); await chmod(iconHelperPath, 0o755);
    const run = vi.fn(async () => undefined);
    const platform = createDesktopWastePlatform({ platform: "darwin", iconHelperPath, allowSwiftFallback: false, run });
    await platform.setIcon(join(f.desktopPath, "one.txt"), "pee");
    expect(run).toHaveBeenCalledWith(iconHelperPath, [join(f.desktopPath, "one.txt"), "pee"], expect.any(Object));
    expect(run).toHaveBeenCalledTimes(1);
    const missing = createDesktopWastePlatform({ platform: "darwin", iconHelperPath: join(f.root, "missing"), allowSwiftFallback: false, run });
    await expect(missing.setIcon(join(f.desktopPath, "two.txt"), "poop")).rejects.toThrow("compiled icon helper");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
it('requires Finder to confirm the requested location without querying desktop view options',async()=>{
 const run=vi.fn(async()=>({stdout:'420, 360\n',stderr:''}));const platform=createDesktopWastePlatform({platform:'darwin',run});
 await expect(platform.positionFile('/Desktop/owned.txt',{x:420,y:360})).resolves.toBeUndefined();
 run.mockResolvedValueOnce({stdout:'900, 80\n',stderr:''});await expect(platform.positionFile('/Desktop/owned.txt',{x:420,y:360})).rejects.toThrow('Finder');
 run.mockResolvedValueOnce({stdout:'',stderr:''});await expect(platform.positionFile('/Desktop/owned.txt',{x:420,y:360})).rejects.toThrow('confirm');
});
