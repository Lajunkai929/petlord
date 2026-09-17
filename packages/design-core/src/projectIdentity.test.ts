import { expect, it } from "vitest";
import { artifactSchema, characterProjectSchema, identityProfileSchema } from "@petlord/schema";
import { buildPetPackage } from "@petlord/state-engine";
import { applyDesignMutation, createDesignProject } from "./commands";
import { createPortableProjectSource, resolveProjectGenerationContext } from "./generationContext";
import { duplicateProjectForOrder, syncProjectIdentity } from "./projectTemplate";
import { assertProjectReferences } from "./projectValidation";

const timestamp = "2026-09-10T00:00:00.000Z";
const order = { customerName: "Customer", contact: "", characterName: "New pet", quotedPriceCny: 0, depositCny: 0, revisionLimit: 0, notes: "" };
function fixture() {
  let project = createDesignProject({ id: "p", name: "Original project", characterName: "Old pet", styleProfileId: "style" });
  const change = (command: string, input: unknown) => { project = applyDesignMutation(project, command, input).project; };
  change("pixel.document.set", { document: { schemaVersion: 1, width: 1, height: 1, palette: { R: "#FF0000" }, frames: [{ id: "still", layers: [{ id: "body", x: 0, y: 0, rows: ["R"] }] }] } });
  change("state.create", { id: "s", label: "Still" });
  change("artifact.register", { artifact: { id: "still", kind: "state-draft", uri: "/immutable/native.png", mimeType: "image/png", createdAt: timestamp, nativePixel: { frameId: "still", width: 1, height: 1 } } });
  change("artifact.register", { artifact: { id: "video", kind: "transition-video", uri: "/immutable/video.mp4", mimeType: "video/mp4", createdAt: timestamp } });
  change("state.approve", { stateId: "s", artifactId: "still", setInitial: true });
  for (const id of ["native", "video"]) {
    change("transition.create", { id, label: id, fromVariantId: project.initialVariantId, toLogicalStateId: "s", endFrameSource: "source-frame" });
    change("transition.update", { transitionId: id, patch: id === "native" ? { nativeAnimation: { frames: [{ imageArtifactId: "still", durationMs: 40 }] }, durationMs: 40 } : { videoArtifactId: "video", durationMs: 400 } });
    change("transition.approve", { transitionId: id });
  }
  change("project.update", { patch: { referenceArtifactIds: ["still"] } });
  const identity = identityProfileSchema.parse({ schemaVersion: 1, id: "identity", name: "New pet", identityPrompt: "New pet has distinctive markings", referenceArtifacts: [{ id: "photo", kind: "identity-reference", uri: "/immutable/new-photo.png", mimeType: "image/png", createdAt: timestamp }], createdAt: timestamp, updatedAt: timestamp });
  return { project, identity };
}

it("sync retains reused state artwork and all native/video bindings while replacing effective identity references", () => {
  const { project, identity } = fixture();
  const before = structuredClone(project);
  const synced = syncProjectIdentity(project, identity);
  expect(synced.artifacts.slice(0, project.artifacts.length)).toEqual(project.artifacts);
  expect(synced.referenceArtifactIds).toEqual(["photo"]);
  expect(synced).toMatchObject({ identityProfileId: "identity", characterName: "New pet", identityPrompt: "{{characterName}} has distinctive markings", styleProfileId: "style", stylePrompt: project.stylePrompt });
  expect(synced.pixelDocument).toEqual(project.pixelDocument);
  expect(synced.logicalStates).toEqual(project.logicalStates);
  expect(synced.variants).toEqual(project.variants);
  expect(synced.transitions).toEqual(project.transitions);
  expect(() => assertProjectReferences(characterProjectSchema.parse(synced))).not.toThrow();
  const originalRuntime = buildPetPackage(project), runtime = buildPetPackage(synced);
  expect(runtime.states).toEqual(originalRuntime.states);
  expect(runtime.transitions).toEqual(originalRuntime.transitions);
  expect(resolveProjectGenerationContext(synced, [identity], []).identityReferences).toEqual(identity.referenceArtifacts);
  expect(syncProjectIdentity(synced, identity)).toEqual(synced);
  expect(project).toEqual(before);
});

