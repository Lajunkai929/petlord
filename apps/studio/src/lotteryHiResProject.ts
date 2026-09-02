import type { Artifact, CharacterProject, GenerationJob, LogicalState, StateVariant } from "@petlord/schema";
import { assembleTransitionPrompt, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@petlord/generation";
import { defaultProjectPlugins } from "./firstPartyPlugins";
import { applyCompanionInteractionRecipe } from "./interactionRecipes";

export const lotteryHiResProjectId = "project-da78d9d8-80b4-4297-82d4-831ceeb013f6";

const createdAt = "2026-08-31T05:04:33.820Z";
const updatedAt = "2026-08-31T05:42:24.050Z";
const identityPrompt = "Lottery 是一只矮壮的黑棕色小型犬：宽而紧凑的圆脸、距离较近的深色圆眼、短而宽的嘴、圆钝黑鼻、对称棕色眉点、黑色眼罩、粗脖子、桶状躯干、很短的四肢和奶油色尾尖。不要泛化为标准柴犬。";
const stylePrompt = `高品质治愈系 2D 游戏宠物角色精绘母版，专门用于后续缩小为 64×64 的低分辨率游戏角色；当前输出保持 2K 高清、干净、非像素化。设计顺序必须是：先保证一眼可认的整体轮廓，再保证脸部身份，最后才是细节。温暖、可爱、具有乡村生活 RPG 宠物伙伴的亲切感，但不复制任何现有游戏角色。

严格服从参考图中的 Lottery 身份，不要美化成标准柴犬、秋田犬或通用卡通犬。Lottery 必须是矮、宽、紧凑的黑棕色小型犬：头宽接近躯干宽度，脸短而圆，口鼻非常短宽，双眼距离近，耳朵相对头部不能过大；脖子粗，胸腔宽，桶状身体贴近地面，腿长不超过身体高度的四分之一。禁止修长腿、尖长脸、细腰、夸张大耳和标准柴犬比例。

身份标记必须严格保留并做成连续大色块：对称棕色眉点、清楚的黑色眼罩、两侧面颊棕色块、胸前棕色块、短腿棕色块和奶油色尾尖。眼睛是两枚分离的小型深色椭圆，鼻子是独立的圆钝黑色形状；不要水汪汪的动漫大眼、长睫毛和复杂眼睛高光。缩小后仍必须一眼分辨眉点、眼睛、鼻子、眼罩和尾尖。

使用 7–10 个稳定绘画色构成角色，深棕色外轮廓连续、粗细统一。每个毛色区域必须是边界干净的连贯形状；阴影只允许一档硬边暗面和极少量高光。禁止摄影毛发、细碎毛刺、柔焦、渐变堆叠、噪点、点状纹理、薄线装饰和海报式复杂细节。

固定略带俯视的 3/4 游戏视角，完整全身，角色占正方形画面约 78%，四肢、耳朵和尾巴轮廓互不粘连。固定机位、方向、缩放、焦距与画布位置。纯色背景，无地面、无投影、无场景、无文字、无边框。`;

const stateDefinitions = [
  { id: "state-sitting", key: "idle", label: "坐着", description: "端正但放松地坐着并看向用户", x: 80, y: 70 },
  { id: "state-lying", key: "rest", label: "趴着", description: "抬头趴着，作为主要待机状态", x: 420, y: 240 },
  { id: "state-sleeping", key: "sleep", label: "睡觉", description: "蜷缩并把头放在前爪上熟睡", x: 780, y: 70 },
  { id: "state-c324554a-9fbf-4a27-824d-5658866a75b2", key: "play", label: "翻肚皮", description: "仰躺露出肚皮，四只短爪自然抬起", x: 780, y: 420 },
  { id: "state-bowing", key: "greet", label: "鞠躬", description: "前腿伸展、胸口放低做礼貌鞠躬", x: 1120, y: 240 },
] as const;

const imageGenerations = [
  { jobId: "26df458f-8d62-4565-a472-724ccc738854", stateId: "state-sitting", uri: "/api/media/34c83988-3219-40f9-9c37-664b6248216e.png", label: "坐着 · 候选 1", active: true },
  { jobId: "522be309-82f5-42de-933a-465227930dc4", stateId: "state-lying", uri: "/api/media/560fa401-09be-4c18-a10c-2b83e5879d5d.png", label: "趴着 · 候选 1", active: true },
  { jobId: "9036d9bf-7ddd-4efa-a06b-550f928143e5", stateId: "state-sleeping", uri: "/api/media/8eab1a75-2121-45ed-991b-0661d27df598.png", label: "睡觉 · 候选 1", active: true },
  { jobId: "0fb320da-ba56-44be-913e-e870192409c4", stateId: "state-bowing", uri: "/api/media/41145561-0c73-4439-b5b8-0f91b8c1a61a.png", label: "鞠躬 · 候选 1", active: false },
  { jobId: "bbe622f9-128a-4729-9062-abc41d1a7648", stateId: "state-bowing", uri: "/api/media/ef20bd40-f23f-4cb3-99c0-452b071f4162.png", label: "鞠躬 · 候选 2（采用）", active: true },
  { jobId: "13624b49-0c59-4046-bf8e-fb68d42b1571", stateId: "state-c324554a-9fbf-4a27-824d-5658866a75b2", uri: "/api/media/0f0c8176-c5e9-4852-9b1e-0e2dab9f6425.png", label: "翻肚皮 · 候选 1", active: false },
  { jobId: "45f28987-e8d4-4a13-bb5e-1d279034399a", stateId: "state-c324554a-9fbf-4a27-824d-5658866a75b2", uri: "/api/media/f9960377-60fc-46cf-95df-bf688309b66c.png", label: "翻肚皮 · 候选 2（采用）", active: true },
] as const;

const transitionGenerations = [
  { jobId: "66b36b37-b4a8-42ce-9a11-c1106b807b0a", transitionId: "recipe-companion-rest-sleep", video: "/api/media/84a55b79-5b64-408b-8f7f-36059c17ca33.webm", tail: "/api/media/c6e888bc-27d0-4795-924e-87efa097fa83.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "35710d23-00eb-4727-998c-3103aabc3bb4", transitionId: "recipe-companion-rest-ear", video: "/api/media/33e02a7a-0156-43d0-8e07-724ab95b01fd.webm", tail: "/api/media/06500416-3aa6-476c-ab0d-13dcf0f77f98.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "0d772c5c-3992-4be2-a69b-a33e0fe61602", transitionId: "recipe-companion-rest-belly", video: "/api/media/9b64aefd-4b31-46af-83aa-eef0a7132c38.webm", tail: "/api/media/82a7c771-0e75-4267-9a24-d716916dcf68.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "96bc5915-a296-4499-94ae-67d29da37503", transitionId: "recipe-companion-rest-sit", video: "/api/media/08ab43ef-039e-4898-87ff-d74b0a5fc39d.webm", tail: "/api/media/c932bac4-4825-488a-aeed-4fe7e2a9e9b2.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "3ae34232-52c4-4dd6-8234-97964c2fc506", transitionId: "recipe-companion-belly-wiggle", video: "/api/media/e945609f-dbce-47d1-80b4-f46026b7d38e.webm", tail: "/api/media/a138fb10-32e5-42dd-9f8e-a3c1e1633fd4.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "82a7e24e-b10b-4872-8858-2e2dd59c2f13", transitionId: "recipe-companion-belly-rest", video: "/api/media/f89d5992-79de-45ef-9d94-974ed34e6aff.webm", tail: "/api/media/11e7b3c9-9ef5-4c5d-8a71-3ca658c2f839.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "d768cb63-3b67-4296-9669-32e6d60ff0d6", transitionId: "recipe-companion-sit-rest", video: "/api/media/2b042112-4ce0-4cf3-9319-9878a5478851.webm", tail: "/api/media/4a43c308-be53-4a91-bd1a-f7214760e9cd.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "dd73ad00-e80b-446e-9da7-28b65595bf81", transitionId: "recipe-companion-sit-blink", video: "/api/media/7b8482ed-fd39-4b10-b353-5a54b9695645.webm", tail: "/api/media/47094ae0-281b-4176-9435-1d3cb643dc6a.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "3ffb96a1-108f-4514-a657-319ba778d671", transitionId: "recipe-companion-sleep-breathe", video: "/api/media/b591c9bd-cba5-4e4b-b8a9-585b47632cc2.webm", tail: "/api/media/6766b67b-a4b6-4947-a14c-13fc0b8c05f9.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "910ebf1b-03c7-4ba3-9946-016024c936a2", transitionId: "recipe-companion-sleep-dream", video: "/api/media/b82d1352-ebb6-4d69-8c41-ac50b7d6a9c8.webm", tail: "/api/media/1cdb4023-c6ce-479b-ae81-74066a62c2f1.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "4fb4effb-5fc5-46fb-80f7-6a123c3a4ac8", transitionId: "recipe-companion-sleep-wake", video: "/api/media/aba82ac9-f40d-4144-bd80-15f748b16a59.webm", tail: "/api/media/eb02cf16-35a9-4f72-a13c-5b1d3af4fd1a.png", durationMs: 5000, actualCny: 2.5047 },
  { jobId: "cc67ccdc-0312-444d-819e-e38201ef1e78", transitionId: "recipe-companion-rest-greet", video: "/api/media/1915925e-da7e-4877-886b-326017a0d286.webm", tail: "/api/media/7addf946-7ca5-414e-b9b1-46e0143966fe.png", durationMs: 4000, actualCny: 2.0079 },
  { jobId: "bc779399-8d82-45d1-b5a7-1a578ff80a74", transitionId: "recipe-companion-greet-rest", video: "/api/media/0e613070-13f4-4727-995b-ee7370db8324.webm", tail: "/api/media/69ee2325-dfc7-4047-8950-d5e02bacefca.png", durationMs: 4000, actualCny: 2.0079 },
] as const;

const pingPongGenerations = [
  { transitionId: "recipe-companion-rest-ear", video: "/api/media/642ac56e-7560-4cbf-bbd4-e90d8a5dba84.webm", tail: "/api/media/17393020-fc7c-4f2b-9848-f6294c411fe5.png", durationMs: 3200, segmentStartMs: 0, segmentEndMs: 1600, repeatMode: "fixed", minCycles: 1, maxCycles: 1 },
  { transitionId: "recipe-companion-belly-wiggle", video: "/api/media/333447e9-042a-42af-8f8b-a34c2da4a494.webm", tail: "/api/media/f65cefff-be6f-490a-88dc-3057bbd89170.png", durationMs: 3200, segmentStartMs: 0, segmentEndMs: 1600, repeatMode: "random", minCycles: 2, maxCycles: 4 },
  { transitionId: "recipe-companion-sit-blink", video: "/api/media/e3bf950b-7086-49b8-a129-b92a0bf6a5bb.webm", tail: "/api/media/3ba39943-5cf3-4b91-bcc8-623d4a76a851.png", durationMs: 2800, segmentStartMs: 0, segmentEndMs: 1400, repeatMode: "fixed", minCycles: 1, maxCycles: 1 },
  { transitionId: "recipe-companion-sleep-breathe", video: "/api/media/1673b04a-5a1e-4b5c-ac68-486cf1900812.webm", tail: "/api/media/ea21714a-c863-47dd-a10e-2c087bd6a667.png", durationMs: 3200, segmentStartMs: 0, segmentEndMs: 1600, repeatMode: "fixed", minCycles: 1, maxCycles: 1 },
  { transitionId: "recipe-companion-sleep-dream", video: "/api/media/cff24f3d-81ea-4e72-bece-7ef0bb36e006.webm", tail: "/api/media/25f76a4e-45c1-4feb-9976-0bde68a4cad5.png", durationMs: 2800, segmentStartMs: 0, segmentEndMs: 1400, repeatMode: "fixed", minCycles: 1, maxCycles: 1 },
] as const;

function draftArtifactId(jobId: string) {
  return `artifact-draft-${jobId}-1`;
}

function authorityVariantId(stateId: string) {
  return `variant-hires-authority-${stateId}`;
}

const stateArtifacts: Artifact[] = imageGenerations.map((generation) => ({
  id: draftArtifactId(generation.jobId),
  kind: "state-draft",
  uri: generation.uri,
  mimeType: "image/png",
  createdAt,
  sourceJobId: generation.jobId,
  provenance: "generated",
  targetStateId: generation.stateId,
  candidateGroupId: generation.jobId,
  candidateIndex: 0,
  pixelWidth: 2048,
  pixelHeight: 2048,
  hasAlpha: true,
  transparencyMethod: "apple-vision-foreground-mask",
  label: generation.label,
}));

const activeImage = (stateId: string) => imageGenerations.find((generation) => generation.stateId === stateId && generation.active)!;

const logicalStates: LogicalState[] = stateDefinitions.map((state) => {
  const references = imageGenerations.filter((generation) => generation.stateId === state.id).map((generation) => draftArtifactId(generation.jobId));
  const activeArtifactId = draftArtifactId(activeImage(state.id).jobId);
  return {
    id: state.id,
    label: state.label,
    semanticKey: state.key,
    description: state.description,
    position: { x: state.x, y: state.y },
    referenceArtifactId: activeArtifactId,
    referenceArtifactIds: references,
    defaultVariantId: authorityVariantId(state.id),
    preferredOutboundVariantId: authorityVariantId(state.id),
    idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8_000, maxIntervalMs: 18_000, avoidImmediateRepeat: true },
  };
});

