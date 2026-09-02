import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AtomicJsonFileWriter } from "./atomicJsonFile";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("AtomicJsonFileWriter", () => {
  it("serializes concurrent snapshots without rename races or truncated JSON", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petlord-atomic-json-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "nested", "jobs.json");
    const writer = new AtomicJsonFileWriter(filePath);
    const snapshots = Array.from({ length: 50 }, (_, index) => ({ index, jobs: Array.from({ length: index + 1 }, (_, id) => ({ id })) }));

    await Promise.all(snapshots.map((snapshot) => writer.write(snapshot)));

    expect(JSON.parse(await readFile(filePath, "utf8"))).toEqual(snapshots.at(-1));
  });
});
