import { afterEach, describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const require = createRequire(import.meta.url);
const {
  preparePetLordDataDirectory,
  resolvePetLordDataDirectory,
} = require("../electron/storage-paths.cjs") as {
  preparePetLordDataDirectory(targetDirectory: string, legacyDirectory?: string): Promise<string[]>;
  resolvePetLordDataDirectory(environment?: Record<string, string | undefined>, homeDirectory?: string): string;
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("desktop data directory", () => {
  it("uses ~/.petlord unless an explicit test override is present", () => {
    expect(resolvePetLordDataDirectory({}, "/Users/friend")).toBe("/Users/friend/.petlord");
    expect(resolvePetLordDataDirectory({ PETLORD_USER_DATA_DIR: "/tmp/petlord-test" }, "/Users/friend"))
      .toBe("/tmp/petlord-test");
  });

  it("copies managed legacy data once without overwriting new data", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-storage-"));
    temporaryDirectories.push(root);
    const legacy = join(root, "legacy");
    const target = join(root, "home", ".petlord");
    await mkdir(join(legacy, "packages"), { recursive: true });
    await writeFile(join(legacy, "packages", "old.petlord"), "old package");
    await writeFile(join(legacy, "runtime-settings.json"), "old settings");

    expect(await preparePetLordDataDirectory(target, legacy)).toEqual(["packages", "runtime-settings.json"]);
    expect(await readFile(join(target, "packages", "old.petlord"), "utf8")).toBe("old package");

    await writeFile(join(target, "runtime-settings.json"), "new settings");
    expect(await preparePetLordDataDirectory(target, legacy)).toEqual([]);
    expect(await readFile(join(target, "runtime-settings.json"), "utf8")).toBe("new settings");
  });
});