const variants: StateVariant[] = stateDefinitions.map((state) => ({
  id: authorityVariantId(state.id),
  logicalStateId: state.id,
  label: `${state.label} · 权威参考`,
  status: "approved",
  imageArtifactId: draftArtifactId(activeImage(state.id).jobId),
  origin: { kind: "reference" },
}));

const identityArtifact: Artifact = {
  ...stateArtifacts.find((artifact) => artifact.id === draftArtifactId(activeImage("state-sitting").jobId))!,
  id: "artifact-hires-identity-master",
  kind: "identity-reference",
  targetStateId: undefined,
  candidateGroupId: undefined,
  candidateIndex: undefined,
  label: "Lottery · Seedream 高清身份主参考",
};

const baseProject: CharacterProject = {
  schemaVersion: 1,
  id: lotteryHiResProjectId,
  name: "Lottery · 高清母版像素呈现",
  characterName: "Lottery",
  stylePrompt,
  identityPrompt,
  generationBudgetCny: 40,
  generationSettings: {
    imageModel: DEFAULT_IMAGE_MODEL,
    imageMode: "native-image",
    videoModel: DEFAULT_VIDEO_MODEL,
    imageResolution: "2K",
    imageCandidateCount: 1,
    videoResolution: "720p",
    ratio: "1:1",
    durationMode: "fixed",
    durationSeconds: 4,
  },
  runtimePresentation: { defaultFrameRate: 12, defaultRenderResolution: 96, defaultPixelGridSize: 64, defaultDisplaySize: 320, pixelated: true },
  videoBackground: { mode: "auto", autoColor: "#00FF00", manualColor: "#FFFFFF", analyzedAt: createdAt },
  order: {
    orderNumber: "QA-LOTTERY-HIRES",
    customerName: "产品验收",
    contact: "本机验证",
    channel: "private",
    status: "review",
    quotedPriceCny: 30,
    depositCny: 0,
    finalPaymentCny: 0,
    revisionLimit: 99,
    revisionUsed: 0,
    notes: "生成阶段使用为小尺寸可读性优化的高清 2D 母版；运行时再通过固定调色板、64 格网格与 nearest-neighbor 呈现像素艺术。",
    serviceTemplateId: "lottery-hires-runtime-pixel",
    manualCosts: [],
    deliveryChecklist: { customerApproved: false, desktopTested: false, packageDelivered: false },
    reviewRounds: [],
  },
  referenceArtifactIds: [identityArtifact.id],
  initialVariantId: authorityVariantId("state-lying"),
  logicalStates,
  variants,
  transitions: [],
  artifacts: [identityArtifact, ...stateArtifacts],
  jobs: [],
  plugins: structuredClone(defaultProjectPlugins),
  updatedAt,
};

