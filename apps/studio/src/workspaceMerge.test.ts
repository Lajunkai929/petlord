import { describe, expect, it } from "vitest";
import { mergeWorkspaceChanges } from "./workspaceMerge";

describe("concurrent human and agent workspace edits", () => {
  it("combines an edited state description with a new agent candidate and preserves both", () => {
    const base = { name: "pet", logicalStates: [{ id: "sit", description: "sitting", referenceArtifactIds: [] }], artifacts: [], updatedAt: "2026-09-09T00:00:00.000Z" };
    const local = { ...base, logicalStates: [{ ...base.logicalStates[0], description: "ears relaxed" }], updatedAt: "2026-09-09T00:00:01.000Z" };
    const remote = { ...base, artifacts: [{ id: "candidate", uri: "/api/media/new.png" }], updatedAt: "2026-09-09T00:00:02.000Z" };
    const merged = mergeWorkspaceChanges(base, local, remote);
    expect(merged.conflicts).toEqual([]);
    expect(merged.value).toMatchObject({ logicalStates: [{ id: "sit", description: "ears relaxed" }], artifacts: [{ id: "candidate" }], updatedAt: "2026-09-09T00:00:02.000Z" });
  });
  it("reports simultaneous edits to the same field instead of choosing one silently", () => {
    const result = mergeWorkspaceChanges({ name: "original" }, { name: "human" }, { name: "agent" });
    expect(result.conflicts).toEqual(["name"]);
    expect(result.value.name).toBe("human");
  });
  it("treats deleting a state while another actor edits it as a conflict", () => {
    const result = mergeWorkspaceChanges({ states: [{ id: "sit", label: "sit" }] }, { states: [] }, { states: [{ id: "sit", label: "rest" }] });
    expect(result.conflicts).toEqual(["states[sit]"]);
  });
  it("keeps backend job feedback authoritative when local optimistic job text differs", () => {
    const result = mergeWorkspaceChanges({ jobs: [] }, { jobs: [{ id: "job", status: "queued", prompt: "full submitted prompt" }] }, { jobs: [{ id: "job", status: "running", prompt: "坐着", progress: 20 }] });
    expect(result.conflicts).toEqual([]);
    expect(result.value.jobs).toEqual([{ id: "job", status: "running", prompt: "坐着", progress: 20 }]);
  });
});
it("preserves a local layer reorder while merging remote color edits", () => {
  const base = { layers: [{ id: "body", color: "red" }, { id: "eyes", color: "black" }] };
  const local = { layers: [base.layers[1], base.layers[0]] };
  const remote = { layers: [base.layers[0], { ...base.layers[1], color: "brown" }] };
  expect(mergeWorkspaceChanges(base, local, remote)).toEqual({ value: { layers: [{ id: "eyes", color: "brown" }, base.layers[0]] }, conflicts: [] });
});

it("reports incompatible simultaneous ordering edits instead of choosing one silently", () => {
  const base = { layers: ["a", "b", "c"].map(id => ({ id })) };
  const local = { layers: [base.layers[1], base.layers[0], base.layers[2]] };
  const remote = { layers: [base.layers[0], base.layers[2], base.layers[1]] };
  expect(mergeWorkspaceChanges(base, local, remote).conflicts).toContain("layers.$order");
});
