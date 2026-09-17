import type { Artifact, CharacterProject, LogicalState, StateVariant, Transition, TransitionTrigger } from "@petlord/schema";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@petlord/generation";
import { defaultProjectPlugins } from "./firstPartyPlugins";

const createdAt = "2026-08-31T02:30:00.000Z";
const identityPrompt = "Lottery 是一只矮壮的黑棕色小型犬：宽而紧凑的圆脸、距离较近的深色圆眼、短而宽的嘴、圆钝黑鼻、对称棕色眉点、黑色眼罩、粗脖子、桶状躯干、很短的四肢和奶油色尾尖。不要泛化为标准柴犬。";

const states = [
  { id: "state-pixel-lying", key: "rest", label: "趴着", description: "前爪伸出、抬头看向用户，作为主要待机状态", image: "authority-lying-v2.png", x: 420, y: 250 },
  { id: "state-pixel-sitting", key: "idle", label: "坐着", description: "端正但放松地坐着，尾巴位于身体右侧", image: "authority-sitting.png", x: 80, y: 80 },
  { id: "state-pixel-sleeping", key: "sleep", label: "睡觉", description: "蜷缩并把下巴放在前爪上熟睡", image: "authority-sleeping-v2.png", x: 780, y: 70 },
  { id: "state-pixel-belly", key: "play", label: "翻肚皮", description: "仰躺露出肚皮，四只短爪放松抬起", image: "authority-belly-v2.png", x: 790, y: 420 },
  { id: "state-pixel-stretch", key: "greet", label: "睡醒拉伸", description: "睡眼惺忪地前腿伸展、胸口放低", image: "authority-stretch-v2.png", x: 1150, y: 250 },
] as const;

const referenceArtifacts: Artifact[] = states.map((state) => ({
  id: `artifact-pixel-${state.key}`,
  kind: "state-draft",
  uri: `/demo/lottery-pixel/${state.image}`,
  mimeType: "image/png",
  createdAt,
  provenance: "seed-generated",
  targetStateId: state.id,
  pixelWidth: 1254,
  pixelHeight: 1254,
  hasAlpha: true,
  label: `${state.label} · 星露谷像素权威参考`,
}));

const identityArtifact: Artifact = {
  id: "artifact-pixel-identity-master",
  kind: "identity-reference",
  uri: "/demo/lottery-pixel/authority-sitting.png",
  mimeType: "image/png",
  createdAt,
  provenance: "seed-generated",
  pixelWidth: 1254,
  pixelHeight: 1254,
  hasAlpha: true,
  label: "Lottery · 星露谷像素身份主参考",
};

function authorityVariantId(stateId: string) {
  return `variant-pixel-authority-${stateId}`;
}

const logicalStates: LogicalState[] = states.map((state) => ({
  id: state.id,
  label: state.label,
  semanticKey: state.key,
  description: state.description,
  position: { x: state.x, y: state.y },
  referenceArtifactId: `artifact-pixel-${state.key}`,
  referenceArtifactIds: [`artifact-pixel-${state.key}`],
  defaultVariantId: authorityVariantId(state.id),
  preferredOutboundVariantId: authorityVariantId(state.id),
  idleScheduler: state.key === "idle"
    ? { enabled: true, strategy: "weighted-random", minIntervalMs: 4_000, maxIntervalMs: 7_000, avoidImmediateRepeat: true }
    : state.key === "sleep"
      ? { enabled: true, strategy: "weighted-random", minIntervalMs: 3_000, maxIntervalMs: 7_000, avoidImmediateRepeat: true }
      : { enabled: false, strategy: "weighted-random", minIntervalMs: 8_000, maxIntervalMs: 18_000, avoidImmediateRepeat: true },
}));

const variants: StateVariant[] = states.map((state) => ({
  id: authorityVariantId(state.id),
  logicalStateId: state.id,
  label: `${state.label} · 权威参考`,
  status: "approved",
  imageArtifactId: `artifact-pixel-${state.key}`,
  origin: { kind: "reference" },
}));

const fullRegion = { shape: "ellipse" as const, x: 0.04, y: 0.04, width: 0.92, height: 0.92 };
const headRegion = { shape: "ellipse" as const, x: 0.05, y: 0.02, width: 0.48, height: 0.50 };
const bellyRegion = { shape: "ellipse" as const, x: 0.24, y: 0.30, width: 0.54, height: 0.48 };
const tailRegion = { shape: "ellipse" as const, x: 0.69, y: 0.43, width: 0.28, height: 0.42 };

function trigger(id: string, value: Omit<TransitionTrigger, "id">): TransitionTrigger {
  return { id, ...value };
}

