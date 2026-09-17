import { EventEmitter } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { petPackageBundleSchema } from "@petlord/schema";
import { startPetLordServer } from "../../generation-api/src/appServer";
import { PetRuntimeCore } from "@petlord/runtime-core";

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

class FakeWebContents extends EventEmitter {
  openHandler?: (details: { url: string }) => { action: string };
  sent: Array<{ channel: string; values: unknown[] }> = [];
  send(channel: string, ...values: unknown[]) { this.sent.push({ channel, values }); }
  setWindowOpenHandler(handler: (details: { url: string }) => { action: string }) { this.openHandler = handler; }
}

class FakeWindow extends EventEmitter {
  destroyed = false;
  focusCount = 0;
  hideCount = 0;
  showCount = 0;
  loadedUrl?: string;
  options: Record<string, unknown>;

  webContents = new FakeWebContents();

  constructor(options: Record<string, unknown>) {
    super();
    this.options = options;
  }

  focus() { this.focusCount += 1; }
  hide() { this.hideCount += 1; }
  isDestroyed() { return this.destroyed; }
  show() { this.showCount += 1; }
  destroy() { this.destroyed = true; this.emit("closed"); }
  async loadURL(url: string) {
    this.loadedUrl = url;
    this.emit("ready-to-show");
  }
}

