import type { Artifact, CharacterProject, IdentityProfile } from "@petlord/schema";
import { applyGenerationContextSnapshot, createPortableProjectSource, resolveProjectGenerationContext, type ProjectGenerationContext } from "./generationContext";
import type { StudioSelection } from "./studioTypes";

export type ProjectReferenceChange =
  | { kind: "identity"; identityId: string }
  | { kind: "upload"; artifacts: Artifact[] }
  | { kind: "state"; stateId: string };

/** The generator, prompt preview and portable source must use the same selected references. */
export function projectWithResolvedReferences(project: CharacterProject, context: ProjectGenerationContext): CharacterProject {
  const portable = createPortableProjectSource(project, context);
  return { ...applyGenerationContextSnapshot(project, context), artifacts: portable.artifacts, referenceArtifactIds: portable.referenceArtifactIds };
}

export function selectedStateReference(project: CharacterProject, selection: StudioSelection): Artifact | undefined {
  if (selection?.kind !== "state") return;
  const state = project.logicalStates.find(candidate => candidate.id === selection.id);
  const artifact = project.artifacts.find(candidate => candidate.id === state?.referenceArtifactId);
  const approved = project.variants.some(variant => variant.logicalStateId === state?.id && variant.imageArtifactId === artifact?.id && variant.status === "approved");
  return approved && artifact?.mimeType.startsWith("image/") ? artifact : undefined;
}

export function applyProjectReferenceChange(project: CharacterProject, identities: IdentityProfile[], change: ProjectReferenceChange): CharacterProject {
  let context = resolveProjectGenerationContext(project, identities, []);
  if (change.kind === "identity") {
    const identity = identities.find(candidate => candidate.id === change.identityId);
    if (!identity) throw new Error("这个角色已不存在，请重新选择。");
    context = resolveProjectGenerationContext({ ...project, identityProfileId: identity.id }, identities, []);
  } else {
    const additions = change.kind === "state"
      ? [selectedStateReference(project, { kind: "state", id: change.stateId })]
      : change.artifacts;
    if (!additions.length || additions.some(artifact => !artifact?.mimeType.startsWith("image/"))) {
      throw new Error(change.kind === "state" ? "请先选择一个有已确认图片的状态。" : "请选择至少一张图片。");
    }
    const references = [...context.identityReferences];
    for (const artifact of additions as Artifact[]) {
      if (!references.some(existing => existing.id === artifact.id && existing.uri === artifact.uri)) references.push(artifact);
    }
    context = { ...context, identityProfileId: undefined, identityReferences: references };
  }
  const snapshot = projectWithResolvedReferences(project, context);
  return {
    ...project,
    identityProfileId: context.identityProfileId,
    characterName: context.characterName,
    identityPrompt: context.identityPrompt,
    artifacts: snapshot.artifacts,
    referenceArtifactIds: snapshot.referenceArtifactIds,
  };
}
