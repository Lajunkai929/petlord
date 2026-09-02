import { characterProjectSchema, type Artifact, type CharacterProject, type GenerationJob, type StateVariant } from "@petlord/schema";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL, materializePromptVariables } from "@petlord/generation";
import { defaultProjectPlugins } from "./firstPartyPlugins";
import { createProjectTemplateGraph } from "./projectTemplates";
import { defaultStyleProfiles } from "./styleLibrary";

export const lotteryClearProjectId = "project-lottery-clear-lively-v1";
export const lotteryRealIdentityProfileId = "identity-lottery-real-photos-v1";
const createdAt = "2026-09-01T06:11:08.082Z";
const updatedAt = "2026-09-01T07:56:00.000Z";
const style = defaultStyleProfiles.find((candidate) => candidate.id === "style-clear-lively-2d")!;
const imageStylePrompt = materializePromptVariables(style.imagePrompt, "Lottery");
const videoStylePrompt = materializePromptVariables(style.videoPrompt, "Lottery");
const identityPrompt = "Lottery 是一只矮壮的黑棕色成年小型犬：宽而紧凑的圆脸、距离较近的小型深棕犬眼、短而宽的嘴、圆钝黑鼻、对称棕色眉点、黑色眼罩、粗脖子、桶状躯干、很短的四肢和奶油色尾尖。严格依据实拍，不要泛化为标准柴犬、幼犬或卡通犬。";

const realReferences = [
  { id: "artifact-real-face-front", uri: "/api/media/lottery-real-face-front.jpg", label: "Lottery 实拍 · 清晰正脸", width: 1279, height: 1706 },
  { id: "artifact-real-face-outdoor", uri: "/api/media/lottery-real-face-outdoor.jpg", label: "Lottery 实拍 · 户外眼神", width: 1279, height: 1706 },
  { id: "artifact-real-face-smile", uri: "/api/media/lottery-real-face-smile.jpg", label: "Lottery 实拍 · 坐姿微笑", width: 1706, height: 1279 },
  { id: "artifact-real-full-body", uri: "/api/media/lottery-real-full-body.jpg", label: "Lottery 实拍 · 完整体型", width: 1279, height: 1706 },
  { id: "artifact-real-belly", uri: "/api/media/lottery-real-belly.jpg", label: "Lottery 实拍 · 腹部花色", width: 1024, height: 1820 },
  { id: "artifact-real-side-run", uri: "/api/media/lottery-real-side-run.jpg", label: "Lottery 实拍 · 侧身卷尾", width: 1280, height: 1600 },
] as const;

const stateGenerations = [
  { stateId: "state-sitting", jobId: "4c962526-c3f2-4956-8d7f-d56bf03fb131", label: "坐着", selected: 1, uris: ["/api/media/d62e6a2a-67b6-43a9-bce5-cbd253b42a69.png", "/api/media/6e5cb0b1-1534-4a22-b5a8-d768e9f7092c.png", "/api/media/12fdddb2-e49a-4b77-be67-1bb0bb542652.png"] },
  { stateId: "state-lying", jobId: "6bc51d81-cb16-4a2a-b304-bc1922c58fa9", label: "趴着", selected: 1, uris: ["/api/media/e9b1d9cc-c6f3-44ce-ad7e-36da5efd1027.png", "/api/media/be091f92-7d26-4e93-90ce-562eb2df95e0.png", "/api/media/8e811102-4412-4f00-be8f-c770faa3b783.png"] },
  { stateId: "state-sleeping", jobId: "c58b936a-202e-4351-b642-2107921fd870", label: "睡觉", selected: 1, uris: ["/api/media/7fffab60-928e-446d-8add-7872b843f9cb.png", "/api/media/4bc36409-1818-44e0-a5ea-d7f06f839c08.png", "/api/media/c8535a3d-ed7c-4764-99b8-cb150649fe40.png"] },
  { stateId: "state-belly", jobId: "8ffb7b34-36b4-4ff0-b65f-5fd289e4872d", label: "翻肚皮", selected: 1, uris: ["/api/media/831de15e-0fc7-47d0-ad7e-55fbdc51853b.png", "/api/media/a6db7072-a949-4faf-af69-71373e6fe901.png", "/api/media/5d406053-5ad8-4aec-a341-156dfd91902e.png"] },
] as const;