function transition(input: {
  id: string;
  label: string;
  from: string;
  to: string;
  prompt: string;
  triggers?: TransitionTrigger[];
  idleRule?: Transition["idleRule"];
  durationSeconds?: number;
  endFrameSource?: Transition["endFrameSource"];
  guidanceArtifactIds?: string[];
}): Transition {
  const target = states.find((state) => state.id === input.to)!;
  return {
    id: input.id,
    label: input.label,
    fromVariantId: authorityVariantId(input.from),
    toLogicalStateId: input.to,
    targetDraftArtifactId: `artifact-pixel-${target.key}`,
    guidanceArtifactIds: input.guidanceArtifactIds,
    mediaVersions: [],
    endFrameSource: input.endFrameSource ?? "authority-reference",
    status: "target-ready",
    prompt: input.prompt,
    durationMs: (input.durationSeconds ?? 4) * 1000,
    entryBlendMs: input.idleRule ? 320 : 420,
    durationMode: "fixed",
    durationSeconds: input.durationSeconds ?? 4,
    transparentVideo: true,
    transparencyProcessing: { keyColor: "#00FF00", similarity: 0.34 },
    authorityBridge: { mode: input.idleRule ? "crossfade" : "blur-dissolve", durationMs: input.idleRule ? 360 : 700 },
    triggers: input.triggers ?? [],
    idleRule: input.idleRule,
  };
}

const transitions: Transition[] = [
  transition({
    id: "pixel-lying-sleep",
    label: "趴着 10 秒后睡觉",
    from: "state-pixel-lying",
    to: "state-pixel-sleeping",
    prompt: "Lottery 趴着逐渐犯困，眼皮缓慢合上，头轻轻落到前爪上，身体自然蜷缩进入熟睡。动作慵懒、连续、低幅度。",
    triggers: [trigger("pixel-trigger-lying-sleep", { event: "inactivity", enabled: true, timerDurationMs: 10_000 })],
  }),
  transition({
    id: "pixel-lying-ear",
    label: "点击头部动耳朵",
    from: "state-pixel-lying",
    to: "state-pixel-lying",
    prompt: "Lottery 保持趴姿和身体完全不动，只让两只耳朵先后轻轻抖动一下，眼睛短暂跟随用户，然后精确回到原趴姿。首尾姿势必须一致，可无缝循环。",
    triggers: [trigger("pixel-trigger-head-click", { event: "left-click", enabled: true, region: headRegion })],
    endFrameSource: "source-frame",
  }),
  transition({
    id: "pixel-lying-belly",
    label: "单击肚皮翻身",
    from: "state-pixel-lying",
    to: "state-pixel-belly",
    prompt: "Lottery 被单击肚皮后开心地从趴姿向侧面翻滚，再平稳翻到背上露出肚皮，四只短爪自然抬起。保持画布位置与角色尺寸稳定。",
    triggers: [trigger("pixel-trigger-belly-double", { event: "left-click", enabled: true, region: bellyRegion })],
  }),
  transition({
    id: "pixel-lying-sit",
    label: "点击尾巴坐起来",
    from: "state-pixel-lying",
    to: "state-pixel-sitting",
    prompt: "Lottery 的尾巴被点击后轻轻摆一下，前腿撑起身体，后腿收拢，稳稳坐起并看向用户。动作自然，短腿和桶状体型不能拉长。",
    triggers: [trigger("pixel-trigger-tail-click", { event: "left-click", enabled: true, region: tailRegion })],
  }),
  transition({
    id: "pixel-belly-wiggle",
    label: "悬停时翻肚皮左右晃",
    from: "state-pixel-belly",
    to: "state-pixel-belly",
    prompt: "Lottery 保持仰躺露肚皮，开心地左右轻轻晃动桶状身体和四只短爪，幅度小而有节奏，头部和尾巴配合摆动，最后精确回到同一仰躺源帧。首尾必须像素级一致以便持续循环。",
    triggers: [trigger("pixel-trigger-belly-hover-loop", { event: "hover", enabled: true, hoverDurationMs: 500, repeatWhileHovered: true, region: fullRegion })],
    endFrameSource: "source-frame",
  }),
  transition({
    id: "pixel-belly-lying",
    label: "鼠标移开翻回趴着",
    from: "state-pixel-belly",
    to: "state-pixel-lying",
    prompt: "Lottery 察觉鼠标离开后停止晃动，从仰躺姿势向侧面翻身，四爪落地，平稳回到抬头趴着的姿势。",
    triggers: [trigger("pixel-trigger-belly-leave", { event: "pointer-leave", enabled: true })],
  }),
  transition({
    id: "pixel-sitting-lying",
    label: "坐着 10 秒后趴下",
    from: "state-pixel-sitting",
    to: "state-pixel-lying",
    prompt: "Lottery 安静坐了一会儿后身体放松，前爪向前伸，胸口和腹部缓慢落下，变成舒适的抬头趴姿。",
    triggers: [trigger("pixel-trigger-sitting-lying", { event: "inactivity", enabled: true, timerDurationMs: 10_000 })],
  }),
  transition({
    id: "pixel-sitting-blink",
    label: "坐着眨眼",
    from: "state-pixel-sitting",
    to: "state-pixel-sitting",
    prompt: "Lottery 坐姿完全稳定，只自然眨眼两次，耳尖轻微响应，最后精确回到同一坐姿源帧。首尾必须一致。",
    idleRule: { enabled: true, weight: 5, cooldownMs: 3_000 },
    endFrameSource: "source-frame",
  }),
  transition({
    id: "pixel-sitting-head",
    label: "坐着轻轻歪头",
    from: "state-pixel-sitting",
    to: "state-pixel-sitting",
    prompt: "Lottery 保持坐姿和身体位置不动，头部好奇地向一侧轻轻歪一下再回正，尾尖微动，最后精确回到源帧。",
    idleRule: { enabled: true, weight: 2, cooldownMs: 8_000 },
    endFrameSource: "source-frame",
  }),
  transition({
    id: "pixel-lying-greet",
    label: "To Do 新增后起身鞠躬",
    from: "state-pixel-lying",
    to: "state-pixel-stretch",
    prompt: "Lottery 听到新的待办后从趴姿轻快站起，前腿向前伸展、胸口放低，朝用户做一次可爱而克制的鞠躬，最后停在睡醒拉伸姿势。保持短腿、桶状体型和固定机位。",
  }),
  transition({
    id: "pixel-greet-lying",
    label: "鞠躬后自动趴回",
    from: "state-pixel-stretch",
    to: "state-pixel-lying",
    prompt: "Lottery 完成鞠躬后抬起胸口，前爪向后收回，缓慢放松身体并回到抬头趴着的姿势，动作自然连续。",
    triggers: [trigger("pixel-trigger-greet-return", { event: "state-timeout", enabled: true, timerDurationMs: 1_500 })],
  }),
  transition({
    id: "pixel-sleep-breathe",
    label: "睡觉呼吸起伏",
    from: "state-pixel-sleeping",
    to: "state-pixel-sleeping",
    prompt: "Lottery 熟睡不醒，身体与腹部随着一次缓慢呼吸轻微起伏，耳朵和爪子保持放松，最后精确回到同一睡姿源帧。首尾必须一致。",
    idleRule: { enabled: true, weight: 10, cooldownMs: 2_000 },
    endFrameSource: "source-frame",
  }),
  transition({
    id: "pixel-sleep-dream",
    label: "睡觉蹬腿吧嗒嘴",
    from: "state-pixel-sleeping",
    to: "state-pixel-sleeping",
    prompt: "Lottery 仍闭眼熟睡，像做梦一样一只后腿轻轻蹬两下，嘴巴小幅吧嗒一下，随后完全放松并精确回到源睡姿。动作可爱克制，不醒来。",
    idleRule: { enabled: true, weight: 1, cooldownMs: 60_000 },
    endFrameSource: "source-frame",
  }),
  transition({
    id: "pixel-sleep-wake-lying",
    label: "单击睡醒拉伸后趴下",
    from: "state-pixel-sleeping",
    to: "state-pixel-lying",
    prompt: "长动作：Lottery 被单击后慢慢睁眼，抬头迷糊地看向用户，然后站起做一次睡眼惺忪的前腿伸展和礼貌鞠躬，打个小哈欠，最后慵懒地重新趴下并抬头。动作完整连续，不要加速。",
    triggers: [trigger("pixel-trigger-sleep-double", { event: "left-click", enabled: true, region: fullRegion })],
    durationSeconds: 8,
    guidanceArtifactIds: ["artifact-pixel-greet"],
  }),
];

