import { characterProjectSchema, type Artifact, type CharacterProject, type GenerationJob, type StateVariant } from "@petlord/schema";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@petlord/generation";
import { defaultProjectPlugins } from "./firstPartyPlugins";
import { lotteryHiResProject } from "./lotteryHiResProject";
import { createProjectTemplateGraph, projectTemplates } from "./projectTemplates";
import { defaultStyleProfiles } from "./styleLibrary";

export const lotteryStardewProjectId = "project-lottery-cozy-farm-pixel-v3";
const createdAt = "2026-09-01T04:56:24.957Z";
const updatedAt = "2026-09-01T05:16:59.921Z";
const style = defaultStyleProfiles.find((candidate) => candidate.id === "style-cozy-farm-rpg-pixel")!;
const identityArtifact = structuredClone(lotteryHiResProject.artifacts.find((artifact) => artifact.id === lotteryHiResProject.referenceArtifactIds[0])!);

const stateGenerations = [
  { stateId: "state-sitting", jobId: "12467c42-bf62-47f9-b483-69619334dd7c", label: "坐着", selected: 0, uris: ["/api/media/4abc8167-07e7-4c91-a8e0-32ba17ef3d25.png", "/api/media/ab05518b-6d69-4005-b13e-040d76ab6ef4.png", "/api/media/eee68766-3188-4c04-9055-5f0df2acf53c.png"] },
  { stateId: "state-lying", jobId: "9def3b50-4936-4731-a3f4-a2c1f77cdb2d", label: "趴着", selected: 0, uris: ["/api/media/0fd61923-f2d1-4151-b3e2-c92ee8b4d661.png", "/api/media/eaa646a1-0a2f-4b68-b9aa-156536c0e9b0.png", "/api/media/ac45598c-116e-4ae8-9a9e-4e78bf0d5b77.png"] },
  { stateId: "state-sleeping", jobId: "148c5e78-37c4-41b5-9250-a87aaf1999c2", label: "睡觉", selected: 0, uris: ["/api/media/eca7e282-90a1-4783-a85a-738f2b52648f.png", "/api/media/20186d0e-0c0b-42c1-b947-9348e6626e26.png", "/api/media/d8de3e8d-a8e6-4a73-a69c-481347cac4b8.png"] },
  { stateId: "state-bowing", jobId: "50ad192b-f678-4bb6-83b4-db6656108f07", label: "鞠躬", selected: 1, uris: ["/api/media/dd57a049-31bb-4ae7-8f17-9d9a1cf8a0dc.png", "/api/media/e41d4a50-9d42-4952-8617-8aba31f65192.png", "/api/media/af8aae48-bbd1-406d-8fa3-b8505e28998a.png"] },
] as const;

function draftArtifactId(jobId: string, index: number) {
  return `artifact-draft-${jobId}-${index + 1}`;
}

function authorityVariantId(stateId: string) {
  return `variant-stardew-authority-${stateId}`;
}

