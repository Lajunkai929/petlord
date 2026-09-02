import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PersistentGenerationJob } from "@petlord/generation";
import { PetRuntimeCore } from "@petlord/runtime-core";
import { buildPetPackage } from "@petlord/state-engine";
import { decodePetPackage, materializePackageManifest } from "../apps/desktop/src/hooks/useDesktopPetPackage";
import { reconcilePersistentJobs } from "../apps/studio/src/jobReconciler";
import { buildPortablePetBundleV2, encodePortablePetBundle } from "../apps/studio/src/lib/portablePetPackage";
import { lotteryPixelProject } from "../apps/studio/src/lotteryPixelProject";
import { approveProjectTransition } from "../apps/studio/src/transitionApproval";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const jobFile = join(repositoryRoot, "runtime-data", "generation-jobs.json");
const exportDirectory = join(repositoryRoot, "runtime-data", "exports");
const outputPath = join(exportDirectory, "lottery-stardew-pixel-desktop-pet.petlord");

function mimeType(path: string) {
  return ({
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webm": "video/webm",
    ".mp4": "video/mp4",
  } as Record<string, string>)[extname(path).toLowerCase()] ?? "application/octet-stream";
}

function dataUrl(bytes: Uint8Array, type: string) {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function materialize(uri: string) {
  if (uri.startsWith("data:")) return uri;
  if (uri.startsWith("/demo/")) {
    const localPath = join(repositoryRoot, "apps", "studio", "public", uri);
    return dataUrl(await readFile(localPath), mimeType(localPath));
  }
  if (uri.startsWith("/api/")) {
    const response = await fetch(`http://localhost:4312${uri}`);
    if (!response.ok) throw new Error(`无法读取生成媒体 ${uri}（${response.status}）`);
    return dataUrl(new Uint8Array(await response.arrayBuffer()), response.headers.get("content-type") ?? mimeType(uri));
  }
  throw new Error(`不支持的媒体地址：${uri}`);
}

async function main() {
  const remoteJobs = JSON.parse(await readFile(jobFile, "utf8")) as PersistentGenerationJob[];
  const relevantJobs = remoteJobs.filter((job) => job.trigger.projectId === lotteryPixelProject.id);
  const expectedTransitionIds = new Set(lotteryPixelProject.transitions.map((transition) => transition.id));
  const successfulTransitionIds = new Set(relevantJobs
    .filter((job) => job.kind === "transition-video" && job.status === "succeeded" && job.result?.video && job.result.tail)
    .map((job) => job.trigger.entityId));
  const missing = [...expectedTransitionIds].filter((transitionId) => !successfulTransitionIds.has(transitionId));
  if (missing.length > 0) throw new Error(`这些动画还没有成功生成：${missing.join(", ")}`);
  const invalidMedia = relevantJobs.filter((job) => job.kind === "transition-video" && job.status === "succeeded").filter((job) =>
    job.result?.video?.pixelWidth !== 720 ||
    job.result.video.pixelHeight !== 720 ||
    job.result.video.silent !== true ||
    job.result.video.hasAlpha !== true ||
    job.result.video.transparencyMethod !== "apple-vision-foreground-mask" ||
    job.result.tail?.hasAlpha !== true);
  if (invalidMedia.length > 0) {
    throw new Error(`这些动画不符合 720p / 静音 / Apple Vision 透明输出要求：${invalidMedia.map((job) => job.trigger.label).join(", ")}`);
  }
  const actualCostCny = relevantJobs.reduce((sum, job) => sum + (job.cost?.actualCny ?? job.cost?.estimatedMaxCny ?? 0), 0);
  if (actualCostCny > 50) throw new Error(`生成费用 ¥${actualCostCny.toFixed(2)} 超过绝对上限 ¥50.00`);

  let project = reconcilePersistentJobs(structuredClone(lotteryPixelProject), relevantJobs);
  for (const transition of project.transitions) {
    if (transition.status === "review") project = approveProjectTransition(project, transition.id).project;
  }
  const manifest = buildPetPackage(project);
  const uris = [...new Set([
    ...manifest.states.map((state) => state.imageUri),
    ...manifest.transitions.flatMap((transition) => [transition.videoUri, transition.tailFrameUri]),
  ])];
  const media = new Map<string, string>();
  for (const uri of uris) media.set(uri, await materialize(uri));

  const bundle = await buildPortablePetBundleV2(manifest, media);
  const encoded = await encodePortablePetBundle(bundle);
  await mkdir(exportDirectory, { recursive: true });
  await writeFile(outputPath, encoded);

  const verified = await decodePetPackage(encoded);
  const materializedManifest = materializePackageManifest(verified);
  let now = 0;
  const runtime = new PetRuntimeCore(materializedManifest, { now: () => now, random: () => 0 });
  const greeting = runtime.performSemanticAction("greet", now);
  if (!greeting.accepted) throw new Error(greeting.reason ?? "导出包的 greet 语义动作不可达");
  while (runtime.getSnapshot().activeTransitionId) {
    const active = runtime.activeTransition();
    if (!active) break;
    now += active.durationMs;
    runtime.finishVideo(now);
    if (runtime.getSnapshot().phase === "bridge") {
      now += active.authorityBridge.durationMs;
      runtime.advanceBridge(now);
    }
  }
  if (runtime.currentState()?.logicalStateId !== "state-pixel-stretch") {
    throw new Error("导出包的 greet 语义路径没有到达睡醒拉伸状态");
  }

  process.stdout.write(`${JSON.stringify({
    outputPath,
    bytes: encoded.byteLength,
    states: verified.manifest.states.length,
    transitions: verified.manifest.transitions.length,
    triggers: verified.manifest.transitions.reduce((sum, transition) => sum + transition.triggers.length, 0),
    assets: Object.keys(verified.assets).length,
    plugins: verified.manifest.plugins.map((plugin) => plugin.id),
    actualCostCny: Number(actualCostCny.toFixed(4)),
    integrity: verified.integrity?.algorithm,
    semanticGreetVerified: true,
  }, null, 2)}\n`);
}

await main();