const transitionGenerations = [
  { transitionId: "template-sit-blink", jobId: "83f0311f-4ffd-4eed-9e52-d6a09e8c24a3", label: "坐着持续呼吸、动耳和尾尖", video: "/api/media/e63642b6-65e3-47eb-a2bb-f73f3029f928.webm", tail: "/api/media/35f9a147-bf6d-4a60-a7f2-4f0c3b2760a0.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-sit-rest", jobId: "3f502edc-2754-43b1-9459-16b3969975bb", label: "坐着 30 秒后趴下", video: "/api/media/51debe2a-6982-4946-bbe6-20edfb68d05e.webm", tail: "/api/media/b1fce512-f353-4d1f-99ca-d88f9acd0e39.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-rest-sleep", jobId: "f676f36b-f3b5-48ca-86c3-5f71c7c328f7", label: "趴着 30 秒后睡觉", video: "/api/media/a5a5b4a9-02a5-4852-b6b8-6e86e06ee56d.webm", tail: "/api/media/536ee11c-d696-41cc-9d1f-5009b8635d39.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-rest-belly", jobId: "1b365c5b-59ce-4549-8cb3-d38ff30c947e", label: "双击肚皮翻身", video: "/api/media/b7bfaf8d-8841-4326-b73e-77d4cfa37570.webm", tail: "/api/media/c9c81956-3ec7-4d13-b5ac-b940524b9b19.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-rest-sit", jobId: "24f614a5-305c-44ac-917f-e0d79eb58569", label: "点击尾巴坐起来", video: "/api/media/f704f2ac-b1c4-4db2-a5d3-e87df888b74f.webm", tail: "/api/media/ee4366ba-0282-42a0-a970-0e17ee860efb.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-belly-rest", jobId: "69217eaa-9254-4164-8df1-d4d681db82a2", label: "鼠标移开翻回趴着", video: "/api/media/3cb5f813-5a9d-4ad0-af93-1b9b5f0ff0eb.webm", tail: "/api/media/60c1d070-618f-4a18-8223-4c1e40100fec.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-sleep-wake", jobId: "707230dd-f41f-43f9-ad47-55428b89f5e3", label: "双击睡醒后趴下", video: "/api/media/47a6847c-49dc-47d6-9e90-1264f0212acc.webm", tail: "/api/media/ae919405-b573-47db-ac2b-95dbbca134dd.png", durationMs: 5000, actualCny: 1.1132 },
  { transitionId: "template-rest-ear", jobId: "16c4c349-9c7a-4bf6-a107-683f36475272", label: "趴着持续呼吸、动耳朵", video: "/api/media/aa5ed619-80ba-41a9-ba10-06fcba79a859.webm", tail: "/api/media/8dbd8db0-3a35-4792-94b7-ac1dd1e835b0.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-belly-wiggle", jobId: "563982ac-b6ac-43f1-b77f-28262364a1d4", label: "翻肚皮持续呼吸、左右晃", video: "/api/media/95fd2018-f447-4c0b-a524-2651a22f1c66.webm", tail: "/api/media/5081bcb5-edf6-4b12-97ea-dc40f78cc818.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-sleep-breathe", jobId: "5851534d-8e46-4e56-8eab-6f7b8972c35f", label: "睡觉持续呼吸起伏", video: "/api/media/80f9c751-2fc6-456d-b0be-92b6e576ec8f.webm", tail: "/api/media/e93a1534-d890-4287-bf07-3fbd17ebbec5.png", durationMs: 4000, actualCny: 0.8924 },
  { transitionId: "template-sleep-dream", jobId: "2d67a4dd-f669-441c-adbb-869b626f36ed", label: "睡觉蹬腿吧嗒嘴", video: "/api/media/136b2f01-3b48-4b12-adb3-3df36ecd3e4a.webm", tail: "/api/media/aca96178-4646-4159-972c-6a421f543490.png", durationMs: 4000, actualCny: 0.8924 },
] as const;

function draftArtifactId(jobId: string, index: number) {
  return `artifact-clear-draft-${jobId}-${index + 1}`;
}

function authorityVariantId(stateId: string) {
  return `variant-clear-authority-${stateId}`;
}

const identityArtifacts: Artifact[] = realReferences.map((reference) => ({
  id: reference.id,
  kind: "identity-reference",
  uri: reference.uri,
  mimeType: "image/jpeg",
  createdAt,
  provenance: "user-upload",
  pixelWidth: reference.width,
  pixelHeight: reference.height,
  label: reference.label,
}));

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
  label: `${generation.label} · 真实候选 ${index + 1}${index === generation.selected ? "（采用）" : ""}`,
})));
const selectedArtifactByState = new Map<string, string>(stateGenerations.map((generation) => [generation.stateId, draftArtifactId(generation.jobId, generation.selected)]));