describe("desktop application lifecycle", () => {
  it("provisions a valid offline package on first launch and preserves an existing active package", async () => {
    const { provisionDefaultPackage } = require("../electron/studio-host.cjs") as {
      provisionDefaultPackage(input: { dataDirectory: string; defaultPackagePath: string }): Promise<string>;
    };
    const root = await mkdtemp(join(tmpdir(), "petlord-first-launch-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "user-data");
    const defaultPackagePath = join(process.cwd(), "apps/desktop/resources/default.petlord");

    const installedKey = await provisionDefaultPackage({ dataDirectory, defaultPackagePath });
    const installedContents = await readFile(join(dataDirectory, "packages", installedKey));
    const installed = JSON.parse(installedContents.toString("utf8"));
    expect(() => petPackageBundleSchema.parse(installed)).not.toThrow();
    expect(installed).toMatchObject({
      format: "petlord-package",
      bundleVersion: 2,
      manifest: {
        id: "petlord-bundled-companion",
        initialStateId: "petlord-ready",
        states: [expect.objectContaining({ id: "petlord-ready", nativePixel: { width: 48, height: 48 } })],
      },
    });
    expect(installed.manifest.states[0].imageUri).toMatch(/^asset:\/\/[a-f0-9]{64}\.png$/);
    const animation = installed.manifest.transitions.find((transition: { id: string }) => transition.id === "petlord-sit-idle");
    const runtime = new PetRuntimeCore(installed.manifest);
    expect(runtime.activatePointer("left-click", { x: 0.5, y: 0.5 })).toEqual({ accepted: true });
    expect(runtime.getSnapshot().activeTransitionId).toBe("petlord-sit-idle");
    expect(animation).toMatchObject({
      fromStateId: "petlord-ready",
      toStateId: "petlord-ready",
      tailFrameUri: installed.manifest.states[0].imageUri,
      durationMs: 3560,
      nativeAnimation: {
        frames: [
          expect.objectContaining({ durationMs: 800 }),
          expect.objectContaining({ durationMs: 120 }),
          expect.objectContaining({ durationMs: 160 }),
          expect.objectContaining({ durationMs: 120 }),
          expect.objectContaining({ durationMs: 800 }),
          expect.objectContaining({ durationMs: 80 }),
          expect.objectContaining({ durationMs: 100 }),
          expect.objectContaining({ durationMs: 80 }),
          expect.objectContaining({ durationMs: 800 }),
          expect.objectContaining({ durationMs: 100 }),
          expect.objectContaining({ durationMs: 400 }),
        ],
      },
    });
    expect(animation.nativeAnimation.frames[0].imageUri).toBe(installed.manifest.states[0].imageUri);
    expect(animation.nativeAnimation.frames.at(-1).imageUri).toBe(installed.manifest.states[0].imageUri);
    const animationUris = [...new Set<string>(animation.nativeAnimation.frames.map((frame: { imageUri: string }) => frame.imageUri))];
    expect(animationUris.length).toBeGreaterThan(1);
    for (const uri of animationUris) {
      const encodedAsset = installed.assets[uri.slice("asset://".length)];
      expect(encodedAsset).toMatch(/^data:image\/png;base64,/);
      const png = PNG.sync.read(Buffer.from(encodedAsset.slice(encodedAsset.indexOf(",") + 1), "base64"));
      expect([png.width, png.height]).toEqual([48, 48]);
      const alpha = [...png.data].filter((_value, index) => index % 4 === 3);
      expect([...new Set(alpha)].sort((left, right) => left - right)).toEqual([0, 255]);
      expect(alpha.filter((value) => value === 0).length).toBeGreaterThan(alpha.length / 3);
      expect(alpha.filter((value) => value === 255).length).toBeGreaterThan(alpha.length / 10);
    }
    const decodeFrame = (uri: string) => {
      const encodedAsset = installed.assets[uri.slice("asset://".length)];
      return PNG.sync.read(Buffer.from(encodedAsset.slice(encodedAsset.indexOf(",") + 1), "base64"));
    };
    const sitting = decodeFrame(animation.nativeAnimation.frames[0].imageUri);
    const tailRaised = decodeFrame(animation.nativeAnimation.frames[1].imageUri);
    const pixel = (png: PNG, x: number, y: number) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)];
    expect(pixel(sitting, 11, 6)).toEqual([43, 37, 45, 255]);
    expect(pixel(sitting, 39, 29)).toEqual([0, 0, 0, 0]);
    expect(pixel(tailRaised, 39, 29)).toEqual([43, 37, 45, 255]);
    expect((await readFile(join(dataDirectory, "active-package.txt"), "utf8")).trim()).toBe(installedKey);

    await writeFile(join(dataDirectory, "packages", "my-pet.petlord"), "existing package");
    await writeFile(join(dataDirectory, "active-package.txt"), "my-pet.petlord");
    await rm(join(dataDirectory, "packages", installedKey));
    expect(await provisionDefaultPackage({ dataDirectory, defaultPackagePath })).toBe("my-pet.petlord");
    expect(await readFile(join(dataDirectory, "packages", "my-pet.petlord"), "utf8")).toBe("existing package");
    expect(await readFile(join(dataDirectory, "packages", installedKey))).toEqual(installedContents);
  });

  it.each([false, true])("preserves an edited native built-in across app upgrades (compressed: %s)", async (compressed) => {
    const { provisionDefaultPackage } = require("../electron/studio-host.cjs");
    const root = await mkdtemp(join(tmpdir(), "petlord-builtin-upgrade-"));
    temporaryDirectories.push(root);
    const packagesDirectory = join(root, "packages");
    await mkdir(packagesDirectory);
    const key = "petlord-bundled-companion.petlord";
    const defaultPackagePath = join(process.cwd(), "apps/desktop/resources/default.petlord");
    const edited = JSON.parse(await readFile(defaultPackagePath, "utf8"));
    edited.manifest.name = "我编辑过的像素伙伴";
    edited.manifest.id = "installed-original-project";
    const contents = compressed ? gzipSync(JSON.stringify(edited)) : Buffer.from(JSON.stringify(edited));
    await writeFile(join(packagesDirectory, key), contents);
    await writeFile(join(root, "active-package.txt"), key);

    expect(await provisionDefaultPackage({ dataDirectory: root, defaultPackagePath })).toBe(key);
    expect(await readdir(packagesDirectory)).toEqual([key]);
    expect(await readFile(join(packagesDirectory, key))).toEqual(contents);
  });

  it("keeps a user pet that occupies the built-in filename and provisions the sample only once", async () => {
    const { provisionDefaultPackage } = require("../electron/studio-host.cjs");
    const root = await mkdtemp(join(tmpdir(), "petlord-builtin-name-"));
    temporaryDirectories.push(root);
    const packagesDirectory = join(root, "packages");
    await mkdir(packagesDirectory);
    const key = "petlord-bundled-companion.petlord";
    const originalPath = join(process.cwd(), "apps/desktop/resources/default.petlord");
    const nextSample = JSON.parse(await readFile(originalPath, "utf8"));
    nextSample.manifest.version = "0.2.0";
    const nextPath = join(root, "next.petlord");
    await writeFile(nextPath, JSON.stringify(nextSample));
    await writeFile(join(packagesDirectory, key), "my own package bytes");
    await writeFile(join(root, "active-package.txt"), key);

    await provisionDefaultPackage({ dataDirectory: root, defaultPackagePath: originalPath });
    const installedKeys = await readdir(packagesDirectory);
    expect(installedKeys).toHaveLength(2);
    expect(await provisionDefaultPackage({ dataDirectory: root, defaultPackagePath: nextPath })).toBe(key);
    expect(await readdir(packagesDirectory)).toEqual(installedKeys);
    expect(await readFile(join(packagesDirectory, key), "utf8")).toBe("my own package bytes");
  });

  it("adopts an installed upgrade package when its older release has no active marker", async () => {
    const { provisionDefaultPackage } = require("../electron/studio-host.cjs") as {
      provisionDefaultPackage(input: { dataDirectory: string; defaultPackagePath: string }): Promise<string>;
    };
    const root = await mkdtemp(join(tmpdir(), "petlord-upgrade-launch-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "user-data");
    await mkdir(join(dataDirectory, "packages"), { recursive: true });
    await writeFile(join(dataDirectory, "packages", "previous.petlord"), "previous package bytes");

    expect(await provisionDefaultPackage({
      dataDirectory,
      defaultPackagePath: join(process.cwd(), "apps/desktop/resources/default.petlord"),
    })).toBe("previous.petlord");
    expect(await readFile(join(dataDirectory, "active-package.txt"), "utf8")).toBe("previous.petlord");
    expect(await readFile(join(dataDirectory, "packages", "previous.petlord"), "utf8")).toBe("previous package bytes");
    const sample = JSON.parse(await readFile(join(dataDirectory, "packages", "petlord-bundled-companion.petlord"), "utf8"));
    expect(sample.manifest.states[0].nativePixel).toEqual({ width: 48, height: 48 });
  });

  it("migrates the single-package layout before provisioning the bundled pet", async () => {
    const { provisionDefaultPackage } = require("../electron/studio-host.cjs") as {
      provisionDefaultPackage(input: { dataDirectory: string; defaultPackagePath: string }): Promise<string>;
    };
    const root = await mkdtemp(join(tmpdir(), "petlord-legacy-package-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "user-data");
    await mkdir(dataDirectory, { recursive: true });
    await writeFile(join(dataDirectory, "active-desktop-pet.petlord"), "legacy package bytes");

    const key = await provisionDefaultPackage({
      dataDirectory,
      defaultPackagePath: join(process.cwd(), "apps/desktop/resources/default.petlord"),
    });
    expect(key).toBe("migrated-active.petlord");
    expect(await readFile(join(dataDirectory, "packages", key), "utf8")).toBe("legacy package bytes");
    expect(await readFile(join(dataDirectory, "active-package.txt"), "utf8")).toBe(key);
    expect(await readFile(join(dataDirectory, "packages", "petlord-bundled-companion.petlord"), "utf8")).toContain("nativePixel");
  });

  it("keeps settings hidden until opened and reuses, focuses, then recreates its native window", () => {
    const { createManagedWindowController } = require("../electron/studio-host.cjs") as {
      createManagedWindowController(createWindow: (showInitially: boolean) => FakeWindow): {
        initialize(): FakeWindow;
        show(): FakeWindow;
      };
    };
    const created: FakeWindow[] = [];
    const windows = createManagedWindowController((showInitially) => {
      const window = new FakeWindow({ show: false });
      window.once("ready-to-show", () => { if (showInitially) window.show(); });
      window.on("close", (event: { preventDefault(): void }) => { event.preventDefault(); window.hide(); });
      created.push(window);
      return window;
    });

    const initial = windows.initialize();
    initial.emit("ready-to-show");
    expect(initial.showCount).toBe(0);

    expect(windows.show()).toBe(initial);
    expect(initial.showCount).toBe(1);
    expect(initial.focusCount).toBe(1);
    const closeEvent = { prevented: false, preventDefault() { this.prevented = true; } };
    initial.emit("close", closeEvent);
    expect(closeEvent.prevented).toBe(true);
    expect(initial.hideCount).toBe(1);
    expect(windows.show()).toBe(initial);
    expect(initial.showCount).toBe(2);

    initial.destroyed = true;
    initial.emit("closed");
    const replacement = windows.show();
    expect(replacement).not.toBe(initial);
    expect(created).toHaveLength(2);
  });

  it("starts the private service without opening Studio and installs packages through its isolated bridge", async () => {
    const { createStudioHost } = require("../electron/studio-host.cjs") as {
      createStudioHost(options: Record<string, unknown>): {
        start(): Promise<{ baseUrl: string }>;
        showStudio(): Promise<FakeWindow>;
        close(): Promise<void>;
      };
    };
    const root = await mkdtemp(join(tmpdir(), "petlord-studio-host-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "user-data");
    const cliPath = join(root, "service", "design-cli.cjs");
    const fakeElectronPath = join(root, "fake-electron");
    const installedPackagePath = join(root, "installed.petlord");
    await mkdir(join(root, "service"), { recursive: true });
    await writeFile(cliPath, "module.exports = {};\n");
    await writeFile(fakeElectronPath, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify({electronRunAsNode:process.env.ELECTRON_RUN_AS_NODE,argv:process.argv.slice(2)}));\n");
    await chmod(fakeElectronPath, 0o700);

    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const windows: FakeWindow[] = [];
    const operations: string[] = [];
    let closed = 0;
    let capturedOptions: Record<string, unknown> | undefined;
    const cookieSession = {
      cookies: {
        async set(cookie: Record<string, unknown>) {
          operations.push(`cookie:${String(cookie.name)}`);
          expect(cookie).toMatchObject({
            url: "http://127.0.0.1:48321",
            name: "petlord_session",
            httpOnly: true,
            sameSite: "strict",
          });
        },
      },
    };
    const host = createStudioHost({
      BrowserWindow: class extends FakeWindow {
        constructor(options: Record<string, unknown>) { super(options); windows.push(this); }
        override async loadURL(url: string) { operations.push(`load:${url}`); await super.loadURL(url); }
      },
      ipcMain: { handle(channel: string, handler: (...args: unknown[]) => unknown) { handlers.set(channel, handler); } },
      session: { fromPartition(partition: string) { expect(partition).toBe("petlord-studio"); return cookieSession; } },
      dataDirectory,
      studioDirectory: join(root, "studio"),
      cliPath,
      mcpPath: join(root, "service", "design-mcp.cjs"),
      electronPath: fakeElectronPath,
      ffmpegPath: join(root, "native", "ffmpeg"),
      foregroundMaskerPath: join(root, "native", "foreground-masker"),
      startServer: async (options: Record<string, unknown>) => {
        capturedOptions = options;
        return { url: "http://127.0.0.1:48321", async close() { closed += 1; } };
      },
      async installPackage(contents: Uint8Array) {
        await writeFile(installedPackagePath, contents);
        return { key: "studio.petlord" };
      },
      showRuntimeSettings() { operations.push("settings"); },
      showPet() { operations.push("pet"); },
    });

    const connection = await host.start();
    expect(connection.baseUrl).toBe("http://127.0.0.1:48321");
    expect(windows).toHaveLength(0);
    expect(capturedOptions).toMatchObject({
      host: "127.0.0.1",
      port: 0,
      runtimeDataDirectory: join(dataDirectory, "design-runtime"),
      studioDirectory: join(root, "studio"),
      ffmpegPath: join(root, "native", "ffmpeg"),
      foregroundMaskerPath: join(root, "native", "foreground-masker"),
    });
    expect(String(capturedOptions?.authToken)).toMatch(/^[a-f0-9]{64}$/);
    expect(capturedOptions?.installPackage).toBeTypeOf("function");

    const descriptorPath = join(dataDirectory, "design-connection.json");
    expect(JSON.parse(await readFile(descriptorPath, "utf8"))).toEqual({
      protocolVersion: 1,
      baseUrl: "http://127.0.0.1:48321",
      token: capturedOptions?.authToken,
      pid: process.pid,
    });
    expect((await stat(descriptorPath)).mode & 0o777).toBe(0o600);

    const launcherPath = join(dataDirectory, "bin", "petlord-design");
    const launched = JSON.parse((await execFileAsync(launcherPath, ["inspect"])).stdout);
    expect(launched).toEqual({
      electronRunAsNode: "1",
      argv: [cliPath, "--connection", descriptorPath, "inspect"],
    });
    expect((await stat(launcherPath)).mode & 0o777).toBe(0o700);
    const mcpLauncher = join(dataDirectory,"bin","petlord-mcp");
    expect(JSON.parse((await execFileAsync(mcpLauncher)).stdout)).toEqual({electronRunAsNode:"1",argv:[join(root,"service","design-mcp.cjs"),"--connection",descriptorPath]});

    const firstWindow = await host.showStudio();
    expect(firstWindow.loadedUrl).toBe("http://127.0.0.1:48321");
    expect(operations.slice(-2)).toEqual(["cookie:petlord_session", "load:http://127.0.0.1:48321"]);
    expect((firstWindow.options.webPreferences as Record<string, unknown>).partition).toBe("petlord-studio");
    expect((firstWindow.options.webPreferences as Record<string, unknown>).preload).toMatch(/studio-preload\.cjs$/);
    expect(firstWindow.showCount).toBe(1);

    expect(await host.showStudio()).toBe(firstWindow);
    expect(firstWindow.focusCount).toBe(1);
    const packageBytes = Uint8Array.from([31, 139, 8, 0]);
    const studioEvent = { sender: firstWindow.webContents, senderFrame: { url: "http://127.0.0.1:48321/workspace" } };
    await handlers.get("studio:install-package")?.(studioEvent, packageBytes);
    expect(await readFile(installedPackagePath)).toEqual(Buffer.from(packageBytes));
    await handlers.get("studio:show-runtime-settings")?.(studioEvent);
    await handlers.get("studio:show-pet")?.(studioEvent);
    expect(operations).toContain("settings");
    expect(operations).toContain("pet");

    const externalNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
    firstWindow.webContents.emit("will-navigate", externalNavigation, "https://example.com/steal");
    expect(externalNavigation.prevented).toBe(true);
    const internalNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
    firstWindow.webContents.emit("will-navigate", internalNavigation, "http://127.0.0.1:48321/projects/petlord");
    expect(internalNavigation.prevented).toBe(false);
    expect(firstWindow.webContents.openHandler?.({ url: "https://example.com/popup" })).toEqual({ action: "deny" });
    await expect(Promise.resolve().then(() => handlers.get("studio:show-pet")?.({
      sender: firstWindow.webContents,
      senderFrame: { url: "https://example.com/embedded" },
    }))).rejects.toThrow("PetLord Studio origin");

    const studioCloseEvent = { prevented: false, preventDefault() { this.prevented = true; } };
    firstWindow.emit("close", studioCloseEvent);
    expect(studioCloseEvent.prevented).toBe(true);
    expect(firstWindow.hideCount).toBe(1);
    expect(await host.showStudio()).toBe(firstWindow);
    firstWindow.destroyed = true;
    firstWindow.emit("closed");
    const reopenedWindow = await host.showStudio();
    expect(reopenedWindow).not.toBe(firstWindow);
    expect(windows).toHaveLength(2);

    await host.close();
    expect(closed).toBe(1);
    await expect(readFile(descriptorPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("opens an installed pet's linked project without reloading an existing Studio window", async () => {
    const { createStudioHost } = require("../electron/studio-host.cjs") as {
      createStudioHost(options: Record<string, unknown>): {
        openInstalledPackage(key: string): Promise<FakeWindow>;
        close(): Promise<void>;
      };
    };
    const root = await mkdtemp(join(tmpdir(), "petlord-studio-linked-project-"));
    temporaryDirectories.push(root);
    const cliPath = join(root, "design-cli.cjs");
    await writeFile(cliPath, "module.exports = {};\n");
    const windows: FakeWindow[] = [];
    const host = createStudioHost({
      BrowserWindow: class extends FakeWindow {
        constructor(options: Record<string, unknown>) { super(options); windows.push(this); }
      },
      ipcMain: { handle() {} },
      session: { fromPartition() { return { cookies: { async set() {} } }; } },
      dataDirectory: join(root, "user-data"),
      studioDirectory: join(root, "studio"),
      cliPath,
      electronPath: process.execPath,
      async startServer() {
        return {
          url: "http://127.0.0.1:48324",
          async getInstalledPackageBindings() {
            return [{ packageKey: "linked.petlord", projectId: "project-from-installed-pet", appliedRevision: 7 }];
          },
          async close() {},
        };
      },
      async installPackage() {},
      async getInstalledPackageStatus() { return undefined; },
      async showRuntimeSettings() {},
      async showPet() {},
    });

    const opened = await host.openInstalledPackage("linked.petlord");
    const loaded = new URL(opened.loadedUrl!);
    expect(loaded.origin).toBe("http://127.0.0.1:48324");
    expect(loaded.searchParams.get("project")).toBe("project-from-installed-pet");
    expect(loaded.searchParams.get("page")).toBe("edit");

    const reopened = await host.openInstalledPackage("linked.petlord");
    expect(reopened).toBe(opened);
    expect(windows).toHaveLength(1);
    expect(opened.webContents.sent).toContainEqual({
      channel: "studio:open-project",
      values: ["project-from-installed-pet"],
    });
    await expect(host.openInstalledPackage("missing.petlord")).rejects.toThrow(/关联|linked/i);
    await host.close();
  });

  it("repairs a deleted installed project before opening Edit in the existing Studio window", async () => {
    const { createStudioHost } = require("../electron/studio-host.cjs");
    const root = await mkdtemp(join(tmpdir(), "petlord-studio-repair-project-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root,"desktop");
    const packages = join(dataDirectory,"packages"); await mkdir(packages,{recursive:true});
    await writeFile(join(packages,"retained.petlord"),await readFile("apps/desktop/resources/default.petlord"));
    const cliPath = join(root,"design-cli.cjs"); await writeFile(cliPath,"module.exports = {};\n");
    let api!: Awaited<ReturnType<typeof startPetLordServer>>;
    const host = createStudioHost({
      BrowserWindow: FakeWindow,
      ipcMain: {handle() {}},
      session: {fromPartition() {return {cookies:{async set() {}}};}},
      dataDirectory, studioDirectory:join(root,"studio"),cliPath,electronPath:process.execPath,
      async startServer() {
        api = await startPetLordServer({port:0,runtimeDataDirectory:join(root,"design"),installedPackagesDirectory:packages});
        return api;
      },
      async installPackage() {},async showRuntimeSettings() {},async showPet() {},
    });
    const invoke = async (command:string,extra:object={})=>await (await fetch(api.url+"/api/design/v1/execute",{
      method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:crypto.randomUUID(),command,input:{},...extra}),
    })).json() as any;
    try {
      const window = await host.openInstalledPackage("retained.petlord");
      const [project] = (await invoke("project.list")).result;
      const deleted = await invoke("project.delete",{projectId:project.id,expectedRevision:project.revision});
      expect(deleted.error).toBeUndefined();
      expect((await invoke("project.list")).result).toEqual([]);
      expect(await host.openInstalledPackage("retained.petlord")).toBe(window);
      const restored = await invoke("project.get",{projectId:project.id});
      expect(restored.error).toBeUndefined();
      expect(restored.result.revision).toBeGreaterThan(deleted.result.revision);
      expect(window.webContents.sent).toContainEqual({channel:"studio:open-project",values:[project.id]});
    } finally {await host.close();}
  });

  it("closes a service that finishes starting while the application is quitting", async () => {
    const { createStudioHost } = require("../electron/studio-host.cjs") as {
      createStudioHost(options: Record<string, unknown>): {
        start(): Promise<unknown>;
        close(): Promise<void>;
      };
    };
    const root = await mkdtemp(join(tmpdir(), "petlord-studio-shutdown-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "user-data");
    const cliPath = join(root, "design-cli.cjs");
    await writeFile(cliPath, "module.exports = {};\n");
    let releaseServer!: (service: { url: string; close(): Promise<void> }) => void;
    let signalStart!: () => void;
    let closed = 0;
    const startInvoked = new Promise<void>((resolve) => { signalStart = resolve; });
    const serverPending = new Promise<{ url: string; close(): Promise<void> }>((resolve) => { releaseServer = resolve; });
    const host = createStudioHost({
      BrowserWindow: FakeWindow,
      ipcMain: { handle() {} },
      session: { fromPartition() { return { cookies: { async set() {} } }; } },
      dataDirectory,
      studioDirectory: join(root, "studio"),
      cliPath,
      electronPath: process.execPath,
      startServer() { signalStart(); return serverPending; },
      async installPackage() {},
      async showRuntimeSettings() {},
      async showPet() {},
    });

    const starting = host.start();
    await startInvoked;
    const closing = host.close();
    releaseServer({ url: "http://127.0.0.1:48322", async close() { closed += 1; } });
    await Promise.allSettled([starting, closing]);

    expect(closed).toBe(1);
    await expect(readFile(join(dataDirectory, "design-connection.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("destroys a Studio window whose initial load fails and retries with a new window", async () => {
    const { createStudioHost } = require("../electron/studio-host.cjs") as {
      createStudioHost(options: Record<string, unknown>): {
        showStudio(): Promise<FakeWindow>;
        close(): Promise<void>;
      };
    };
    const root = await mkdtemp(join(tmpdir(), "petlord-studio-retry-"));
    temporaryDirectories.push(root);
    const cliPath = join(root, "design-cli.cjs");
    await writeFile(cliPath, "module.exports = {};\n");
    const windows: FakeWindow[] = [];
    const host = createStudioHost({
      BrowserWindow: class extends FakeWindow {
        constructor(options: Record<string, unknown>) { super(options); windows.push(this); }
        override async loadURL(url: string) {
          if (windows.length === 1) throw new Error("Studio load failed");
          await super.loadURL(url);
        }
      },
      ipcMain: { handle() {} },
      session: { fromPartition() { return { cookies: { async set() {} } }; } },
      dataDirectory: join(root, "user-data"),
      studioDirectory: join(root, "studio"),
      cliPath,
      electronPath: process.execPath,
      async startServer() { return { url: "http://127.0.0.1:48323", async close() {} }; },
      async installPackage() {},
      async showRuntimeSettings() {},
      async showPet() {},
    });

    await expect(host.showStudio()).rejects.toThrow("Studio load failed");
    expect(windows[0].destroyed).toBe(true);
    const recovered = await host.showStudio();
    expect(recovered).toBe(windows[1]);
    expect(recovered.loadedUrl).toBe("http://127.0.0.1:48323");
    await host.close();
  });
});