const recipeProject = applyCompanionInteractionRecipe(baseProject);
const transitionArtifacts: Artifact[] = transitionGenerations.flatMap((generation) => [
  {
    id: `artifact-video-${generation.jobId}`,
    kind: "transition-video" as const,
    uri: generation.video,
    mimeType: "video/webm",
    createdAt: updatedAt,
    sourceJobId: generation.jobId,
    provenance: "generated" as const,
    pixelWidth: 720,
    pixelHeight: 720,
    silent: true,
    hasAlpha: true,
    transparencyMethod: "apple-vision-foreground-mask",
    label: `${recipeProject.transitions.find((transition) => transition.id === generation.transitionId)?.label} · Apple Vision 透明视频`,
  },
  {
    id: `artifact-tail-auto-${generation.jobId}`,
    kind: "state-actual" as const,
    uri: generation.tail,
    mimeType: "image/png",
    createdAt: updatedAt,
    sourceJobId: generation.jobId,
    provenance: "generated" as const,
    pixelWidth: 720,
    pixelHeight: 720,
    hasAlpha: true,
    transparencyMethod: "apple-vision-foreground-mask",
    label: `${recipeProject.transitions.find((transition) => transition.id === generation.transitionId)?.label} · 视频尾帧（保留）`,
  },
]);