const stateArtifacts: Artifact[] = stateGenerations.flatMap((generation) => generation.uris.map((uri, index) => ({
  id: draftArtifactId(generation.jobId, index),
  kind: "state-draft" as const,
  uri,
  mimeType: "image/png",
  createdAt,
  sourceJobId: generation.jobId,
  provenance: "generated" as const,
  targetStateId: generation.stateId,
  candidateGroupId: generation.jobId,
  candidateIndex: index,
  pixelWidth: 2048,
  pixelHeight: 2048,
  hasAlpha: true,
  transparencyMethod: "apple-vision-foreground-mask" as const,
  label: `${generation.label} · 候选 ${index + 1}${index === generation.selected ? "（采用）" : ""}`,
})));
const selectedArtifactByState = new Map<string, string>(stateGenerations.map((generation) => [generation.stateId, draftArtifactId(generation.jobId, generation.selected)]));
const starter = projectTemplates.find((template) => template.id === "starter")!;
const graph = createProjectTemplateGraph(starter, "Lottery");
const authorityVariants: StateVariant[] = graph.logicalStates.map((state) => ({
  id: authorityVariantId(state.id),
  logicalStateId: state.id,
  label: `${state.label} · 权威参考`,
  status: "approved",
  imageArtifactId: selectedArtifactByState.get(state.id)!,
  origin: { kind: "reference" },
}));
const sleepTailVariant: StateVariant = {
  id: "variant-stardew-sleep-video-tail",
  logicalStateId: "state-sleeping",
  label: "睡觉 · 趴下视频稳定尾帧",
  status: "approved",
  imageArtifactId: "artifact-tail-stardew-rest-sleep",
  origin: { kind: "transition-tail", transitionId: "template-rest-sleep" },
};
const variants = [...authorityVariants, sleepTailVariant];
const preferredVariantByState = new Map<string, string>(authorityVariants.map((variant) => [variant.logicalStateId, variant.id]));
preferredVariantByState.set("state-sleeping", sleepTailVariant.id);
const logicalStates = graph.logicalStates.map((state) => ({
  ...state,
  referenceArtifactId: selectedArtifactByState.get(state.id),
  referenceArtifactIds: stateGenerations.find((generation) => generation.stateId === state.id)?.uris.map((_, index) => draftArtifactId(stateGenerations.find((generation) => generation.stateId === state.id)!.jobId, index)) ?? [],
  defaultVariantId: authorityVariantId(state.id),
  preferredOutboundVariantId: preferredVariantByState.get(state.id),
}));
const videoArtifacts: Artifact[] = [
  { id: "artifact-video-stardew-sit-idle", kind: "transition-video", uri: "/api/media/1f7a18aa-fbcf-4f80-9174-f411b0b7a727.webm", mimeType: "video/webm", createdAt: updatedAt, sourceJobId: "5e6ca469-31f9-4b01-88a2-1064c05f8949", provenance: "generated", pixelWidth: 480, pixelHeight: 480, silent: true, hasAlpha: true, transparencyMethod: "apple-vision-foreground-mask", label: "坐着持续呼吸、眨眼和动耳朵 · 透明视频" },
  { id: "artifact-tail-stardew-sit-idle", kind: "state-actual", uri: "/api/media/9aa9f51c-49d8-4923-bc4f-22a4beadb79a.png", mimeType: "image/png", createdAt: updatedAt, sourceJobId: "5e6ca469-31f9-4b01-88a2-1064c05f8949", provenance: "generated", pixelWidth: 480, pixelHeight: 480, hasAlpha: true, transparencyMethod: "apple-vision-foreground-mask", label: "坐姿待机尾帧" },
  { id: "artifact-video-stardew-rest-sleep", kind: "transition-video", uri: "/api/media/29489c2c-cb09-43fd-b63c-8d1cc1ad0341.webm", mimeType: "video/webm", createdAt: updatedAt, sourceJobId: "3d1e5917-b7e9-46c0-90dd-0974672eb128", provenance: "generated", pixelWidth: 480, pixelHeight: 480, silent: true, hasAlpha: true, transparencyMethod: "apple-vision-foreground-mask", label: "趴着到睡觉 · 透明视频" },
  { id: "artifact-tail-stardew-rest-sleep", kind: "state-actual", uri: "/api/media/9dd85c34-20fc-45e9-b09f-65279684d1d7.png", mimeType: "image/png", createdAt: updatedAt, sourceJobId: "3d1e5917-b7e9-46c0-90dd-0974672eb128", provenance: "generated", pixelWidth: 480, pixelHeight: 480, hasAlpha: true, transparencyMethod: "apple-vision-foreground-mask", label: "趴着到睡觉 · 实际展示尾帧" },
];

function mediaVersion(id: string, label: string, videoArtifactId: string, tailArtifactId: string, sourceJobId: string) {
  return { id, label, videoArtifactId, tailArtifactId, createdAt: updatedAt, sourceJobId, transparent: true, durationMs: 4000, selectedEndMs: 4000, generationModel: DEFAULT_VIDEO_MODEL, chromaKeyColor: "#00FF00", playback: { mode: "forward" as const, repeatMode: "fixed" as const, minCycles: 1, maxCycles: 1, segmentStartMs: 0 } };
}

const transitions = graph.transitions.map((transition) => {
  const fromStateId = transition.fromVariantId.startsWith("template-source-")
    ? transition.fromVariantId.slice("template-source-".length)
    : variants.find((variant) => variant.id === transition.fromVariantId)?.logicalStateId;
  if (!fromStateId) return transition;
  const targetArtifactId = selectedArtifactByState.get(transition.toLogicalStateId)!;
  const guidanceArtifactIds = transition.guidanceArtifactIds?.map((id) => id.startsWith("template-guidance-") ? selectedArtifactByState.get(id.slice("template-guidance-".length)) ?? id : id);
  const base = {
    ...transition,
    fromVariantId: preferredVariantByState.get(fromStateId)!,
    targetDraftArtifactId: targetArtifactId,
    guidanceArtifactIds,
    status: "target-ready" as const,
    toVariantId: authorityVariantId(transition.toLogicalStateId),
  };
  if (transition.id === "template-sit-blink") {
    const version = mediaVersion("media-version-stardew-sit-idle", transition.label, "artifact-video-stardew-sit-idle", "artifact-tail-stardew-sit-idle", "5e6ca469-31f9-4b01-88a2-1064c05f8949");
    return { ...base, status: "approved" as const, endFrameSource: "source-frame" as const, toVariantId: base.fromVariantId, videoArtifactId: version.videoArtifactId, extractedTailArtifactId: version.tailArtifactId, mediaVersions: [version], activeMediaVersionId: version.id, sourceVideoDurationMs: 4000, selectedEndMs: 4000, durationMs: 4000, playback: version.playback, lastGenerationModel: DEFAULT_VIDEO_MODEL, lastChromaKeyColor: "#00FF00", lastGenerationPrompt: style.videoPrompt };
  }
  if (transition.id === "template-rest-sleep") {
    const version = mediaVersion("media-version-stardew-rest-sleep", transition.label, "artifact-video-stardew-rest-sleep", "artifact-tail-stardew-rest-sleep", "3d1e5917-b7e9-46c0-90dd-0974672eb128");
    return { ...base, status: "approved" as const, endFrameSource: "video-frame" as const, toVariantId: sleepTailVariant.id, videoArtifactId: version.videoArtifactId, extractedTailArtifactId: version.tailArtifactId, mediaVersions: [version], activeMediaVersionId: version.id, sourceVideoDurationMs: 4000, selectedEndMs: 4000, durationMs: 4000, playback: version.playback, lastGenerationModel: DEFAULT_VIDEO_MODEL, lastChromaKeyColor: "#00FF00", lastGenerationPrompt: style.videoPrompt };
  }
  return base;
});