it.each(["sync", "duplicate"])("%s remaps identity collisions without overwriting artwork or breaking repeated synchronization", operation => {
  const { project, identity } = fixture();
  identity.referenceArtifacts[0].id = "still";
  // An unrelated artifact can already occupy the first deterministic remapped ID.
  project.artifacts.push(artifactSchema.parse({ id: "portable-reference-0-still", kind: "state-draft", uri: "/immutable/other.png", mimeType: "image/png", createdAt: timestamp }));
  const updated = operation === "sync" ? syncProjectIdentity(project, identity) : duplicateProjectForOrder(project, order, identity);
  expect(updated.artifacts.slice(0, project.artifacts.length)).toEqual(project.artifacts);
  expect(new Set(updated.artifacts.map(artifact => artifact.id)).size).toBe(updated.artifacts.length);
  expect(updated.referenceArtifactIds).toHaveLength(1);
  const reference = updated.artifacts.find(artifact => artifact.id === updated.referenceArtifactIds[0])!;
  expect(reference.uri).toBe("/immutable/new-photo.png");
  expect(reference.id).not.toBe("still");
  expect(() => assertProjectReferences(characterProjectSchema.parse(updated))).not.toThrow();
  expect(buildPetPackage(updated).states).toEqual(buildPetPackage(project).states);
  expect(buildPetPackage(updated).transitions).toEqual(buildPetPackage(project).transitions);
  expect(syncProjectIdentity(updated, identity)).toEqual(updated);
  if (operation === "duplicate") {
    expect(updated.id).not.toBe(project.id);
    expect(updated.order).toMatchObject({ customerName: "Customer", status: "assets" });
    expect(updated.characterName).toBe("New pet");
    expect(updated.jobs).toEqual([]);
  }
});

it("portable reference merging reuses a previous collision mapping on repeated snapshots", () => {
  const { project, identity } = fixture();
  identity.referenceArtifacts[0].id = "still";
  const context = resolveProjectGenerationContext({ ...project, identityProfileId: identity.id }, [identity], []);
  const first = createPortableProjectSource(project, context);
  const second = createPortableProjectSource(first, context);
  expect(second).toEqual(first);
  expect(first.artifacts.find(artifact => artifact.id === "still")).toEqual(project.artifacts[0]);
});

it("sync follows changed or removed live photos while keeping prior artwork and stable repeated results", () => {
  const { project, identity } = fixture();
  identity.referenceArtifacts[0].id = "still";
  const first = syncProjectIdentity(project, identity);
  const changedIdentity = { ...identity, name: "Renamed pet", referenceArtifacts: identity.referenceArtifacts.map(reference => ({ ...reference, uri: "/immutable/replacement.png" })) };
  const changed = syncProjectIdentity(first, changedIdentity);
  expect(changed.artifacts.slice(0, first.artifacts.length)).toEqual(first.artifacts);
  expect(changed.artifacts.find(artifact => artifact.id === changed.referenceArtifactIds[0])?.uri).toBe("/immutable/replacement.png");
  expect(changed.characterName).toBe("Renamed pet");
  expect(syncProjectIdentity(changed, changedIdentity)).toEqual(changed);
  const emptied = syncProjectIdentity(changed, { ...changedIdentity, referenceArtifacts: [] });
  expect(emptied.referenceArtifactIds).toEqual([]);
  expect(emptied.artifacts).toEqual(changed.artifacts);
  expect(() => assertProjectReferences(emptied)).not.toThrow();
  expect(buildPetPackage(emptied).states).toEqual(buildPetPackage(project).states);
});

it("reference merging deduplicates effective media URIs while remapping distinct media with the same source ID", () => {
  const { project, identity } = fixture();
  const reference = identity.referenceArtifacts[0];
  identity.referenceArtifacts = [reference, { ...reference, id: "duplicate-photo" }, { ...reference, uri: "/immutable/different-photo.png" }];
  const context = resolveProjectGenerationContext({ ...project, identityProfileId: identity.id }, [identity], []);
  expect(context.identityReferences.map(artifact => artifact.uri)).toEqual(["/immutable/new-photo.png", "/immutable/different-photo.png"]);
  const snapshot = createPortableProjectSource(project, { ...context, identityReferences: identity.referenceArtifacts });
  const selected = snapshot.referenceArtifactIds.map(id => snapshot.artifacts.find(artifact => artifact.id === id)!);
  expect(selected.map(artifact => artifact.uri)).toEqual(["/immutable/new-photo.png", "/immutable/different-photo.png"]);
  expect(new Set(snapshot.referenceArtifactIds).size).toBe(2);
  expect(snapshot.artifacts).toHaveLength(project.artifacts.length + 2);
  expect(snapshot.artifacts.slice(0, project.artifacts.length)).toEqual(project.artifacts);
  expect(createPortableProjectSource(snapshot, context)).toEqual(snapshot);
  expect(syncProjectIdentity(project, identity).referenceArtifactIds).toEqual(snapshot.referenceArtifactIds);
});
