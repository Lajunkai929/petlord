import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function packageBytes(id: string, name: string) {
  return Buffer.from(JSON.stringify({
    format: "petlord-package",
    bundleVersion: 1,
    createdAt: "2026-09-09T08:00:00.000Z",
    manifest: {
      manifestVersion: 1,
      id,
      name,
      characterName: "Test Pet",
      initialStateId: "ready",
      states: [{ id: "ready", logicalStateId: "ready-state", label: "Ready", imageUri: "data:image/png;base64,AA==", origin: "initial" }],
      transitions: [],
      logicalStates: [{ id: "ready-state", label: "Ready", variantIds: ["ready"] }],
      semanticActions: { idle: "ready-state" },
      plugins: [],
    },
    assets: {},
  }));
}

describe("desktop package store", () => {
  it("keeps every existing import when the library grows beyond thirty pets", async () => {
    const { createDesktopPackageStore } = require("../electron/package-store.cjs");
    const dataDirectory = await mkdtemp(join(tmpdir(),"petlord-large-library-"));
    temporaryDirectories.push(dataDirectory);
    await mkdir(join(dataDirectory,"packages"));
    for (let index=0;index<31;index++) await writeFile(join(dataDirectory,"packages",`existing-${index}.petlord`),packageBytes(`pet-${index}`,`Pet ${index}`));
    const store = createDesktopPackageStore({dataDirectory,async onPackageChanged(){}});
    await store.installPackage(packageBytes("new","New Pet"),{mode:"new"});
    expect(await store.listPackages()).toHaveLength(32);
    expect(await readFile(join(dataDirectory,"packages","existing-0.petlord"))).toEqual(packageBytes("pet-0","Pet 0"));
  });
  it("installs exact package bytes, activates them, and returns them to the runtime", async () => {
    const { createDesktopPackageStore } = require("../electron/package-store.cjs") as {
      createDesktopPackageStore(options: { dataDirectory: string; onPackageChanged(contents: Buffer): Promise<void> }): {
        installPackage(contents: Buffer, options: { mode: "new" }): Promise<{ key: string; active: boolean }>;
        loadActivePackage(): Promise<Buffer>;
        listPackages(): Promise<Array<{ key: string; active: boolean }>>;
      };
    };
    const dataDirectory = await mkdtemp(join(tmpdir(), "petlord-package-store-"));
    temporaryDirectories.push(dataDirectory);
    let runtimeSelection: Buffer | undefined;
    const store = createDesktopPackageStore({
      dataDirectory,
      async onPackageChanged(contents: Buffer) { runtimeSelection = Buffer.from(contents); },
    });
    const encoded = packageBytes("studio-installed", "Studio Installed Pet");

    const summary = await store.installPackage(encoded, { mode: "new" });

    expect(summary.active).toBe(true);
    expect(await readFile(join(dataDirectory, "packages", summary.key))).toEqual(encoded);
    expect((await readFile(join(dataDirectory, "active-package.txt"), "utf8")).trim()).toBe(summary.key);
    expect(await store.loadActivePackage()).toEqual(encoded);
    expect(runtimeSelection).toEqual(encoded);
    expect(await store.listPackages()).toEqual([expect.objectContaining({ key: summary.key, active: true })]);
  });

  it("rejects an explicit replacement when its installation key no longer exists", async () => {
    const { createDesktopPackageStore } = require("../electron/package-store.cjs");
    const dataDirectory = await mkdtemp(join(tmpdir(), "petlord-package-store-"));
    temporaryDirectories.push(dataDirectory);
    const store = createDesktopPackageStore({ dataDirectory });

    await expect(store.installPackage(packageBytes("replacement", "Replacement"), {
      mode: "replace",
      targetKey: "missing.petlord",
    })).rejects.toThrow(/不存在/);
    expect(await store.listPackages()).toEqual([]);
  });

  it("checks one installation's existence and active marker without parsing package media", async () => {
    const { createDesktopPackageStore } = require("../electron/package-store.cjs");
    const dataDirectory = await mkdtemp(join(tmpdir(), "petlord-package-status-"));
    temporaryDirectories.push(dataDirectory);
    await mkdir(join(dataDirectory, "packages"));
    await writeFile(join(dataDirectory, "packages", "large-existing.petlord"), "status lookup must not parse this file");
    await writeFile(join(dataDirectory, "active-package.txt"), "large-existing.petlord");
    const store = createDesktopPackageStore({ dataDirectory });

    expect(await store.getPackageStatus("large-existing.petlord")).toEqual({ key: "large-existing.petlord", active: true });
    expect(await store.getPackageStatus("missing.petlord")).toBeUndefined();
  });

  it("creates a second key when the same package is explicitly installed as new twice", async () => {
    const { createDesktopPackageStore } = require("../electron/package-store.cjs");
    const dataDirectory = await mkdtemp(join(tmpdir(), "petlord-package-collision-"));
    temporaryDirectories.push(dataDirectory);
    const store = createDesktopPackageStore({ dataDirectory });
    const encoded = packageBytes("same", "Same pet");

    const first = await store.installPackage(encoded, { mode: "new" });
    const second = await store.installPackage(encoded, { mode: "new" });

    expect(second.key).not.toBe(first.key);
    expect(await store.listPackages()).toHaveLength(2);
    expect(await readFile(join(dataDirectory, "packages", first.key))).toEqual(encoded);
    expect(await readFile(join(dataDirectory, "packages", second.key))).toEqual(encoded);
  });

  it("uses exclusive creation for concurrent sanitized-id collisions", async () => {
    const { createDesktopPackageStore } = require("../electron/package-store.cjs");
    const dataDirectory = await mkdtemp(join(tmpdir(), "petlord-package-collision-"));
    temporaryDirectories.push(dataDirectory);
    const store = createDesktopPackageStore({ dataDirectory });
    const slash = packageBytes("a/b", "Slash pet");
    const question = packageBytes("a?b", "Question pet");

    const installed = await Promise.all([
      store.installPackage(slash, { mode: "new" }),
      store.installPackage(question, { mode: "new" }),
    ]);

    expect(new Set(installed.map((item: { key: string }) => item.key)).size).toBe(2);
    expect(await readFile(join(dataDirectory, "packages", installed[0].key))).toEqual(slash);
    expect(await readFile(join(dataDirectory, "packages", installed[1].key))).toEqual(question);
  });
});
