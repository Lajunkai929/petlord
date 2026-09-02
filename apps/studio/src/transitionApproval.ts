import type { CharacterProject } from "@petlord/schema";

export type TransitionApprovalKind = "source-frame" | "authority-reference" | "video-frame";

export interface TransitionApprovalResult {
  project: CharacterProject;
  kind: TransitionApprovalKind;
  targetLabel: string;
  variantId: string;
  createdVariant: boolean;
  previousVariantCount: number;
}

export function approveProjectTransition(
  project: CharacterProject,
  transitionId: string,
  createId: () => string = () => crypto.randomUUID(),
): TransitionApprovalResult {
  const transition = project.transitions.find((candidate) => candidate.id === transitionId);
  const target = project.logicalStates.find((state) => state.id === transition?.toLogicalStateId);
  const sourceVariant = project.variants.find((variant) => variant.id === transition?.fromVariantId);
  const actualArtifactId = transition?.endFrameSource === "authority-reference"
    ? transition.targetDraftArtifactId
    : transition?.endFrameSource === "source-frame"
      ? sourceVariant?.imageArtifactId
      : transition?.extractedTailArtifactId;
  if (!transition || !actualArtifactId || !target) {
    throw new Error("过渡缺少目标状态、视频选帧或权威参考图，不能批准。");
  }

  if (transition.endFrameSource === "source-frame") {
    return {
      project: {
        ...project,
        transitions: project.transitions.map((candidate) => candidate.id === transitionId
          ? { ...candidate, status: "approved", toVariantId: candidate.fromVariantId }
          : candidate),
      },
      kind: "source-frame",
      targetLabel: target.label,
      variantId: transition.fromVariantId,
      createdVariant: false,
      previousVariantCount: project.variants.filter((variant) => variant.logicalStateId === target.id).length,
    };
  }

  const existingVariants = project.variants.filter((variant) => variant.logicalStateId === target.id);
  const existingAuthorityVariant = transition.endFrameSource === "authority-reference"
    ? existingVariants.find((variant) => variant.status === "approved" && variant.imageArtifactId === actualArtifactId)
    : undefined;
  const variantId = existingAuthorityVariant?.id ?? `variant-${createId()}`;
  const createdVariant = !existingAuthorityVariant;
  const variants = createdVariant ? [...project.variants, {
    id: variantId,
    logicalStateId: target.id,
    label: `${target.label} ${String.fromCharCode(65 + existingVariants.length)}`,
    status: "approved" as const,
    imageArtifactId: actualArtifactId,
    origin: transition.endFrameSource === "video-frame"
      ? { kind: "transition-tail" as const, transitionId }
      : { kind: "reference" as const, transitionId },
  }] : project.variants;

  return {
    project: {
      ...project,
      variants,
      logicalStates: project.logicalStates.map((state) => state.id === target.id
        ? { ...state, preferredOutboundVariantId: variantId }
        : state),
      transitions: project.transitions.map((candidate) => candidate.id === transitionId
        ? { ...candidate, status: "approved", toVariantId: variantId }
        : candidate),
    },
    kind: transition.endFrameSource,
    targetLabel: target.label,
    variantId,
    createdVariant,
    previousVariantCount: existingVariants.length,
  };
}