const companionGraph = createProjectTemplateGraph("companion", "Lottery");
const allowedStateIds = new Set<string>(["state-sitting", "state-lying", "state-sleeping", "state-belly"]);
const authorityVariants: StateVariant[] = companionGraph.logicalStates
  .filter((state) => allowedStateIds.has(state.id))
  .map((state) => ({
    id: authorityVariantId(state.id),
    logicalStateId: state.id,
    label: `${state.label} · 清透真实权威参考`,
    status: "approved",
    imageArtifactId: selectedArtifactByState.get(state.id)!,
    origin: { kind: "reference" },
  }));
const logicalStates = companionGraph.logicalStates
  .filter((state) => allowedStateIds.has(state.id))
  .map((state) => {
    const generation = stateGenerations.find((candidate) => candidate.stateId === state.id)!;
    return {
      ...state,
      referenceArtifactId: selectedArtifactByState.get(state.id),
      referenceArtifactIds: generation.uris.map((_, index) => draftArtifactId(generation.jobId, index)),
      defaultVariantId: authorityVariantId(state.id),
      preferredOutboundVariantId: authorityVariantId(state.id),
    };
  });

const videoArtifactId = (jobId: string) => `artifact-clear-video-${jobId}`;
const tailArtifactId = (jobId: string) => `artifact-clear-tail-${jobId}`;
const videoArtifacts: Artifact[] = transitionGenerations.flatMap((generation) => [
  { id: videoArtifactId(generation.jobId), kind: "transition-video" as const, uri: generation.video, mimeType: "video/webm", createdAt: updatedAt, sourceJobId: generation.jobId, provenance: "generated" as const, pixelWidth: 480, pixelHeight: 480, silent: true, hasAlpha: true, transparencyMethod: "apple-vision-foreground-mask" as const, label: `${generation.label} · 透明视频` },
  { id: tailArtifactId(generation.jobId), kind: "state-actual" as const, uri: generation.tail, mimeType: "image/png", createdAt: updatedAt, sourceJobId: generation.jobId, provenance: "generated" as const, pixelWidth: 480, pixelHeight: 480, hasAlpha: true, transparencyMethod: "apple-vision-foreground-mask" as const, label: `${generation.label} · 视频尾帧（历史保留）` },
]);

const transitions: CharacterProject["transitions"] = companionGraph.transitions.flatMap((transition): CharacterProject["transitions"] => {
  const fromStateId = transition.fromVariantId.startsWith("template-source-") ? transition.fromVariantId.slice("template-source-".length) : undefined;
  if (!fromStateId || !allowedStateIds.has(fromStateId) || !allowedStateIds.has(transition.toLogicalStateId)) return [];
  const base = {
    ...transition,
    fromVariantId: authorityVariantId(fromStateId),
    toVariantId: authorityVariantId(transition.toLogicalStateId),
    targetDraftArtifactId: selectedArtifactByState.get(transition.toLogicalStateId),
    guidanceArtifactIds: [],
    status: "target-ready" as const,
  };
  const generation = transitionGenerations.find((candidate) => candidate.transitionId === transition.id);
  if (!generation) return [base];
  const selfLoop = fromStateId === transition.toLogicalStateId;
  const playback = transition.id === "template-belly-wiggle"
    ? { mode: "forward" as const, repeatMode: "random" as const, minCycles: 1, maxCycles: 2, segmentStartMs: 0 }
    : { mode: "forward" as const, repeatMode: "fixed" as const, minCycles: 1, maxCycles: 1, segmentStartMs: 0 };
  const version = { id: `media-version-clear-${generation.jobId}`, label: generation.label, videoArtifactId: videoArtifactId(generation.jobId), tailArtifactId: tailArtifactId(generation.jobId), createdAt: updatedAt, sourceJobId: generation.jobId, transparent: true, durationMs: generation.durationMs, selectedEndMs: generation.durationMs, generationModel: DEFAULT_VIDEO_MODEL, chromaKeyColor: "#00FF00", playback };
  return [{
    ...base,
    label: generation.label,
    status: "approved" as const,
    endFrameSource: selfLoop ? "source-frame" as const : "authority-reference" as const,
    toVariantId: selfLoop ? authorityVariantId(fromStateId) : authorityVariantId(transition.toLogicalStateId),
    videoArtifactId: version.videoArtifactId,
    extractedTailArtifactId: version.tailArtifactId,
    mediaVersions: [version],
    activeMediaVersionId: version.id,
    sourceVideoDurationMs: generation.durationMs,
    selectedEndMs: generation.durationMs,
    durationMs: generation.durationMs,
    entryBlendMs: selfLoop ? 320 : 420,
    authorityBridge: { mode: "crossfade" as const, durationMs: selfLoop ? 360 : 700 },
    playback,
    lastGenerationModel: DEFAULT_VIDEO_MODEL,
    lastChromaKeyColor: "#00FF00",
    lastGenerationPrompt: videoStylePrompt,
  }];
});

