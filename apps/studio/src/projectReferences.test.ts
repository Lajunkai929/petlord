import { describe, expect, it } from "vitest";
import { createBlankIdentityProfile, createBlankProject, activateAuthorityReference } from "./projectTemplate";
import { createPortableProjectSource, resolveProjectGenerationContext } from "./generationContext";
import { applyProjectReferenceChange, projectWithResolvedReferences, selectedStateReference } from "./projectReferences";
import type { Artifact } from "@petlord/schema";
const photo = (id: string, uri = `data:image/png;base64,${id}`): Artifact => ({ id, uri, kind: "identity-reference", mimeType: "image/png", createdAt: "2026-09-10T00:00:00Z" });
const project = () => createBlankProject({ characterName: "自己的宠物", customerName: "", contact: "", quotedPriceCny: 0, depositCny: 0, revisionLimit: 0, notes: "" });
describe("project reference configuration", () => {
  it("explicitly links the chosen identity while preserving state artwork and old references", () => {
    const current = project(); const chosen = createBlankIdentityProfile("选中角色"); const unrelated = createBlankIdentityProfile("其他角色");
    chosen.referenceArtifacts = [photo("collision", "data:image/png;base64,new")];
    current.artifacts = [photo("collision")]; current.referenceArtifactIds = ["collision"];
    const next = applyProjectReferenceChange(current, [unrelated, chosen], { kind: "identity", identityId: chosen.id });
    expect(next.identityProfileId).toBe(chosen.id);
    expect(next.artifacts.find(a => a.id === "collision")?.uri).toBe(current.artifacts[0].uri);
    expect(next.logicalStates).toEqual(current.logicalStates);
    expect(resolveProjectGenerationContext(next, [chosen], []).identityReferences).toEqual(chosen.referenceArtifacts);
    const view = projectWithResolvedReferences(next, resolveProjectGenerationContext(next, [chosen], []));
    expect(view.referenceArtifactIds.map(id => view.artifacts.find(a => a.id === id)?.uri)).toEqual([chosen.referenceArtifacts[0].uri]);
    expect(view.identityProfileId).toBe(chosen.id);
  });
  it("adds project-owned references preserving the live selection then detaches only this project", () => {
    const identity = createBlankIdentityProfile("球球"); identity.referenceArtifacts = [photo("live")];
    const current = project(); current.identityProfileId = identity.id; current.artifacts = [photo("old")]; current.referenceArtifactIds = ["old"];
    const next = applyProjectReferenceChange(current, [identity], { kind: "upload", artifacts: [photo("added")] });
    expect(next.identityProfileId).toBeUndefined(); expect(next.characterName).toBe("球球");
    const context = resolveProjectGenerationContext(next, [], []);
    expect(context.identityReferences.map(a => a.id)).toEqual(["live", "added"]);
    expect(next.artifacts.map(a => a.id)).toContain("old");
    expect(identity.referenceArtifacts).toEqual([photo("live")]);
    const portable = createPortableProjectSource(next, context);
    expect(resolveProjectGenerationContext(portable, [], []).identityReferences).toEqual(context.identityReferences);
  });
  it("uses only the selected state's approved reference and preserves all bindings", () => {
    const current = project(); const state = current.logicalStates[0]; const image = { ...photo("state-image"), kind: "state-actual" as const };
    current.artifacts.push(image);
    expect(selectedStateReference(current, { kind: "state", id: state.id })).toBeUndefined();
    const approved = activateAuthorityReference(current, state.id, image.id);
    expect(selectedStateReference(approved, { kind: "transition", id: "any" })).toBeUndefined();
    expect(selectedStateReference(approved, { kind: "state", id: state.id })?.id).toBe(image.id);
    const next = applyProjectReferenceChange(approved, [], { kind: "state", stateId: state.id });
    expect(next.referenceArtifactIds).toEqual([image.id]);
    expect(next.artifacts).toEqual(approved.artifacts); expect(next.logicalStates).toEqual(approved.logicalStates); expect(next.variants).toEqual(approved.variants);
    expect(applyProjectReferenceChange(next, [], { kind: "state", stateId: state.id }).referenceArtifactIds).toEqual([image.id]);
    expect(() => applyProjectReferenceChange(current, [], { kind: "state", stateId: state.id })).toThrow("已确认");
  });
  it("rejects missing identity and empty or nonimage uploads without changing source", () => {
    const current = project(); const before = structuredClone(current);
    expect(() => applyProjectReferenceChange(current, [], { kind: "identity", identityId: "missing" })).toThrow();
    expect(() => applyProjectReferenceChange(current, [], { kind: "upload", artifacts: [] })).toThrow();
    expect(() => applyProjectReferenceChange(current, [], { kind: "upload", artifacts: [{ ...photo("video"), mimeType: "video/mp4" }] })).toThrow();
    expect(current).toEqual(before);
  });
});
