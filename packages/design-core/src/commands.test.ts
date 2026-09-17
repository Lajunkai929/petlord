import { describe, expect, it } from "vitest";
import { applyDesignMutation, createDesignProject, describeDesignMutations, inspectDesignProject } from "./commands";
import type { CharacterProject } from "@petlord/schema";

function mutate(project: CharacterProject, command: string, input: unknown) {
  return applyDesignMutation(project, command, input).project;
}
function fixture() {
  let p = createDesignProject({ id: "test-pet", name: "彩票像素试验", characterName: "彩票" });
  p = mutate(p, "state.create", { id: "sit", label: "坐着", semanticKey: "idle" });
  p = mutate(p, "state.create", { id: "rest", label: "趴着", semanticKey: "rest" });
  for (const stateId of ["sit", "rest"]) {
    p = mutate(p, "artifact.register", { artifact: { id: `image-${stateId}`, kind: "state-draft", uri: `data:image/png;base64,${stateId}`, mimeType: "image/png", createdAt: "2026-09-09T00:00:00.000Z", targetStateId: stateId } });
    p = mutate(p, "state.approve", { stateId, artifactId: `image-${stateId}` });
  }
  return p;
}

describe("headless design mutations", () => {
  it("creates states and selects actual candidates as runtime variants without a Studio page", () => {
    const p = fixture();
    expect(p.logicalStates.map(s => s.id)).toEqual(["sit", "rest"]);
    expect(p.variants).toHaveLength(2);
    expect(p.variants.find(v => v.id === p.initialVariantId)).toMatchObject({ logicalStateId: "sit", imageArtifactId: "image-sit", status: "approved" });
    expect(inspectDesignProject(p)).toMatchObject({ exportable: true, counts: { states: 2, variants: 2, transitions: 0, artifacts: 2 } });
  });

  it("changes a detailed setting without replacing unrelated state data or mutating its input", () => {
    let p = fixture();
    p = mutate(p, "state.update", { stateId: "sit", patch: { idleScheduler: { enabled: true, strategy: "weighted-random", minIntervalMs: 1200, maxIntervalMs: 2400, avoidImmediateRepeat: true } } });
    const before = structuredClone(p);
    const next = mutate(p, "state.update", { stateId: "sit", patch: { description: "微微抬头" } });
    expect(p).toEqual(before);
    expect(next.logicalStates[0]).toMatchObject({ description: "微微抬头", referenceArtifactId: "image-sit", idleScheduler: { enabled: true, minIntervalMs: 1200, maxIntervalMs: 2400 } });
    expect(next.logicalStates[0].referenceArtifactIds).toEqual(["image-sit"]);
  });

  it("rejects an artifact belonging to another state and duplicate state identifiers", () => {
    const p = fixture();
    expect(() => mutate(p, "state.approve", { stateId: "sit", artifactId: "image-rest" })).toThrow(/candidate|state/i);
    expect(() => mutate(p, "state.create", { id: "sit", label: "duplicate" })).toThrow(/already|duplicate/i);
    expect(p.variants).toHaveLength(2);
  });

  it("creates and approves a video transition only after its real media and endpoints exist", () => {
    let p = fixture();
    const fromVariantId = p.logicalStates[0].defaultVariantId!;
    p = mutate(p, "transition.create", { id: "lie-down", label: "趴下", fromVariantId, toLogicalStateId: "rest", endFrameSource: "authority-reference", targetDraftArtifactId: "image-rest" });
    expect(() => mutate(p, "transition.approve", { transitionId: "lie-down" })).toThrow(/media|video/i);
    p = mutate(p, "artifact.register", { artifact: { id: "clip", kind: "transition-video", uri: "data:video/webm;base64,abc", mimeType: "video/webm", createdAt: "2026-09-09T00:00:00.000Z" } });
    p = mutate(p, "transition.update", { transitionId: "lie-down", patch: { videoArtifactId: "clip", triggers: [{ id: "click", event: "left-click", enabled: true }], playback: { mode: "forward", repeatMode: "fixed", minCycles: 1, maxCycles: 1, segmentStartMs: 0 } } });
    p = mutate(p, "transition.approve", { transitionId: "lie-down" });
    expect(p.transitions[0]).toMatchObject({ status: "approved", toVariantId: p.logicalStates[1].defaultVariantId });
    expect(inspectDesignProject(p)).toMatchObject({ exportable: true });
  });

  it("rejects dangling transition sources and protects graph references on removal", () => {
    let p = fixture();
    expect(() => mutate(p, "transition.create", { label: "broken", fromVariantId: "missing", toLogicalStateId: "rest" })).toThrow(/source|variant/i);
    p = mutate(p, "transition.create", { id: "t", label: "lie", fromVariantId: p.initialVariantId, toLogicalStateId: "rest" });
    expect(() => mutate(p, "state.delete", { stateId: "sit" })).toThrow(/referenced|cascade/i);
    const next = mutate(p, "state.delete", { stateId: "sit", cascade: true });
    expect(next.logicalStates.map(s => s.id)).toEqual(["rest"]);
    expect(next.transitions).toEqual([]);
    expect(next.variants).toHaveLength(1);
    expect(next.variants.find(v => v.id === next.initialVariantId)?.logicalStateId).toBe("rest");
  });

  it("does not silently accept misspelled parameters or clear required properties", () => {
    const p = fixture();
    expect(() => mutate(p, "state.update", { stateId: "sit", patch: { lable: "typo" } })).toThrow();
    expect(() => mutate(p, "project.update", { patch: {}, clear: ["name"] })).toThrow();
    expect(() => mutate(p, "project.update", { patch: { generationBudgetCny: -1 } })).toThrow();
  });

  it("provides machine-readable schemas for fine-grained design operations", () => {
    const commands = describeDesignMutations();
    expect(commands.find(c => c.name === "state.update")?.inputSchema).toMatchObject({ type: "object", properties: { stateId: { type: "string" }, patch: { type: "object", properties: { description: { type: "string" }, pointerGaze: { type: "object" } }, additionalProperties: false } } });
    expect(commands.map(c => c.name)).toEqual(expect.arrayContaining(["state.create", "state.update", "state.approve", "transition.create", "transition.update", "transition.approve", "project.update", "artifact.register"]));
  });
});
