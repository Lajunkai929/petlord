import type { Artifact, CharacterProject, IdentityProfile, StateVariant } from "@petlord/schema";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, templateCharacterNamePrompt } from "@petlord/generation";
import { defaultProjectPlugins } from "./firstPartyPlugins";
import { createProjectTemplateGraph, projectTemplates, templateGuidanceArtifactId, templateSourceVariantId, type ProjectTemplateDefinition } from "./projectTemplates";

export { projectTemplates } from "./projectTemplates";
export type { ProjectTemplateDefinition, ProjectTemplateId, SavedProjectTemplate } from "./projectTemplates";

export interface NewOrderInput {
  identityProfileId?: string;
  styleProfileId?: string;
  projectName?: string;
  stylePrompt?: string;
  imageStylePrompt?: string;
  videoStylePrompt?: string;
  generationBudgetCny?: number;
  customerName: string;
  contact: string;
  characterName: string;
  quotedPriceCny: number;
  depositCny: number;
  dueDate?: string;
  revisionLimit: number;
  notes: string;
  projectTemplateId?: string;
  projectTemplate?: ProjectTemplateDefinition;
  serviceTemplateId?: string;
}

function orderNumber(date = new Date()) {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  return `XY-${day}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

export function createBlankProject(input: NewOrderInput, identity?: IdentityProfile): CharacterProject {
  const projectTemplate = input.projectTemplate
    ?? projectTemplates.find((template) => template.id === (input.projectTemplateId ?? input.serviceTemplateId))
    ?? projectTemplates.find((template) => template.id === "companion")!;
  const characterName = identity?.name ?? input.characterName;
  const identityArtifacts = structuredClone(identity?.referenceArtifacts ?? []);
  const graph = createProjectTemplateGraph(projectTemplate, characterName);
  const defaultStylePrompt = "高质量 2D 桌面宠物角色，透明背景，完整展示角色，稳定统一的造型与光影。";
  const stylePrompt = templateCharacterNamePrompt(input.stylePrompt?.trim() || defaultStylePrompt, characterName);
  const imageStylePrompt = templateCharacterNamePrompt(input.imageStylePrompt?.trim() || input.stylePrompt?.trim() || defaultStylePrompt, characterName);
  const videoStylePrompt = templateCharacterNamePrompt(input.videoStylePrompt?.trim() || input.stylePrompt?.trim() || defaultStylePrompt, characterName);
  return {
    schemaVersion: 1,
    id: `project-${crypto.randomUUID()}`,
    name: input.projectName?.trim() || `${characterName} 的桌面宠物`,
    characterName,
    identityProfileId: identity?.id ?? input.identityProfileId,
    styleProfileId: input.styleProfileId,
    stylePrompt,
    imageStylePrompt,
    videoStylePrompt,
    identityPrompt: templateCharacterNamePrompt(identity?.identityPrompt ?? `${characterName} 的身份、脸型、体型、毛色和独特标记必须始终一致。`, characterName),
    generationBudgetCny: input.generationBudgetCny ?? 50,
    generationSettings: {
      imageModel: DEFAULT_IMAGE_MODEL,
      imageMode: "native-image",
      videoModel: DEFAULT_VIDEO_MODEL,
      imageResolution: "2K",
      imageCandidateCount: 3,
      videoResolution: "480p",
      ratio: "1:1",
      durationMode: "smart",
    },
    videoBackground: { mode: "auto", autoColor: "#00FF00", manualColor: "#FFFFFF" },
    dragInteraction: graph.dragInteraction,
    order: {
      orderNumber: orderNumber(),
      customerName: input.customerName,
      contact: input.contact,
      channel: "xianyu",
      status: "assets",
      quotedPriceCny: input.quotedPriceCny,
      depositCny: input.depositCny,
      finalPaymentCny: 0,
      dueDate: input.dueDate || undefined,
      revisionLimit: input.revisionLimit,
      revisionUsed: 0,
      notes: input.notes,
      serviceTemplateId: projectTemplate.id,
      manualCosts: [],
      deliveryChecklist: {
        customerApproved: false,
        desktopTested: false,
        packageDelivered: false,
      },
      reviewRounds: [],
    },
    referenceArtifactIds: identityArtifacts.map((artifact) => artifact.id),
    initialVariantId: undefined,
    logicalStates: graph.logicalStates,
    variants: [],
    transitions: graph.transitions,
    artifacts: identityArtifacts,
    jobs: [],
    plugins: structuredClone(projectTemplate.kind === "custom" ? projectTemplate.plugins : defaultProjectPlugins),
    updatedAt: new Date().toISOString(),
  };
}

export function duplicateProjectForOrder(source: CharacterProject, input: NewOrderInput, identity?: IdentityProfile): CharacterProject {
  const clone = structuredClone(source);
  const created = createBlankProject(input, identity);
  const anonymize = (prompt: string) => templateCharacterNamePrompt(prompt, source.characterName);
  return {
    ...clone,
    id: created.id,
    name: input.projectName?.trim() || `${created.characterName} 的桌面宠物`,
    characterName: created.characterName,
    identityProfileId: created.identityProfileId,
    styleProfileId: created.styleProfileId,
    identityPrompt: created.identityPrompt,
    referenceArtifactIds: created.referenceArtifactIds,
    artifacts: identity ? [
      ...clone.artifacts.filter((artifact) => !clone.referenceArtifactIds.includes(artifact.id)),
      ...structuredClone(identity.referenceArtifacts),
    ] : clone.artifacts,
    stylePrompt: templateCharacterNamePrompt(input.stylePrompt?.trim() || anonymize(clone.stylePrompt), created.characterName),
    imageStylePrompt: templateCharacterNamePrompt(input.imageStylePrompt?.trim() || anonymize(clone.imageStylePrompt || clone.stylePrompt), created.characterName),
    videoStylePrompt: templateCharacterNamePrompt(input.videoStylePrompt?.trim() || anonymize(clone.videoStylePrompt || clone.stylePrompt), created.characterName),
    logicalStates: clone.logicalStates.map((state) => ({ ...state, description: anonymize(state.description) })),
    transitions: clone.transitions.map((transition) => ({ ...transition, prompt: anonymize(transition.prompt) })),
    order: created.order,
    jobs: [],
    updatedAt: created.updatedAt,
  };
}

export function createIdentityProfileFromProject(project: CharacterProject, createdAt = project.updatedAt): IdentityProfile {
  const references = project.referenceArtifactIds
    .map((id) => project.artifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is Artifact => Boolean(artifact));
  return {
    schemaVersion: 1,
    id: project.identityProfileId ?? `identity-${crypto.randomUUID()}`,
    name: project.characterName,
    identityPrompt: templateCharacterNamePrompt(project.identityPrompt, project.characterName),
    referenceArtifacts: structuredClone(references),
    createdAt,
    updatedAt: project.updatedAt,
  };
}

export function createBlankIdentityProfile(name: string): IdentityProfile {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: `identity-${crypto.randomUUID()}`,
    name: name.trim(),
    identityPrompt: "{{characterName}} 的个体身份由本形象档案中的全部实拍参考图共同定义；脸型、体型、毛色、花纹、耳型、眼睛、四肢比例、尾型和独特标记必须在所有风格与状态中保持一致。",
    referenceArtifacts: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function syncProjectIdentity(project: CharacterProject, identity: IdentityProfile): CharacterProject {
  const identityIds = new Set(identity.referenceArtifacts.map((artifact) => artifact.id));
  const oldIdentityIds = new Set(project.referenceArtifactIds);
  return {
    ...project,
    identityProfileId: identity.id,
    characterName: identity.name,
    identityPrompt: templateCharacterNamePrompt(identity.identityPrompt, identity.name),
    referenceArtifactIds: [...identityIds],
    artifacts: [
      ...project.artifacts.filter((artifact) => !oldIdentityIds.has(artifact.id) && !identityIds.has(artifact.id)),
      ...structuredClone(identity.referenceArtifacts),
    ],
  };
}

export function normalizeProjectPromptTemplates(project: CharacterProject): CharacterProject {
  const template = (prompt: string | undefined) => prompt === undefined
    ? undefined
    : templateCharacterNamePrompt(prompt, project.characterName);
  return {
    ...project,
    identityPrompt: template(project.identityPrompt)!,
    stylePrompt: template(project.stylePrompt)!,
    imageStylePrompt: template(project.imageStylePrompt),
    videoStylePrompt: template(project.videoStylePrompt),
    logicalStates: project.logicalStates.map((state) => ({ ...state, description: template(state.description)! })),
    transitions: project.transitions.map((transition) => ({ ...transition, prompt: template(transition.prompt)! })),
  };
}

function authorityVariantFor(stateId: string, stateLabel: string, artifactId: string): StateVariant {
  return {
    id: `variant-authority-${stateId}-${artifactId}`,
    logicalStateId: stateId,
    label: `${stateLabel} · 权威参考`,
    status: "approved",
    imageArtifactId: artifactId,
    origin: { kind: "reference" },
  };
}

export function ensureAuthorityVariants(project: CharacterProject): CharacterProject {
  const variants = [...project.variants];
  const authorityByState = new Map<string, StateVariant>();
  for (const state of project.logicalStates) {
    if (!state.referenceArtifactId) continue;
    let authority = variants.find((variant) =>
      variant.logicalStateId === state.id &&
      variant.imageArtifactId === state.referenceArtifactId &&
      variant.origin.kind === "reference" &&
      !variant.origin.transitionId);
    if (!authority) {
      authority = authorityVariantFor(state.id, state.label, state.referenceArtifactId);
      variants.push(authority);
    } else if (authority.label !== `${state.label} · 权威参考`) {
      const index = variants.findIndex((variant) => variant.id === authority?.id);
      authority = { ...authority, label: `${state.label} · 权威参考` };
      if (index >= 0) variants[index] = authority;
    }
    authorityByState.set(state.id, authority);
  }
  const existingInitial = variants.find((variant) => variant.id === project.initialVariantId);
  const initialLogicalStateId = existingInitial?.logicalStateId ?? project.logicalStates[0]?.id;
  return {
    ...project,
    variants,
    initialVariantId: authorityByState.get(initialLogicalStateId ?? "")?.id ?? project.initialVariantId,
    logicalStates: project.logicalStates.map((state) => ({
      ...state,
      defaultVariantId: authorityByState.get(state.id)?.id ?? state.defaultVariantId,
      preferredOutboundVariantId: state.preferredOutboundVariantId ?? state.defaultVariantId ?? authorityByState.get(state.id)?.id,
    })),
  };
}

export function activateAuthorityReference(project: CharacterProject, stateId: string, artifactId: string): CharacterProject {
  const previousState = project.logicalStates.find((state) => state.id === stateId);
  const activated = ensureAuthorityVariants({
    ...project,
    logicalStates: project.logicalStates.map((state) => state.id === stateId ? {
      ...state,
      referenceArtifactId: artifactId,
      referenceArtifactIds: [...new Set([...(state.referenceArtifactIds ?? []), artifactId])],
    } : state),
  });
  const authorityVariant = activated.variants.find((variant) =>
    variant.logicalStateId === stateId && variant.imageArtifactId === artifactId && variant.origin.kind === "reference" && !variant.origin.transitionId);
  return {
    ...activated,
    logicalStates: activated.logicalStates.map((state) => state.id === stateId && (
      !previousState?.preferredOutboundVariantId || previousState.preferredOutboundVariantId === previousState.defaultVariantId
    ) ? { ...state, preferredOutboundVariantId: authorityVariant?.id } : state),
    transitions: activated.transitions.map((transition) => {
      const usesActivatedSource = transition.fromVariantId === templateSourceVariantId(stateId);
      const usesActivatedTarget = transition.toLogicalStateId === stateId;
      const usesActivatedGuidance = transition.guidanceArtifactIds?.includes(templateGuidanceArtifactId(stateId));
      if (!usesActivatedSource && !usesActivatedTarget && !usesActivatedGuidance) return transition;
      const fromVariantId = usesActivatedSource && authorityVariant ? authorityVariant.id : transition.fromVariantId;
      const targetDraftArtifactId = usesActivatedTarget ? artifactId : transition.targetDraftArtifactId;
      return {
        ...transition,
        fromVariantId,
        targetDraftArtifactId,
        guidanceArtifactIds: transition.guidanceArtifactIds?.map((id) => id === templateGuidanceArtifactId(stateId) ? artifactId : id),
        status: transition.status === "approved" ? "approved" : targetDraftArtifactId && !fromVariantId.startsWith("template-source-") ? "target-ready" : "draft",
        toVariantId: usesActivatedTarget && transition.status === "approved" && transition.endFrameSource === "authority-reference"
          ? authorityVariant?.id
          : transition.toVariantId,
      };
    }),
  };
}

export function promoteReferenceToInitialState(
  project: CharacterProject,
  stateId: string,
  _createId: () => string = () => crypto.randomUUID(),
): CharacterProject {
  const state = project.logicalStates.find((candidate) => candidate.id === stateId);
  const reference = project.artifacts.find((artifact) => artifact.id === state?.referenceArtifactId);
  if (!state || !reference) throw new Error("Initial state requires an active authority reference.");
  const activated = activateAuthorityReference(project, stateId, reference.id);
  const authority = activated.variants.find((variant) =>
    variant.logicalStateId === state.id && variant.imageArtifactId === reference.id && variant.origin.kind === "reference" && !variant.origin.transitionId);
  return { ...activated, initialVariantId: authority?.id ?? activated.initialVariantId };
}