export const lotteryPixelProject: CharacterProject = {
  schemaVersion: 1,
  id: "project-lottery-stardew-pixel-v3",
  name: "Lottery · 星露谷像素陪伴",
  characterName: "Lottery",
  stylePrompt: "高品质温暖 16-bit 农场生活 RPG 像素角色动画。严格使用清晰的大方形像素簇、有限的炭黑/暖棕/奶油色调色板、硬边无抗锯齿；保持每一帧的像素尺度、角色轮廓、画布位置、摄像机和体型完全一致。",
  identityPrompt,
  generationBudgetCny: 45,
  generationSettings: {
    imageModel: DEFAULT_IMAGE_MODEL,
    imageMode: "native-image",
    videoModel: DEFAULT_VIDEO_MODEL,
    imageResolution: "1K",
    imageCandidateCount: 3,
    videoResolution: "720p",
    ratio: "1:1",
    durationMode: "fixed",
    durationSeconds: 4,
  },
  videoBackground: { mode: "manual", autoColor: "#00FF00", manualColor: "#00FF00", analyzedAt: createdAt },
  order: {
    orderNumber: "QA-LOTTERY-PIXEL",
    customerName: "产品验收",
    contact: "本机验证",
    channel: "private",
    status: "creating",
    quotedPriceCny: 50,
    depositCny: 0,
    finalPaymentCny: 0,
    revisionLimit: 99,
    revisionUsed: 0,
    notes: "完整验证星露谷像素桌面宠物、交互、透明视频、运行帧率与分辨率。",
    serviceTemplateId: "lottery-pixel-qa",
    manualCosts: [],
    deliveryChecklist: { customerApproved: false, desktopTested: false, packageDelivered: false },
    reviewRounds: [],
  },
  referenceArtifactIds: [identityArtifact.id],
  initialVariantId: authorityVariantId("state-pixel-lying"),
  logicalStates,
  variants,
  transitions,
  artifacts: [identityArtifact, ...referenceArtifacts],
  jobs: [],
  plugins: structuredClone(defaultProjectPlugins),
  updatedAt: createdAt,
};
