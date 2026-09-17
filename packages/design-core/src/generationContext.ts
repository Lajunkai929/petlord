import { materializePromptVariables, templateCharacterNamePrompt } from "@petlord/generation";
import type { Artifact, CharacterProject, IdentityProfile } from "@petlord/schema";
import type { StyleProfile } from "./styleLibrary";

export interface ProjectGenerationContext {
  characterName: string;
  identityProfileId?: string;
  identityPrompt: string;
  identityReferences: Artifact[];
  styleProfileId?: string;
  imageStylePrompt: string;
  videoStylePrompt: string;
}

function renderLegacySafe(prompt: string, previousName: string | undefined, characterName: string) {
  return materializePromptVariables(templateCharacterNamePrompt(prompt, previousName), characterName);
}

function uniqueReferencesByUri(references: Artifact[]): Artifact[] {
  const seen = new Set<string>();
  return references.filter(reference => {
    if (seen.has(reference.uri)) return false;
    seen.add(reference.uri);
    return true;
  });
}

export function resolveProjectGenerationContext(
  project: CharacterProject,
  identities: IdentityProfile[],
  styles: StyleProfile[],
  inferredStyleProfileId?: string,
): ProjectGenerationContext {
  const identity = identities.find((candidate) => candidate.id === project.identityProfileId);
  const characterName = identity?.name ?? project.characterName;
  const styleProfileId = project.styleProfileId ?? inferredStyleProfileId;
  const style = styles.find((candidate) => candidate.id === styleProfileId);
  const projectReferences = project.referenceArtifactIds
    .map((id) => project.artifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is Artifact => Boolean(artifact));
  const imageTemplate = style?.imagePrompt ?? project.imageStylePrompt ?? project.stylePrompt;
  const videoTemplate = style?.videoPrompt ?? project.videoStylePrompt ?? project.stylePrompt;

  return {
    characterName,
    identityProfileId: identity?.id ?? project.identityProfileId,
    identityPrompt: renderLegacySafe(identity?.identityPrompt ?? project.identityPrompt, identity?.name ?? project.characterName, characterName),
    identityReferences: structuredClone(uniqueReferencesByUri(identity?.referenceArtifacts ?? projectReferences)),
    styleProfileId: style?.id ?? styleProfileId,
    imageStylePrompt: renderLegacySafe(imageTemplate, project.characterName, characterName),
    videoStylePrompt: renderLegacySafe(videoTemplate, project.characterName, characterName),
  };
}

export function applyGenerationContextSnapshot(project: CharacterProject, context: ProjectGenerationContext): CharacterProject {
  return {
    ...project,
    characterName: context.characterName,
    identityProfileId: context.identityProfileId,
    styleProfileId: context.styleProfileId,
    identityPrompt: context.identityPrompt,
    stylePrompt: context.imageStylePrompt,
    imageStylePrompt: context.imageStylePrompt,
    videoStylePrompt: context.videoStylePrompt,
  };
}

/** Freeze shared profiles into the project so exported source works on another device. */
export function createPortableProjectSource(project: CharacterProject, context: ProjectGenerationContext): CharacterProject {
  const snapshot = applyGenerationContextSnapshot(project, context);
  const artifacts = structuredClone(project.artifacts);
  const referenceArtifactIds = uniqueReferencesByUri(context.identityReferences).map((reference, index) => {
    let id = reference.id;
    let existing = artifacts.find(artifact => artifact.id === id);
    while (existing) {
      if (existing.uri === reference.uri) return id;
      id = `portable-reference-${index}-${id}`;
      existing = artifacts.find(artifact => artifact.id === id);
    }
    artifacts.push({ ...structuredClone(reference), id });
    return id;
  });
  return { ...snapshot, identityProfileId: undefined, styleProfileId: undefined, referenceArtifactIds, artifacts };
}
