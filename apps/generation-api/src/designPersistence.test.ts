import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteStore } from "./sqliteStore";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const remove of cleanup.splice(0)) await remove(); });
async function database() {
  const directory = await mkdtemp(join(tmpdir(), "petlord-design-revision-"));
  const path = join(directory, "test.sqlite");
  const store = new SqliteStore(path);
  cleanup.push(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return { store, path };
}

describe("design workspace transactions", () => {
  it("prevents a stale agent from overwriting a human edit from a second connection", async () => {
    const { store, path } = await database();
    store.upsertEntity("project", "p", { id: "p", name: "initial" });
    const observed = store.getEntitySnapshot<{ id: string; name: string }>("project", "p")!;
    const human = new SqliteStore(path);
    try { human.upsertEntity("project", "p", { id: "p", name: "human edit" }); } finally { human.close(); }
    expect(() => store.commitEntityCommand({ type: "project", id: "p", expectedRevision: observed.revision, data: { id: "p", name: "stale agent" }, requestId: "request-1", requestHash: "hash-1" }, value => value)).toThrow(/revision|changed/i);
    expect(store.getEntitySnapshot("project", "p")?.data).toEqual({ id: "p", name: "human edit" });
    expect(store.getDesignReceipt("request-1")).toBeUndefined();
  });

  it("commits the workspace update and replayable result atomically", async () => {
    const { store } = await database();
    const request = { type: "project" as const, id: "p", expectedRevision: null, data: { id: "p", name: "created" }, requestId: "create-1", requestHash: "hash-1" };
    const first = store.commitEntityCommand(request, snapshot => ({ snapshot, value: "saved" }));
    const second = store.commitEntityCommand(request, () => { throw new Error("Replay must not execute again"); });
    expect(second).toEqual(first);
    expect(store.listEntities("project")).toHaveLength(1);
    expect(() => store.commitEntityCommand({ ...request, requestHash: "different-input" }, value => value)).toThrow(/request|reused/i);
    expect(store.getEntitySnapshot("project", "p")?.revision).toBe(first.snapshot.revision);
  });

  it("rolls back both the project and receipt if response construction fails", async () => {
    const { store } = await database();
    expect(() => store.commitEntityCommand({ type: "project", id: "p", expectedRevision: null, data: { id: "p" }, requestId: "create-1", requestHash: "hash-1" }, () => { throw new Error("Cannot produce response"); })).toThrow("Cannot produce response");
    expect(store.listEntities("project")).toEqual([]);
    expect(store.getDesignReceipt("create-1")).toBeUndefined();
  });

  it("never reuses a revision after deletion and recreation", async () => {
    const { store } = await database();
    store.upsertEntity("project", "p", { id: "p" });
    const old = store.getEntitySnapshot("project", "p")!;
    store.deleteEntity("project", "p");
    store.upsertEntity("project", "p", { id: "p" });
    expect(store.getEntitySnapshot("project", "p")!.revision).toBeGreaterThan(old.revision);
  });

  it("atomically records queued generation and its request receipt before work can start", async () => {
    const { store } = await database();
    const job = { id: "job-1", status: "queued", createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z" };
    expect(() => store.commitDesignOperation("request", "hash", () => {
      store.upsertGenerationJob(job);
      throw new Error("interrupted before receipt");
    })).toThrow("interrupted before receipt");
    expect(store.listGenerationJobs()).toEqual([]);
    const first = store.commitDesignOperation("request", "hash", () => { store.upsertGenerationJob(job); return { job }; });
    const replay = store.commitDesignOperation("request", "hash", () => { throw new Error("must not submit again"); });
    expect(replay).toEqual(first);
    expect(store.listGenerationJobs()).toEqual([job]);
  });
});
