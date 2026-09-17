import { randomUUID } from "node:crypto";
import { parseReferenceArguments, parseStateImageUris, readReferenceFile, runReferenceCli } from "./local-reference-inputs.mjs";
import { extname } from "node:path";
import {
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  getPersistentJob,
  submitStateDraftJob,
  submitTransitionJob,
  type PersistentGenerationJob,
} from "@petlord/generation";
import { defaultStyleProfiles } from "../apps/studio/src/styleLibrary";
import { lotteryHiResProject } from "../apps/studio/src/lotteryHiResProject";

async function main() {
  const apiOrigin = "http://127.0.0.1:4312";
  const nativeFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === "string" && input.startsWith("/") ? new URL(input, apiOrigin) : input;
    return nativeFetch(url, init);
  };

  const profile = defaultStyleProfiles.find((candidate) => candidate.id === "style-clear-lively-2d");
  if (!profile) throw new Error("Bundled clear lively style is missing.");

  const { referencePaths: realPhotoPaths, positional } = parseReferenceArguments(process.argv.slice(2));

  async function dataUri(path: string) {
    const mimeType = extname(path).toLowerCase() === ".png" ? "image/png" : "image/jpeg";
    return `data:${mimeType};base64,${(await readReferenceFile(path)).toString("base64")}`;
  }

  const mode = positional[0] ?? "image";
  const projectModes = ["project-image", "project-video", "batch-videos", "video"];
  if (projectModes.includes(mode) && !process.env.PETLORD_PROJECT_ID) {
    throw new Error("Set PETLORD_PROJECT_ID to the local project for project or video modes.");
  }
  const projectId = projectModes.includes(mode) ? process.env.PETLORD_PROJECT_ID! : `style-lab:${randomUUID()}`;
  const selectedStateImages = mode === "project-video" || mode === "batch-videos"
    ? parseStateImageUris(process.env.PETLORD_STATE_IMAGE_URIS_JSON)
    : undefined;
  const identityReferences = await Promise.all(realPhotoPaths.map(dataUri));
  const requestedCandidateCount = Math.max(1, Math.min(5, Number(process.env.CANDIDATES ?? 4)));
  const settings = {
    imageModel: DEFAULT_IMAGE_MODEL,
    imageMode: "native-image" as const,
    videoModel: DEFAULT_VIDEO_MODEL,
    imageResolution: "2K" as const,
    imageCandidateCount: requestedCandidateCount,
    videoResolution: "480p" as const,
    ratio: "1:1" as const,
    durationMode: "fixed" as const,
    durationSeconds: 4,
  };
  const states = {
    sitting: {
      label: "坐着",
      prompt: "Lottery 矮壮而放松地坐着，身体略偏 3/4 方向，脸转向用户，短前腿自然分开，卷尾位于身体侧后方。像真实棚拍中被熟悉的人轻声叫到名字时一样，耳朵自然竖起，表情安静、聪明、亲近，闭嘴，嘴角自然放松。直接复刻实拍中两只小而深、距离较近的真实犬眼：深棕近黑，上下眼睑自然包住眼球，几乎不露白色巩膜，不允许放大或改成人类/动漫眼。",
    },
    lying: {
      label: "趴着",
      prompt: "Lottery 舒服地趴着，前爪向前并清楚分开，胸腹贴低但抬头看向用户，桶状身体和短腿比例与实拍一致，卷尾放在侧后方。两只深棕圆眼清澈、有神、视线一致。",
    },
    sleeping: {
      label: "睡觉",
      prompt: "Lottery 侧卧蜷缩熟睡，头轻放在两只前爪上，耳朵放松，卷尾靠近身体；双眼自然完全闭合成柔和短弧线，左右对称，不露眼白，整体安稳治愈。",
    },
    belly: {
      label: "翻肚皮",
      prompt: "Lottery 仰躺露出肚皮，四只很短的爪子自然弯曲抬起，头轻轻偏向用户，真实保留实拍中腹部浅色毛与黑棕色块，表情放松信任；两只深棕圆眼清楚、视线一致。",
    },
  } as const;
  const transitions = {
    "sit-rest": { label: "坐着 1 分钟后趴下", from: "sitting", to: "lying", durationSeconds: 4, prompt: "Lottery 安静坐了一会儿后放松身体，前爪向前伸，胸口和腹部缓慢落下，平稳变成舒适趴姿。保持真实体型、眼神、毛发与画布位置连续稳定。" },
    "rest-sleep": { label: "趴着 1 分钟后睡觉", from: "lying", to: "sleeping", durationSeconds: 4, prompt: "Lottery 从抬头趴姿逐渐犯困，眼皮对称缓慢合上，头轻轻落到前爪上，身体自然蜷缩进入熟睡。动作慵懒、连续，面部和体型不能突变。" },
    "rest-belly": { label: "双击肚皮翻身", from: "lying", to: "belly", durationSeconds: 4, prompt: "Lottery 被双击后开心地从趴姿向侧面翻滚，再平稳翻到背上露出真实腹部花色，四只短爪自然抬起。翻滚连续，不改变体型、脸和毛色。" },
    "rest-sit": { label: "点击尾巴坐起来", from: "lying", to: "sitting", durationSeconds: 4, prompt: "Lottery 的尾巴被点击后轻摆，前腿撑起身体，后腿收拢，稳稳坐起并自然看向用户。动作重心可信，最后准确进入坐姿参考。" },
    "belly-rest": { label: "鼠标移开翻回趴着", from: "belly", to: "lying", durationSeconds: 4, prompt: "Lottery 察觉鼠标离开后停止仰躺，从背部向侧面翻身，四爪自然落地，平稳回到抬头趴姿。保持腹部花色、面部和身体比例连续。" },
    "sleep-wake": { label: "双击睡醒后趴下", from: "sleeping", to: "lying", durationSeconds: 5, prompt: "Lottery 被双击后慢慢睁开真实犬眼，抬头迷糊地看向用户，前腿轻轻伸展，最后清醒但放松地回到抬头趴姿。眼睛必须对称自然，禁止放大、斜视或高光漂移。" },
    "rest-ear": { label: "趴着持续呼吸、动耳朵", from: "lying", to: "lying", durationSeconds: 4, prompt: "Lottery 保持完全相同的趴姿和画布位置，胸腹持续轻微呼吸，两只耳尖先后轻抖，尾尖轻动，真实犬眼始终稳定，最后准确回到首帧。" },
    "belly-wiggle": { label: "翻肚皮持续呼吸、左右晃", from: "belly", to: "belly", durationSeconds: 4, prompt: "Lottery 保持仰躺露肚皮，胸腹持续轻微呼吸，身体和四只短爪自然小幅左右晃动，真实面部与腹部花色稳定，最后准确回到首帧。" },
    "sleep-breathe": { label: "睡觉持续呼吸起伏", from: "sleeping", to: "sleeping", durationSeconds: 4, prompt: "Lottery 保持完全相同的熟睡姿势，双眼始终自然闭合，胸腹缓慢而持续地呼吸起伏，耳尖偶尔轻动，最后准确回到首帧。" },
    "sleep-dream": { label: "睡觉蹬腿吧嗒嘴", from: "sleeping", to: "sleeping", durationSeconds: 4, prompt: "Lottery 保持闭眼熟睡，像做梦一样一只后腿轻轻蹬两下，嘴巴非常小幅地动一下，随后完全放松并准确回到首帧；禁止睁眼和身体漂移。" },
  } as const;

  async function waitForJob(job: PersistentGenerationJob) {
    let current = job;
    while (!["succeeded", "failed"].includes(current.status)) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      current = await getPersistentJob(current.id);
      process.stderr.write(`\r${current.trigger.label}: ${current.progress}%   `);
    }
    process.stderr.write("\n");
    if (current.status === "failed") throw new Error(current.error ?? `${current.trigger.label} failed.`);
    return current;
  }

  async function submitProjectVideo(key: keyof typeof transitions) {
    const transition = transitions[key];
    return submitTransitionJob({
      jobId: randomUUID(),
      trigger: { projectId, entityType: "transition", entityId: `template-${key}`, label: `清透真实 · ${transition.label}` },
      fromStateImageUri: selectedStateImages![transition.from],
      targetDraftImageUri: selectedStateImages![transition.to],
      identityReferenceUris: identityReferences,
      identityPrompt: lotteryHiResProject.identityPrompt,
      stylePrompt: profile.videoPrompt,
      prompt: transition.prompt,
      settings: { ...settings, durationSeconds: transition.durationSeconds },
      durationMode: "fixed",
      durationSeconds: transition.durationSeconds,
      transparentVideo: true,
      transparencyKeyColor: "#00FF00",
      transparencySimilarity: 0.34,
      chromaBackgroundColor: "#00FF00",
    });
  }

  if (mode === "image" || mode === "project-image") {
    const stateKey = (positional[1] ?? "sitting") as keyof typeof states;
    const state = states[stateKey];
    if (!state) throw new Error(`Unknown state: ${String(stateKey)}`);
    const submitted = await submitStateDraftJob({
      jobId: randomUUID(),
      trigger: {
        projectId,
        entityType: "state",
        entityId: `state-${stateKey}`,
        label: `${profile.name} · Lottery ${state.label}`,
      },
      identityReferenceUris: identityReferences,
      identityPrompt: lotteryHiResProject.identityPrompt,
      stylePrompt: profile.imagePrompt,
      targetStateLabel: state.label,
      prompt: state.prompt,
      settings,
    });
    console.log(JSON.stringify(await waitForJob(submitted), null, 2));
  } else if (mode === "project-video") {
    const key = positional[1] as keyof typeof transitions;
    if (!transitions[key]) throw new Error(`Unknown transition: ${String(key)}`);
    console.log(JSON.stringify(await waitForJob(await submitProjectVideo(key)), null, 2));
  } else if (mode === "batch-videos") {
    const keys = Object.keys(transitions) as Array<keyof typeof transitions>;
    const submitted = [];
    for (const key of keys) submitted.push(await submitProjectVideo(key));
    const completed = await Promise.all(submitted.map(waitForJob));
    console.log(JSON.stringify(completed.map((job) => ({ id: job.id, entityId: job.trigger.entityId, label: job.trigger.label, cost: job.cost?.actualCny, result: job.result })), null, 2));
  } else if (mode === "video") {
    const imageUri = positional[1];
    if (!imageUri?.startsWith("/api/media/")) throw new Error("Pass an /api/media image URI.");
    const submitted = await submitTransitionJob({
      jobId: randomUUID(),
      trigger: { projectId, entityType: "transition", entityId: "transition-sitting-idle", label: `${profile.name} · 坐姿持续待机` },
      fromStateImageUri: imageUri,
      targetDraftImageUri: imageUri,
      identityReferenceUris: identityReferences,
      identityPrompt: lotteryHiResProject.identityPrompt,
      stylePrompt: profile.videoPrompt,
      prompt: "Lottery 保持同一真实坐姿、表情和画布位置，胸腹持续非常轻微地呼吸，耳尖先后轻抖一次，尾尖轻摆。眼睛始终自然睁开，不眨眼；两只真实犬眼的尺寸、深棕虹膜、瞳孔、单枚自然反光和视线方向必须与首帧完全一致。动作结束后准确回到首帧。",
      settings,
      durationMode: "fixed",
      durationSeconds: 4,
      transparentVideo: true,
      transparencyKeyColor: "#00FF00",
      transparencySimilarity: 0.34,
      chromaBackgroundColor: "#00FF00",
    });
    console.log(JSON.stringify(await waitForJob(submitted), null, 2));
  } else {
    throw new Error(`Unknown mode: ${mode}`);
  }

}
await runReferenceCli(main);