const imageJobs: GenerationJob[] = stateGenerations.map((generation) => ({
  id: generation.jobId,
  kind: "state-draft",
  status: "succeeded",
  progress: 100,
  prompt: `${generation.label} · ${style.name}`,
  provider: "volcengine-ark",
  model: DEFAULT_IMAGE_MODEL,
  createdAt,
  outputArtifactIds: generation.uris.map((_, index) => draftArtifactId(generation.jobId, index)),
  cost: { status: "settled", source: "unit-output", estimatedMinCny: 0.66, estimatedMaxCny: 0.66, actualCny: 0.66, basis: "按 ¥0.22/张 × 3 张结算" },
}));
const videoJobs: GenerationJob[] = [
  { id: "5e6ca469-31f9-4b01-88a2-1064c05f8949", kind: "transition", status: "succeeded", progress: 100, prompt: "坐着持续呼吸、眨眼和动耳朵", provider: "volcengine-ark", model: DEFAULT_VIDEO_MODEL, createdAt, outputArtifactIds: ["artifact-video-stardew-sit-idle", "artifact-tail-stardew-sit-idle"], assembledPrompt: style.videoPrompt, chromaKeyColor: "#00FF00", cost: { status: "settled", source: "provider-usage", estimatedMinCny: 0.8924, estimatedMaxCny: 0.8924, actualCny: 0.8924, basis: "火山任务返回 38,800 个视频 token" } },
  { id: "3d1e5917-b7e9-46c0-90dd-0974672eb128", kind: "transition", status: "succeeded", progress: 100, prompt: "趴着 1 分钟后睡觉", provider: "volcengine-ark", model: DEFAULT_VIDEO_MODEL, createdAt, outputArtifactIds: ["artifact-video-stardew-rest-sleep", "artifact-tail-stardew-rest-sleep"], assembledPrompt: style.videoPrompt, chromaKeyColor: "#00FF00", cost: { status: "settled", source: "provider-usage", estimatedMinCny: 0.8924, estimatedMaxCny: 0.8924, actualCny: 0.8924, basis: "火山任务返回 38,800 个视频 token" } },
];

const project: CharacterProject = {
  schemaVersion: 1,
  id: lotteryStardewProjectId,
  name: "Lottery · 星露谷 2D 像素风",
  characterName: "Lottery",
  identityProfileId: lotteryHiResProject.identityProfileId,
  stylePrompt: style.imagePrompt,
  imageStylePrompt: style.imagePrompt,
  videoStylePrompt: style.videoPrompt,
  identityPrompt: lotteryHiResProject.identityPrompt,
  generationBudgetCny: 30,
  generationSettings: { imageModel: DEFAULT_IMAGE_MODEL, imageMode: "native-image", videoModel: DEFAULT_VIDEO_MODEL, imageResolution: "2K", imageCandidateCount: 3, videoResolution: "480p", ratio: "1:1", durationMode: "fixed", durationSeconds: 4 },
  // 96 logical pixels shown at 384px is an exact 4x scale. It preserves the
  // generated eye clusters without soft resampling or uneven CSS pixel widths.
  runtimePresentation: { defaultFrameRate: 12, defaultRenderResolution: 96, defaultPixelGridSize: 96, defaultDisplaySize: 384, pixelated: true },
  videoBackground: { mode: "auto", autoColor: "#00FF00", manualColor: "#FFFFFF", analyzedAt: createdAt },
  order: { orderNumber: "QA-LOTTERY-STARDEW-V3", customerName: "内部风格验证", contact: "", channel: "private", status: "creating", quotedPriceCny: 0, depositCny: 0, finalPaymentCny: 0, revisionLimit: 0, revisionUsed: 0, notes: "四状态星露谷感 2D 像素项目；图片和视频提示词由风格实验室分别调试。", serviceTemplateId: "starter", manualCosts: [], deliveryChecklist: { customerApproved: false, desktopTested: false, packageDelivered: false }, reviewRounds: [] },
  referenceArtifactIds: [identityArtifact.id],
  initialVariantId: authorityVariantId("state-sitting"),
  logicalStates,
  variants,
  transitions,
  artifacts: [identityArtifact, ...stateArtifacts, ...videoArtifacts],
  jobs: [...videoJobs, ...imageJobs],
  plugins: structuredClone(defaultProjectPlugins),
  updatedAt,
};

export const lotteryStardewProject = characterProjectSchema.parse(project);
