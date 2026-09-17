import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { applyProjectToDevice, publishEncodedPackage, readLocalInstallation } from "./publishPackageTransport";

const require = createRequire(import.meta.url);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Studio package publishing transport", () => {
  it("installs and activates through the desktop bridge when Studio is embedded", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-studio-publish-"));
    temporaryDirectories.push(root);
    const { createDesktopPackageStore } = require("../../../desktop/electron/package-store.cjs") as {
      createDesktopPackageStore(options: { dataDirectory: string }): {
        installPackage(contents: Uint8Array, options: { mode: "new" }): Promise<{ key: string; active: boolean }>;
        loadActivePackage(): Promise<Buffer>;
      };
    };
    const store = createDesktopPackageStore({ dataDirectory: root });
    const encoded = await readFile(new URL("../../../desktop/resources/default.petlord", import.meta.url));
    const result = await publishEncodedPackage(encoded, {
      installPackage: (contents) => store.installPackage(contents, { mode: "new" }),
      async showPet() {},
      async showRuntimeSettings() {},
    });

    expect(result.kind).toBe("desktop-install");
    const summary = result.value as { key: string; active: boolean };
    expect(summary.active).toBe(true);
    expect(await readFile(join(root, "packages", summary.key))).toEqual(encoded);
    expect((await readFile(join(root, "active-package.txt"), "utf8")).trim()).toBe(summary.key);
    expect(await store.loadActivePackage()).toEqual(encoded);
  });

  it("retains HTTP library publishing when no desktop bridge is present", async () => {
    const encoded = Uint8Array.from([1, 2, 3]);
    const expected = { publicationId: "a".repeat(64), name: "PetLord" };
    const result = await publishEncodedPackage(encoded, undefined, async (input, init) => {
      expect(input).toBe("/api/library/packages");
      expect(init).toMatchObject({ method: "POST", headers: { "Content-Type": "application/vnd.petlord.package+gzip" } });
      expect(init?.body).toEqual(encoded);
      return new Response(JSON.stringify(expected), { status: 201, headers: { "Content-Type": "application/json" } });
    });

    expect(result).toEqual({ kind: "library-publish", value: expected });
  });

  it("saves the current draft and applies its returned CAS revision", async () => {
    const requests: Array<{ url: string; body: any }> = [];
    const result = await applyProjectToDevice("project-one", async () => ({
      data: { id: "project-one" },
      revision: 42,
    }), async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ result: { binding: { linked: true, active: true, appliedRevision: 42 } } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    expect(requests).toEqual([{
      url: "/api/design/v1/execute",
      body: expect.objectContaining({
        command: "package.install",
        projectId: "project-one",
        expectedRevision: 42,
        input: {},
      }),
    }]);
    expect(result).toEqual({ binding: { linked: true, active: true, appliedRevision: 42 } });
  });

  it("does not request installation when saving the draft fails", async () => {
    let requested = false;
    await expect(applyProjectToDevice("project-one", async () => {
      throw new Error("草稿保存失败");
    }, async () => {
      requested = true;
      return new Response();
    })).rejects.toThrow("草稿保存失败");
    expect(requested).toBe(false);
  });

  it("reads local status and preserves a stale-revision failure message", async () => {
    const status = await readLocalInstallation("project-one", async () => new Response(JSON.stringify({
      result: { available: true, linked: true, active: false, hasDraftChanges: true, currentRevision: 9, appliedRevision: 7 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    expect(status).toMatchObject({ linked: true, active: false, currentRevision: 9, appliedRevision: 7 });

    await expect(applyProjectToDevice("project-one", async () => ({ data: { id: "project-one" }, revision: 9 }), async () => new Response(JSON.stringify({
      error: { code: "REVISION_CONFLICT", message: "项目已有更新，请保留草稿并重试。" },
    }), { status: 409, headers: { "Content-Type": "application/json" } }))).rejects.toThrow("项目已有更新，请保留草稿并重试。");
  });
});
