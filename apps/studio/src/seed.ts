import type { Artifact, CharacterProject, LogicalState } from "@petlord/schema";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@petlord/generation";
import { defaultProjectPlugins } from "./firstPartyPlugins";

const seededAt = "2026-08-30T08:00:00.000Z";

const stateDefinitions = [
  { id: "state-sitting", label: "坐着", key: "idle", description: "安静坐着并看向用户", image: "sitting", x: 80, y: 210 },
  { id: "state-lying", label: "趴着", key: "rest", description: "身体放低，舒服地趴在地上", image: "lying", x: 420, y: 80 },
  { id: "state-sleeping", label: "睡觉", key: "sleep", description: "侧卧蜷缩并闭眼熟睡", image: "sleeping", x: 760, y: 80 },
  { id: "state-belly", label: "翻肚皮", key: "play", description: "仰躺露出肚皮，前爪自然弯曲", image: "belly", x: 760, y: 340 },
  { id: "state-eating", label: "吃饭", key: "eat", description: "低头从小碗里专心吃饭", image: "eating", x: 420, y: 470 },
  { id: "state-bowing", label: "鞠躬", key: "greet", description: "前腿伸展、胸口放低做礼貌鞠躬", image: "bowing", x: 80, y: 470 },
] as const;

const stateReferenceArtifacts: Artifact[] = stateDefinitions.map((state) => ({
  id: `artifact-reference-${state.image}`,
  kind: "state-draft",
  uri: `/demo/pip/state-${state.image}.png`,
  mimeType: "image/png",
  createdAt: seededAt,
  provenance: "seed-generated",
  label: `${state.label}权威参考 v1`,
}));

const actualSittingArtifact: Artifact = {
  id: "artifact-actual-sitting",
  kind: "state-actual",
  uri: "/demo/pip/state-sitting.png",
  mimeType: "image/png",
  createdAt: seededAt,
  provenance: "seed-generated",
  label: "坐着 · 初始实际状态",
};

const logicalStates: LogicalState[] = stateDefinitions.map((state) => ({
  id: state.id,
  label: state.label,
  semanticKey: state.key,
  description: state.description,
  position: { x: state.x, y: state.y },
  defaultVariantId: state.id === "state-sitting" ? "variant-sitting-a" : undefined,
  referenceArtifactId: `artifact-reference-${state.image}`,
  referenceArtifactIds: [`artifact-reference-${state.image}`],
  idleScheduler: {
    enabled: false,
    strategy: "weighted-random",
    minIntervalMs: 8000,
    maxIntervalMs: 18_000,
    avoidImmediateRepeat: true,
  },
}));

export const seedProject: CharacterProject = {
  schemaVersion: 1,
  id: "project-lottery-v3-1",
  name: "Lottery 的桌面世界",
  characterName: "Lottery",
  stylePrompt: "高保真手绘 2D 游戏角色，柔和赛璐璐明暗，细致毛发块面，透明背景，完整展示角色。",
  identityPrompt: "Lottery 是一只矮壮的黑棕色小型犬：宽而紧凑的圆脸、距离较近的深色圆眼、短而宽的嘴、圆钝黑鼻、对称棕色眉点、黑色眼罩、粗脖子、桶状躯干、很短的四肢和奶油色尾尖。不要泛化为标准柴犬。",
  generationBudgetCny: 50,
  generationSettings: {
    imageModel: DEFAULT_IMAGE_MODEL,
    imageMode: "native-image",
    videoModel: DEFAULT_VIDEO_MODEL,
    imageResolution: "1K",
    imageCandidateCount: 3,
    videoResolution: "480p",
    ratio: "1:1",
    durationMode: "smart",
  },
  videoBackground: {
    mode: "auto",
    autoColor: "#00FF00",
    manualColor: "#FFFFFF",
  },
  order: {
    orderNumber: "DEMO-LOTTERY",
    customerName: "示例客户",
    contact: "",
    channel: "xianyu",
    status: "creating",
    quotedPriceCny: 699,
    depositCny: 300,
    finalPaymentCny: 0,
    revisionLimit: 2,
    revisionUsed: 0,
    notes: "产品演示项目",
    serviceTemplateId: "standard",
    manualCosts: [],
    deliveryChecklist: {
      customerApproved: false,
      desktopTested: false,
      packageDelivered: false,
    },
    reviewRounds: [],
  },
  referenceArtifactIds: [],
  initialVariantId: "variant-sitting-a",
  logicalStates,
  variants: [
    {
      id: "variant-sitting-a",
      logicalStateId: "state-sitting",
      label: "坐着 A",
      status: "approved",
      imageArtifactId: actualSittingArtifact.id,
      origin: { kind: "initial" },
    },
  ],
  transitions: stateDefinitions.slice(1).map((state) => ({
    id: `transition-sitting-to-${state.image}`,
    label: `坐着到${state.label}`,
    fromVariantId: "variant-sitting-a",
    toLogicalStateId: state.id,
    targetDraftArtifactId: `artifact-reference-${state.image}`,
    mediaVersions: [],
    endFrameSource: "video-frame" as const,
    status: "target-ready" as const,
    prompt: `Lottery 从坐着自然转换为${state.label}，动作连续稳定，身份、脸型、毛色与体型始终一致。`,
    durationMs: 2400,
    entryBlendMs: 420,
    durationMode: "smart" as const,
    transparentVideo: true,
    transparencyProcessing: { keyColor: "#00FF00", similarity: 0.34 },
    authorityBridge: { mode: "crossfade" as const, durationMs: 700 },
    triggers: [state.image === "lying"
      ? { id: `trigger-${state.image}`, event: "left-click" as const, enabled: true, region: { shape: "ellipse" as const, x: 0.16, y: 0.18, width: 0.68, height: 0.68 } }
      : state.image === "sleeping"
        ? { id: `trigger-${state.image}`, event: "inactivity" as const, enabled: true, timerDurationMs: 60_000 }
        : state.image === "eating"
          ? { id: `trigger-${state.image}`, event: "right-click" as const, enabled: true, region: { shape: "rectangle" as const, x: 0.08, y: 0.08, width: 0.84, height: 0.84 } }
          : { id: `trigger-${state.image}`, event: "left-click" as const, enabled: true, region: { shape: "ellipse" as const, x: 0.12, y: 0.12, width: 0.76, height: 0.76 } }],
  })),
  artifacts: [actualSittingArtifact, ...stateReferenceArtifacts],
  jobs: [],
  plugins: structuredClone(defaultProjectPlugins),
  updatedAt: seededAt,
};
