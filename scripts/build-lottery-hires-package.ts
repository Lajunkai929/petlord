import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PetRuntimeCore } from "@petlord/runtime-core";
import { buildPetPackage } from "@petlord/state-engine";
import { decodePetPackage } from "../apps/desktop/src/hooks/useDesktopPetPackage";
import { buildPortablePetBundleV2, encodePortablePetBundle } from "../apps/studio/src/lib/portablePetPackage";
import { lotteryHiResProject } from "../apps/studio/src/lotteryHiResProject";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const exportDirectory = join(repositoryRoot, "runtime-data", "exports");
const outputPath = join(exportDirectory, "lottery-hires-runtime-pixel.petlord");

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
  if (!uri.startsWith("/api/media/")) throw new Error(`不支持的媒体地址：${uri}`);
  const localPath = join(repositoryRoot, "runtime-data", "generated", basename(uri));
  return dataUrl(await readFile(localPath), mimeType(localPath));
}

async function main() {
  const actualCostCny = lotteryHiResProject.jobs.reduce((sum, job) => sum + (job.cost?.actualCny ?? 0), 0);
  if (actualCostCny > lotteryHiResProject.generationBudgetCny) {
    throw new Error(`生成费用 ¥${actualCostCny.toFixed(4)} 超过项目上限 ¥${lotteryHiResProject.generationBudgetCny.toFixed(2)}`);
  }
  const manifest = buildPetPackage(lotteryHiResProject);
  const uris = [...new Set([
    ...manifest.states.map((state) => state.imageUri),
    ...manifest.transitions.flatMap((transition) => [transition.videoUri, transition.tailFrameUri]),
  ])];
  const media = new Map<string, string>();
  for (const uri of uris) media.set(uri, await materialize(uri));

  const encoded = await encodePortablePetBundle(await buildPortablePetBundleV2(manifest, media));
  await mkdir(exportDirectory, { recursive: true });
  await writeFile(outputPath, encoded);
  const verified = await decodePetPackage(encoded);
  const runtime = new PetRuntimeCore(verified.manifest, { now: () => 0, random: () => 0 });
  if (runtime.getSnapshot().nextIdleDueAt !== 0 || !runtime.fireDueSchedules(0)) {
    throw new Error("导出包没有在启动状态进入连续待机调度。");
  }
  const continuousStates = verified.manifest.logicalStates.filter((state) => state.idleScheduler.playbackMode === "continuous");
  if (continuousStates.length !== 4) throw new Error(`连续待机状态数量不正确：${continuousStates.length}`);

  process.stdout.write(`${JSON.stringify({
    outputPath,
    bytes: encoded.byteLength,
    states: verified.manifest.states.length,
    transitions: verified.manifest.transitions.length,
    triggers: verified.manifest.transitions.reduce((sum, transition) => sum + transition.triggers.length, 0),
    assets: Object.keys(verified.assets).length,
    continuousStates: continuousStates.map((state) => state.label),
    initialIdleTransition: runtime.getSnapshot().activeTransitionId,
    actualCostCny: Number(actualCostCny.toFixed(4)),
    integrity: verified.integrity?.algorithm,
  }, null, 2)}\n`);
}

await main();

