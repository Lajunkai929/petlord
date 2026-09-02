import { randomUUID } from "node:crypto";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  submitStateDraftJob,
  submitTransitionJob,
} from "@petlord/generation";
import { defaultStyleProfiles } from "../apps/studio/src/styleLibrary";
import { lotteryHiResProject } from "../apps/studio/src/lotteryHiResProject";

const apiOrigin = "http://127.0.0.1:4312";
const nativeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === "string" && input.startsWith("/") ? new URL(input, apiOrigin) : input;
  return nativeFetch(url, init);
};

const profile = defaultStyleProfiles.find((candidate) => candidate.id === "style-cozy-farm-rpg-pixel");
if (!profile) throw new Error("Bundled farm RPG pixel style is missing.");
const identityReferences = lotteryHiResProject.referenceArtifactIds
  .map((id) => lotteryHiResProject.artifacts.find((artifact) => artifact.id === id)?.uri)
  .filter((uri): uri is string => Boolean(uri));
const settings = {
  imageModel: DEFAULT_IMAGE_MODEL,
  imageMode: "native-image" as const,
  videoModel: DEFAULT_VIDEO_MODEL,
  imageResolution: "2K" as const,
  imageCandidateCount: 3,
  videoResolution: "480p" as const,
  ratio: "1:1" as const,
  durationMode: "fixed" as const,
  durationSeconds: 4,
};
const mode = process.argv[2] ?? "image";
const projectId = "project-lottery-cozy-farm-pixel-v3";
const projectStates = {
  lying: { label: "趴着", prompt: "Lottery 舒服地趴在地面上但画面不出现地面或影子，前爪向前并清楚分开，抬头看向用户，矮壮桶状身体贴低，卷尾位于侧后方。两只眼睛各自只用一块相同大小的暖琥珀纯色色块，水平对称，没有眼白、瞳孔、高光或斜线；眉点、眼罩、深棕红鼻子和奶油尾尖保持清晰。" },
  sleeping: { label: "睡觉", prompt: "Lottery 侧卧蜷缩熟睡，头轻放在两只前爪上，两只眼睛各自闭成一条短而水平的深色直线，绝不能画成斜线、叉形或多色色块；闭眼线与黑色眼罩保持明度差，耳朵放松，卷尾靠近身体，轮廓简洁。" },
  bowing: { label: "鞠躬", prompt: "Lottery 做可爱的游戏式鞠躬：前腿向前伸展并清楚分开，胸口放低，臀部略抬，头仍朝向用户。两只眼睛各自只用一块相同大小的暖琥珀纯色色块，水平对称，没有眼白、瞳孔、高光或斜线；眉点、眼罩和深棕红鼻子清楚，动作轮廓一眼可辨。" },
} as const;
const projectTransitions = {
  "rest-sleep": { label: "趴着 1 分钟后睡觉", prompt: "Lottery 从抬头趴姿逐渐犯困，眼皮缓慢合上，头轻轻落到前爪上，身体平稳蜷缩成侧卧睡姿。保持 64×64 逻辑像素尺度、脸部色阶与画布位置稳定，动作慵懒、连续、低幅度。" },
} as const;

if (mode === "image") {
  const job = await submitStateDraftJob({
    jobId: randomUUID(),
    trigger: { projectId: `style-lab:${profile.id}`, entityType: "state", entityId: `style-preview-${profile.id}`, label: `${profile.name} · 彩票坐姿图片试验` },
    identityReferenceUris: identityReferences,
    identityPrompt: lotteryHiResProject.identityPrompt,
    stylePrompt: profile.imagePrompt,
    targetStateLabel: "坐着",
    prompt: "Lottery 矮壮放松地坐着，略带俯视的 3/4 游戏视角看向用户。头宽接近躯干，短腿清楚分开，卷尾位于身体侧后方。两只眼睛各自严格画成相同大小、水平对称的 2×2 暖琥珀色纯色色块；禁止眼白、黑色瞳孔、高光、虹膜环、渐变、斜线和交叉形状。对称眉点、眼罩、深棕红鼻子、奶油色口鼻和尾尖必须独立可读。",
    settings,
  });
  console.log(JSON.stringify(job, null, 2));
} else if (mode === "project-image") {
  const stateKey = process.argv[3] as keyof typeof projectStates;
  const state = projectStates[stateKey];
  if (!state) throw new Error(`Unknown project state: ${String(stateKey)}`);
  const job = await submitStateDraftJob({
    jobId: randomUUID(),
    trigger: { projectId, entityType: "state", entityId: `state-${stateKey}`, label: `${state.label} · 星露谷感权威图` },
    identityReferenceUris: identityReferences,
    identityPrompt: lotteryHiResProject.identityPrompt,
    stylePrompt: profile.imagePrompt,
    targetStateLabel: state.label,
    prompt: state.prompt,
    settings,
  });
  console.log(JSON.stringify(job, null, 2));
} else if (mode === "project-video") {
  const transitionKey = process.argv[3] as keyof typeof projectTransitions;
  const transition = projectTransitions[transitionKey];
  const fromImageUri = process.argv[4];
  const targetImageUri = process.argv[5];
  if (!transition || !fromImageUri?.startsWith("/api/media/") || !targetImageUri?.startsWith("/api/media/")) throw new Error("Pass project-video <transition> <from-image-uri> <target-image-uri>.");
  const job = await submitTransitionJob({
    jobId: randomUUID(),
    trigger: { projectId, entityType: "transition", entityId: `template-${transitionKey}`, label: transition.label },
    fromStateImageUri: fromImageUri,
    targetDraftImageUri: targetImageUri,
    identityReferenceUris: identityReferences,
    identityPrompt: lotteryHiResProject.identityPrompt,
    stylePrompt: profile.videoPrompt,
    prompt: transition.prompt,
    settings,
    durationMode: "fixed",
    durationSeconds: 4,
    transparentVideo: true,
    transparencyKeyColor: "#00FF00",
    transparencySimilarity: 0.34,
    chromaBackgroundColor: "#00FF00",
  });
  console.log(JSON.stringify(job, null, 2));
} else if (mode === "video") {
  const imageUri = process.argv[3];
  if (!imageUri?.startsWith("/api/media/")) throw new Error("Pass a generated /api/media/... image URI for video mode.");
  const job = await submitTransitionJob({
    jobId: randomUUID(),
    trigger: { projectId: `style-lab:${profile.id}`, entityType: "transition", entityId: `style-motion-${profile.id}`, label: `${profile.name} · 彩票坐姿待机视频试验` },
    fromStateImageUri: imageUri,
    targetDraftImageUri: imageUri,
    identityReferenceUris: identityReferences,
    identityPrompt: lotteryHiResProject.identityPrompt,
    stylePrompt: profile.videoPrompt,
    prompt: "Lottery 保持完全相同的坐姿和画布位置，胸腹持续轻微呼吸，左耳轻抖后右耳轻抖，尾尖轻微摆动，最后准确回到输入坐姿。两只暖琥珀色纯色小眼睛必须作为刚性 sprite 原样复制，整个视频不眨眼，不重画眼睛，不新增眼白、瞳孔、高光、斜线或交叉结构。动作幅度小，脸部始终朝向用户。",
    settings,
    durationMode: "fixed",
    durationSeconds: 4,
    transparentVideo: true,
    transparencyKeyColor: "#00FF00",
    transparencySimilarity: 0.34,
    chromaBackgroundColor: "#00FF00",
  });
  console.log(JSON.stringify(job, null, 2));
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
