import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { PublishedPackageLibrary, decodeAndVerifyPublishedPackage } from "./publishedPackageLibrary";

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("published desktop package library", () => {
  it("publishes an immutable package and exposes a subscription summary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petlord-package-library-"));
    directories.push(directory);
    const library = new PublishedPackageLibrary(directory);
    const contents = await readFile(new URL("../../desktop/public/demo/sample-v2.petlord", import.meta.url));
    const first = await library.publish(contents);
    const duplicate = await library.publish(contents);
    expect(duplicate.publicationId).toBe(first.publicationId);
    expect(first.downloadPath).toBe(`/api/library/packages/${first.publicationId}/download`);
    expect(first.name).toBeTruthy();
    expect(await library.list()).toEqual([expect.objectContaining({ publicationId: first.publicationId, sizeBytes: contents.byteLength })]);
    expect((await readdir(directory)).sort()).toEqual([`${first.publicationId}.json`, `${first.publicationId}.petlord`]);
    expect(await library.read(first.publicationId)).toEqual(contents);
  });

  it("rejects corrupted or unsupported package bytes", async () => {
    expect(() => decodeAndVerifyPublishedPackage(new TextEncoder().encode("not a package"))).toThrow();
  });
});
