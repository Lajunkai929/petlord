import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { startPetLordServer } from "../../generation-api/src/appServer";
import { createWorkspaceClient } from "./workspaceClient";

const dispose: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of dispose.splice(0).reverse()) await close(); });
async function setup() {
  const dir = await mkdtemp(join(tmpdir(), "petlord-studio-sync-"));
  dispose.push(() => rm(dir, { recursive: true, force: true }));
  const api = await startPetLordServer({ port: 0, runtimeDataDirectory: dir });
  dispose.push(() => api.close());
  const request = (path: string, init?: RequestInit) => fetch(api.url + path, init);
  const left = createWorkspaceClient(request), right = createWorkspaceClient(request);
  const initial = { id: "identity", schemaVersion: 1, name: "Lottery", identityPrompt: "black and tan", referenceArtifacts: [], createdAt: "2026-09-09T00:00:00.000Z", updatedAt: "2026-09-09T00:00:00.000Z" };
  await left.save("identity", initial.id, initial);
  await right.list("identity");
  return { left, right, initial, api, request };
}

describe("Studio revision-aware persistence", () => {
  it("merges non-overlapping agent changes before retrying a stale local save", async () => {
    const { left, right, initial } = await setup();
    await right.save("identity", initial.id, { ...initial, identityPrompt: "cream tail tip" });
    const saved = await left.save("identity", initial.id, { ...initial, name: "彩票" });
    expect(saved.data).toMatchObject({ name: "彩票", identityPrompt: "cream tail tip" });
  });
  it("keeps ordered local keystrokes while sharing one acknowledged revision", async () => {
    const { left, initial } = await setup();
    const first = left.save("identity", initial.id, { ...initial, name: "彩" });
    const second = left.save("identity", initial.id, { ...initial, name: "彩票" });
    await first;
    expect((await second).data.name).toBe("彩票");
    expect(left.isClean("identity", initial.id, { ...initial, name: "彩票" })).toBe(true);
  });
  it("retains a conflicting local edit until the caller explicitly adopts remote data", async () => {
    const { left, right, initial } = await setup();
    await right.save("identity", initial.id, { ...initial, name: "Agent choice" });
    await expect(left.save("identity", initial.id, { ...initial, name: "Human choice" })).rejects.toMatchObject({ code: "REVISION_CONFLICT", conflicts: ["name"] });
    expect(left.isClean("identity", initial.id, { ...initial, name: "Human choice" })).toBe(false);
    const snapshots = await left.snapshots<typeof initial>("identity");
    expect(snapshots[0].data.name).toBe("Agent choice");
    left.adopt("identity", snapshots[0]);
    const next = await left.save("identity", initial.id, { ...snapshots[0].data, identityPrompt: "new prompt" });
    expect(next.data).toMatchObject({ name: "Agent choice", identityPrompt: "new prompt" });
  });
  it("refuses unversioned PUTs and exposes record revisions to all clients", async () => {
    const { initial, request } = await setup();
    const response = await request("/api/workspace/entities/identity/identity", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: initial }) });
    expect(response.status).toBe(409);
    const snapshot = await request("/api/workspace/entities/identity/identity").then(r => r.json()) as any;
    expect(snapshot.revision).toBeGreaterThan(0);
    expect(snapshot.data.name).toBe("Lottery");
  });
});
