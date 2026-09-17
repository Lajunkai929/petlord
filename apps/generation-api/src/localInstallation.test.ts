import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { startPetLordServer } from "./appServer";
import { decodeInstalledPackage } from "./installedPackages";

const require = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

function packageBytes(id: string, name: string) {
  const image = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFgAI/ScL+WQAAAABJRU5ErkJggg==";
  return Buffer.from(JSON.stringify({
    format: "petlord-package",
    bundleVersion: 1,
    createdAt: "2026-09-10T08:00:00.000Z",
    manifest: {
      manifestVersion: 1,
      id,
      name,
      characterName: name,
      initialStateId: "ready",
      states: [{ id: "ready", logicalStateId: "ready-state", label: "Ready", imageUri: image, origin: "initial" }],
      transitions: [],
      logicalStates: [{
        id: "ready-state",
        label: "Ready",
        variantIds: ["ready"],
        idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true },
      }],
      semanticActions: { idle: "ready-state" },
      plugins: [],
    },
    assets: {},
  }));
}

describe("local project installation bindings", () => {
  it("serializes a pending installed-package sync with file replacement and applied-revision recording", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-local-apply-race-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "desktop");
    const packagesDirectory = join(dataDirectory, "packages");
    await mkdir(packagesDirectory, { recursive: true });
    const { createDesktopPackageStore } = require("../../desktop/electron/package-store.cjs");
    const store = createDesktopPackageStore({ dataDirectory });
    const installed = await store.installPackage(packageBytes("race", "Before apply"), { mode: "new" });
    let signalFileWritten!: () => void;
    let releaseInstall!: () => void;
    const fileWritten = new Promise<void>(resolve => { signalFileWritten = resolve; });
    const installCanFinish = new Promise<void>(resolve => { releaseInstall = resolve; });
    let holdInstall = false;
    const api = await startPetLordServer({
      port: 0,
      runtimeDataDirectory: join(root, "design"),
      installedPackagesDirectory: packagesDirectory,
      getInstalledPackageStatus: (key: string) => store.getPackageStatus(key),
      installPackage: async (contents: Uint8Array, options: { mode: string; targetKey?: string }) => {
        const result = await store.installPackage(contents, options);
        if (holdInstall) {
          signalFileWritten();
          await installCanFinish;
        }
        return result;
      },
    });
    const invoke = async (command: string, input: unknown = {}, extra: Record<string, unknown> = {}) => {
      const response = await fetch(`${api.url}/api/design/v1/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), command, input, ...extra }),
      });
      return { status: response.status, body: await response.json() as any };
    };

    try {
      const [project] = (await invoke("project.list")).body.result as Array<{ id: string; revision: number }>;
      const updated = await invoke("project.update", { patch: { name: "After apply" } }, {
        projectId: project.id,
        expectedRevision: project.revision,
      });
      const appliedRevision = updated.body.result.revision as number;
      holdInstall = true;
      const applying = invoke("package.install", {}, { projectId: project.id, expectedRevision: appliedRevision });
      await fileWritten;
      const syncing = api.syncInstalledPackages();
      releaseInstall();

      const [applied] = await Promise.all([applying, syncing]);
      expect(applied.status, JSON.stringify(applied.body.error)).toBe(200);
      expect((await invoke("project.list")).body.result).toHaveLength(1);
      expect((await api.getInstalledPackageBindings())).toEqual([{
        packageKey: installed.key,
        projectId: project.id,
        appliedRevision,
      }]);

      const updatedAgain = await invoke("project.update", { patch: { name: "Sync started first" } }, {
        projectId: project.id,
        expectedRevision: appliedRevision,
      });
      const secondAppliedRevision = updatedAgain.body.result.revision as number;
      holdInstall = false;
      const syncStartedFirst = api.syncInstalledPackages();
      const secondApply = invoke("package.install", {}, { projectId: project.id, expectedRevision: secondAppliedRevision });
      const [, secondApplied] = await Promise.all([syncStartedFirst, secondApply]);
      expect(secondApplied.status, JSON.stringify(secondApplied.body.error)).toBe(200);
      expect((await invoke("project.list")).body.result).toHaveLength(1);
      expect(await api.getInstalledPackageBindings()).toEqual([{
        packageKey: installed.key,
        projectId: project.id,
        appliedRevision: secondAppliedRevision,
      }]);
    } finally {
      releaseInstall();
      await api.close();
    }
  });

  it.each([false, true])("updates a renamed imported project independently by key and survives restart (identical retained copy: %s)", async (identicalCopy) => {
    const root = await mkdtemp(join(tmpdir(), "petlord-local-apply-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "desktop");
    const packagesDirectory = join(dataDirectory, "packages");
    await mkdir(packagesDirectory, { recursive: true });
    const { createDesktopPackageStore } = require("../../desktop/electron/package-store.cjs");
    const store = createDesktopPackageStore({ dataDirectory });
    const first = await store.installPackage(packageBytes("first", "First pet"), { mode: "new" });
    const second = await store.installPackage(identicalCopy ? packageBytes("first", "First pet") : packageBytes("second", "Second pet"), { mode: "new" });
    const secondBefore = await readFile(join(packagesDirectory, second.key));
    const installCalls: Array<{ mode: string; targetKey?: string }> = [];
    const runtimeDataDirectory = join(root, "design");
    const serverOptions = {
      port: 0,
      runtimeDataDirectory,
      installedPackagesDirectory: packagesDirectory,
      getInstalledPackageStatus: (key: string) => store.getPackageStatus(key),
      installPackage: async (contents: Uint8Array, options: { mode: string; targetKey?: string }) => {
        installCalls.push(options);
        return store.installPackage(contents, options);
      },
    };
    let api = await startPetLordServer(serverOptions);
    const invoke = async (command: string, input: unknown = {}, extra: Record<string, unknown> = {}) => {
      const response = await fetch(`${api.url}/api/design/v1/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), command, input, ...extra }),
      });
      return { status: response.status, body: await response.json() as any };
    };

    try {
      const projects = (await invoke("project.list")).body.result as Array<{ id: string; revision: number }>;
      const syncDiagnostic = projects.length ? undefined : (await invoke("package.syncInstalled")).body.result;
      expect(projects, JSON.stringify(syncDiagnostic)).toHaveLength(2);
      const statuses = await Promise.all(projects.map(async project => ({
        project,
        status: (await invoke("package.installation.get", {}, { projectId: project.id })).body.result,
      })));
      const linked = statuses.find(item => item.status.packageKey === first.key)!;
      expect(linked).toBeTruthy();
      const other = statuses.find(item => item.status.packageKey === second.key)!;
      expect(other).toBeTruthy();
      expect(other.project.id).not.toBe(linked.project.id);
      const otherProjectBefore = (await invoke("project.get", {}, { projectId: other.project.id })).body.result;
      expect(linked.status).toMatchObject({
        available: true,
        linked: true,
        packageKey: first.key,
        active: false,
        exists: true,
        hasDraftChanges: false,
        appliedRevision: linked.project.revision,
        currentRevision: linked.project.revision,
      });

      const renamed = await invoke("project.update", { patch: { name: "Renamed locally" } }, {
        projectId: linked.project.id,
        expectedRevision: linked.project.revision,
      });
      expect(renamed.status, JSON.stringify(renamed.body.error)).toBe(200);
      const revision = renamed.body.result.revision as number;
      expect((await invoke("package.installation.get", {}, { projectId: linked.project.id })).body.result)
        .toMatchObject({ packageKey: first.key, active: false, hasDraftChanges: true, currentRevision: revision });

      const applied = await invoke("package.install", {}, { projectId: linked.project.id, expectedRevision: revision });
      expect(applied.status, JSON.stringify(applied.body.error)).toBe(200);
      expect(installCalls.at(-1)).toEqual({ mode: "replace", targetKey: first.key });
      expect(applied.body.result.binding).toMatchObject({
        packageKey: first.key,
        active: true,
        appliedRevision: revision,
        hasDraftChanges: false,
      });
      expect(decodeInstalledPackage(await readFile(join(packagesDirectory, first.key))).manifest.name).toBe("Renamed locally");
      expect(await readFile(join(packagesDirectory, second.key))).toEqual(secondBefore);
      expect((await invoke("project.get", {}, { projectId: other.project.id })).body.result).toEqual(otherProjectBefore);
      const otherEdited = await invoke("project.update", { patch: { name: "Other independent edit" } }, {
        projectId: other.project.id, expectedRevision: other.project.revision,
      });
      expect(otherEdited.status).toBe(200);
      const otherApplied = await invoke("package.install", {}, { projectId: other.project.id, expectedRevision: otherEdited.body.result.revision });
      expect(otherApplied.status, JSON.stringify(otherApplied.body.error)).toBe(200);
      expect(otherApplied.body.result.binding.packageKey).toBe(second.key);
      expect(decodeInstalledPackage(await readFile(join(packagesDirectory, first.key))).manifest.name).toBe("Renamed locally");

      await api.close();
      api = await startPetLordServer(serverOptions);
      expect((await invoke("project.list")).body.result).toHaveLength(2);
      expect((await invoke("package.syncInstalled")).body.result.imported).toEqual([]);
      expect((await invoke("project.list")).body.result).toHaveLength(2);
      expect((await invoke("package.installation.get", {}, { projectId: linked.project.id })).body.result)
        .toMatchObject({ packageKey: first.key, active: false, hasDraftChanges: false, appliedRevision: revision });
    } finally {
      await api.close();
    }
  });

  it("creates a distinct installation for an unlinked same-name project and rejects stale or missing linked targets", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-local-apply-"));
    temporaryDirectories.push(root);
    const dataDirectory = join(root, "desktop");
    const packagesDirectory = join(dataDirectory, "packages");
    await mkdir(packagesDirectory, { recursive: true });
    const { createDesktopPackageStore } = require("../../desktop/electron/package-store.cjs");
    const store = createDesktopPackageStore({ dataDirectory });
    const existing = await store.installPackage(packageBytes("existing", "Same name"), { mode: "new" });
    const calls: Array<{ mode: string; targetKey?: string }> = [];
    const api = await startPetLordServer({
      port: 0,
      runtimeDataDirectory: join(root, "design"),
      installedPackagesDirectory: packagesDirectory,
      getInstalledPackageStatus: (key: string) => store.getPackageStatus(key),
      installPackage: async (contents: Uint8Array, options: { mode: string; targetKey?: string }) => {
        calls.push(options);
        return store.installPackage(contents, options);
      },
    });
    const invoke = async (command: string, input: unknown = {}, extra: Record<string, unknown> = {}) => {
      const response = await fetch(`${api.url}/api/design/v1/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), command, input, ...extra }),
      });
      return { status: response.status, body: await response.json() as any };
    };

    try {
      const fresh = await invoke("pixel.example.create", { id: "fresh-same-name", name: "Same name" });
      const freshRevision = fresh.body.result.revision as number;
      expect((await invoke("package.installation.get", {}, { projectId: "fresh-same-name" })).body.result)
        .toMatchObject({ available: true, linked: false, hasDraftChanges: true });
      const installed = await invoke("package.install", {}, { projectId: "fresh-same-name", expectedRevision: freshRevision });
      expect(installed.status, JSON.stringify(installed.body.error)).toBe(200);
      expect(calls.at(-1)).toEqual({ mode: "new" });
      expect(installed.body.result.binding.packageKey).not.toBe(existing.key);
      expect(await store.listPackages()).toHaveLength(2);

      const changed = await invoke("project.update", { patch: { name: "Draft after install" } }, {
        projectId: "fresh-same-name",
        expectedRevision: freshRevision,
      });
      const callsBeforeStale = calls.length;
      const stale = await invoke("package.install", {}, { projectId: "fresh-same-name", expectedRevision: freshRevision });
      expect(stale.status).toBe(409);
      expect(stale.body.error.code).toBe("REVISION_CONFLICT");
      expect(calls).toHaveLength(callsBeforeStale);

      const linkedKey = installed.body.result.binding.packageKey as string;
      await store.activatePackage(existing.key);
      await unlink(join(packagesDirectory, linkedKey));
      expect((await invoke("package.installation.get", {}, { projectId: "fresh-same-name" })).body.result)
        .toMatchObject({ linked: true, exists: false, active: false, hasDraftChanges: true });
      const missing = await invoke("package.install", {}, {
        projectId: "fresh-same-name",
        expectedRevision: changed.body.result.revision,
      });
      expect(missing.status).toBe(404);
      expect(calls).toHaveLength(callsBeforeStale);
      expect((await store.listPackages()).map((item: { key: string }) => item.key)).toEqual([existing.key]);
    } finally {
      await api.close();
    }
  });
});