const imageJobs: GenerationJob[] = stateGenerations.map((generation) => ({
  id: generation.jobId,
  kind: "state-draft",
  status: "succeeded",
  progress: 100,
  prompt: `${generation.label} · 清透真实棚拍`,
  provider: "volcengine-ark",
  model: DEFAULT_IMAGE_MODEL,
  createdAt,
  outputArtifactIds: generation.uris.map((_, index) => draftArtifactId(generation.jobId, index)),
  cost: { status: "settled", source: "unit-output", estimatedMinCny: 0.66, estimatedMaxCny: 0.66, actualCny: 0.66, basis: "按 ¥0.22/张 × 3 张结算" },
}));
const videoJobs: GenerationJob[] = transitionGenerations.map((generation) => ({
  id: generation.jobId,
  kind: "transition",
  status: "succeeded",
  progress: 100,
  prompt: generation.label,
  provider: "volcengine-ark",
  model: DEFAULT_VIDEO_MODEL,
  createdAt,
  outputArtifactIds: [videoArtifactId(generation.jobId), tailArtifactId(generation.jobId)],
  assembledPrompt: videoStylePrompt,
  chromaKeyColor: "#00FF00",
  cost: { status: "settled", source: "provider-usage", estimatedMinCny: generation.actualCny, estimatedMaxCny: generation.actualCny, actualCny: generation.actualCny, basis: generation.durationMs === 5000 ? "火山任务返回 5 秒视频 token" : "火山任务返回 38,800 个视频 token" },
}));

const project: CharacterProject = {
  schemaVersion: 1,
  id: lotteryClearProjectId,
  name: "Lottery · 清透真实实拍版",
  characterName: "Lottery",
  identityProfileId: lotteryRealIdentityProfileId,
  stylePrompt: imageStylePrompt,
  imageStylePrompt,
  videoStylePrompt,
  identityPrompt,
  generationBudgetCny: 30,
  generationSettings: { imageModel: DEFAULT_IMAGE_MODEL, imageMode: "native-image", videoModel: DEFAULT_VIDEO_MODEL, imageResolution: "2K", imageCandidateCount: 3, videoResolution: "480p", ratio: "1:1", durationMode: "fixed", durationSeconds: 4 },
  runtimePresentation: { defaultFrameRate: 24, defaultRenderResolution: 480, defaultDisplaySize: 320, pixelated: false },
  videoBackground: { mode: "auto", autoColor: "#00FF00", manualColor: "#FFFFFF", analyzedAt: createdAt },
  order: { orderNumber: "QA-LOTTERY-CLEAR-REAL-V1", customerName: "内部风格验证", contact: "", channel: "private", status: "review", quotedPriceCny: 0, depositCny: 0, finalPaymentCny: 0, revisionLimit: 0, revisionUsed: 0, notes: "使用 Lottery 六张实拍照片作为顶层身份参考的清透真实完整版本；四个状态与十一条交互动画均已生成，所有候选、尾帧和失败实验持续保留。", serviceTemplateId: "companion-real-four-state", manualCosts: [], deliveryChecklist: { customerApproved: false, desktopTested: true, packageDelivered: false }, reviewRounds: [] },
  referenceArtifactIds: identityArtifacts.map((artifact) => artifact.id),
  initialVariantId: authorityVariantId("state-sitting"),
  logicalStates,
  variants: authorityVariants,
  transitions,
  artifacts: [...identityArtifacts, ...stateArtifacts, ...videoArtifacts],
  jobs: [...videoJobs, ...imageJobs],
  plugins: structuredClone(defaultProjectPlugins),
  updatedAt,
};

export const lotteryClearProject = characterProjectSchema.parse(project);