const pingPongArtifacts: Artifact[] = pingPongGenerations.flatMap((generation) => [
  {
    id: `artifact-video-ping-pong-${generation.transitionId}`,
    kind: "transition-video" as const,
    uri: generation.video,
    mimeType: "video/webm",
    createdAt: updatedAt,
    provenance: "generated" as const,
    pixelWidth: 720,
    pixelHeight: 720,
    silent: true,
    hasAlpha: true,
    transparencyMethod: "apple-vision-foreground-mask" as const,
    label: `${recipeProject.transitions.find((transition) => transition.id === generation.transitionId)?.label} · 本机正反往复`,
  },
  {
    id: `artifact-tail-ping-pong-${generation.transitionId}`,
    kind: "state-actual" as const,
    uri: generation.tail,
    mimeType: "image/png",
    createdAt: updatedAt,
    provenance: "generated" as const,
    pixelWidth: 720,
    pixelHeight: 720,
    hasAlpha: true,
    transparencyMethod: "apple-vision-foreground-mask" as const,
    label: `${recipeProject.transitions.find((transition) => transition.id === generation.transitionId)?.label} · 往复循环接缝帧`,
  },
]);

const transitions = recipeProject.transitions.map((transition) => {
  const generation = transitionGenerations.find((candidate) => candidate.transitionId === transition.id)!;
  const target = recipeProject.logicalStates.find((state) => state.id === transition.toLogicalStateId)!;
  const assembledPrompt = assembleTransitionPrompt({
    identityPrompt,
    stylePrompt,
    prompt: transition.prompt,
    settings: baseProject.generationSettings,
    transparentVideo: true,
    chromaBackgroundColor: "#00FF00",
  });
  const toVariantId = transition.endFrameSource === "source-frame"
    ? transition.fromVariantId
    : authorityVariantId(target.id);
  const pingPong = pingPongGenerations.find((candidate) => candidate.transitionId === transition.id);
  const forwardPlayback = { mode: "forward" as const, repeatMode: "fixed" as const, minCycles: 1, maxCycles: 1, segmentStartMs: 0 };
  const pingPongPlayback = pingPong ? {
    mode: "ping-pong" as const,
    repeatMode: pingPong.repeatMode,
    minCycles: pingPong.minCycles,
    maxCycles: pingPong.maxCycles,
    segmentStartMs: pingPong.segmentStartMs,
    segmentEndMs: pingPong.segmentEndMs,
  } : undefined;
  const forwardVersion = {
    id: `media-version-${generation.jobId}`,
    label: `${transition.label} · Seedance 生成 1`,
    videoArtifactId: `artifact-video-${generation.jobId}`,
    tailArtifactId: `artifact-tail-auto-${generation.jobId}`,
    createdAt: updatedAt,
    sourceJobId: generation.jobId,
    transparent: true,
    durationMs: generation.durationMs,
    selectedEndMs: generation.durationMs,
    generationPrompt: assembledPrompt,
    generationModel: DEFAULT_VIDEO_MODEL,
    chromaKeyColor: "#00FF00",
    playback: forwardPlayback,
  };
  const pingPongVersion = pingPong && pingPongPlayback ? {
    id: `media-version-ping-pong-${transition.id}`,
    label: `${transition.label} · 本机正反往复 2`,
    videoArtifactId: `artifact-video-ping-pong-${transition.id}`,
    tailArtifactId: `artifact-tail-ping-pong-${transition.id}`,
    sourceVideoArtifactId: forwardVersion.videoArtifactId,
    createdAt: updatedAt,
    sourceJobId: generation.jobId,
    transparent: true,
    durationMs: pingPong.durationMs,
    selectedEndMs: pingPong.durationMs,
    generationPrompt: assembledPrompt,
    generationModel: DEFAULT_VIDEO_MODEL,
    chromaKeyColor: "#00FF00",
    playback: pingPongPlayback,
  } : undefined;
  return {
    ...transition,
    toVariantId,
    status: "approved" as const,
    videoArtifactId: pingPongVersion?.videoArtifactId ?? forwardVersion.videoArtifactId,
    extractedTailArtifactId: pingPongVersion?.tailArtifactId ?? forwardVersion.tailArtifactId,
    sourceVideoDurationMs: pingPong?.durationMs ?? generation.durationMs,
    selectedEndMs: pingPong?.durationMs ?? generation.durationMs,
    durationMs: pingPong?.durationMs ?? generation.durationMs,
    playback: pingPongPlayback ?? forwardPlayback,
    mediaVersions: pingPongVersion ? [forwardVersion, pingPongVersion] : [forwardVersion],
    activeMediaVersionId: pingPongVersion?.id ?? forwardVersion.id,
    lastGenerationPrompt: assembledPrompt,
    lastGenerationModel: DEFAULT_VIDEO_MODEL,
    lastChromaKeyColor: "#00FF00",
  };
});

