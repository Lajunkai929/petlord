import type { CharacterProject } from "@petlord/schema";
import { DesignError } from "./errors";

export interface DesignIssue { code: string; path: string; message: string }

export function projectReferenceIssues(project: CharacterProject): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const add = (path: string, message: string) => issues.push({ code: "INVALID_REFERENCE", path, message });
  const groups = { logicalStates: project.logicalStates, variants: project.variants, artifacts: project.artifacts, transitions: project.transitions };
  for (const [name, records] of Object.entries(groups)) {
    const seen = new Set<string>();
    for (const record of records) {
      if (seen.has(record.id)) add(`${name}.${record.id}`, "Duplicate identifier.");
      seen.add(record.id);
    }
  }
  const states = new Map(project.logicalStates.map(s => [s.id, s]));
  const variants = new Map(project.variants.map(v => [v.id, v]));
  const artifacts = new Map(project.artifacts.map(a => [a.id, a]));
  if (project.dragInteraction?.targetVariantId && variants.get(project.dragInteraction.targetVariantId)?.logicalStateId !== project.dragInteraction.targetLogicalStateId) {
    add("dragInteraction.targetVariantId", "Drag target variant must exist and belong to the selected logical state.");
  }
  const artifact = (id: string | undefined, path: string) => {
    if (id && !artifacts.has(id) && !(id.startsWith("template-guidance-") && states.has(id.slice("template-guidance-".length)))) add(path, `Artifact ${id} does not exist.`);
  };
  if (project.initialVariantId && !variants.has(project.initialVariantId)) add("initialVariantId", "Initial variant does not exist.");
  for (const id of project.referenceArtifactIds) artifact(id, "referenceArtifactIds");
  for (const state of project.logicalStates) {
    artifact(state.referenceArtifactId, `logicalStates.${state.id}.referenceArtifactId`);
    for (const id of state.referenceArtifactIds) artifact(id, `logicalStates.${state.id}.referenceArtifactIds`);
    for (const key of ["defaultVariantId", "preferredOutboundVariantId"] as const) {
      if (state[key] && variants.get(state[key]!)?.logicalStateId !== state.id) add(`logicalStates.${state.id}.${key}`, "Variant must belong to this logical state.");
    }
    for (const id of state.pointerGaze?.nativeImageArtifactIds ?? []) artifact(id, `logicalStates.${state.id}.pointerGaze.nativeImageArtifactIds`);
    artifact(state.pointerGaze?.videoArtifactId, `logicalStates.${state.id}.pointerGaze.videoArtifactId`);
    for (const id of state.pointerGaze?.videoArtifactIds ?? []) artifact(id, `logicalStates.${state.id}.pointerGaze.videoArtifactIds`);
  }
  for (const variant of project.variants) {
    if (!states.has(variant.logicalStateId)) add(`variants.${variant.id}.logicalStateId`, "Variant logical state does not exist.");
    artifact(variant.imageArtifactId, `variants.${variant.id}.imageArtifactId`);
    if (artifacts.has(variant.imageArtifactId) && !artifacts.get(variant.imageArtifactId)!.mimeType.startsWith("image/")) add(`variants.${variant.id}.imageArtifactId`, "A state variant must use an image.");
  }
  for (const transition of project.transitions) {
    const base = `transitions.${transition.id}`;
    for (const frame of transition.nativeAnimation?.frames ?? []) artifact(frame.imageArtifactId, `${base}.nativeAnimation.frames`);
    const templateSource = transition.fromVariantId.startsWith("template-source-") && states.has(transition.fromVariantId.slice("template-source-".length));
    if (!variants.has(transition.fromVariantId) && !(templateSource && transition.status !== "approved")) add(`${base}.fromVariantId`, "Source variant does not exist.");
    if (!states.has(transition.toLogicalStateId)) add(`${base}.toLogicalStateId`, "Target logical state does not exist.");
    if (transition.toVariantId && variants.get(transition.toVariantId)?.logicalStateId !== transition.toLogicalStateId) add(`${base}.toVariantId`, "Target variant must belong to the target logical state.");
    for (const key of ["targetDraftArtifactId", "videoArtifactId", "extractedTailArtifactId"] as const) artifact(transition[key], `${base}.${key}`);
    for (const id of transition.guidanceArtifactIds ?? []) artifact(id, `${base}.guidanceArtifactIds`);
    for (const version of transition.mediaVersions) {
      artifact(version.videoArtifactId, `${base}.mediaVersions.${version.id}.videoArtifactId`);
      artifact(version.tailArtifactId, `${base}.mediaVersions.${version.id}.tailArtifactId`);
    }
  }
  return issues;
}

export function assertProjectReferences(project: CharacterProject): void {
  const issues = projectReferenceIssues(project);
  if (issues.length) throw new DesignError("INVALID_REFERENCE", issues[0].message, issues);
}