const imageJobs: GenerationJob[] = imageGenerations.map((generation) => ({
  id: generation.jobId,
  kind: "state-draft",
  status: "succeeded",
  progress: 100,
  prompt: generation.label,
  provider: "volcengine-ark",
  model: DEFAULT_IMAGE_MODEL,
  createdAt,
  outputArtifactIds: [draftArtifactId(generation.jobId)],
  cost: { status: "settled", source: "unit-output", estimatedMinCny: 0.22, estimatedMaxCny: 0.22, actualCny: 0.22, basis: "按 ¥0.22/张 × 1 张结算" },
}));

const transitionJobs: GenerationJob[] = transitionGenerations.map((generation) => {
  const transition = transitions.find((candidate) => candidate.id === generation.transitionId)!;
  return {
    id: generation.jobId,
    kind: "transition",
    status: "succeeded",
    progress: 100,
    prompt: transition.label,
    provider: "volcengine-ark",
    model: DEFAULT_VIDEO_MODEL,
    createdAt,
    outputArtifactIds: [`artifact-video-${generation.jobId}`, `artifact-tail-auto-${generation.jobId}`],
    assembledPrompt: transition.lastGenerationPrompt,
    chromaKeyColor: "#00FF00",
    cost: {
      status: "settled",
      source: "provider-usage",
      estimatedMinCny: generation.actualCny,
      estimatedMaxCny: generation.actualCny,
      actualCny: generation.actualCny,
      basis: `${generation.durationMs / 1000} 秒 720p 视频任务实际结算`,
    },
  };
});

export const lotteryHiResProject: CharacterProject = {
  ...recipeProject,
  transitions,
  artifacts: [...recipeProject.artifacts, ...transitionArtifacts, ...pingPongArtifacts],
  jobs: [...transitionJobs, ...imageJobs],
  updatedAt,
};
