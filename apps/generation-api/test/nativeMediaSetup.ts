import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import ffmpeg from "ffmpeg-static";
import type { TestProject } from "vitest/node";

const execute = promisify(execFile);

/** Build and warm the real Apple Vision helper once, outside per-job deadlines. */
export default async function setup(project: TestProject) {
  if (process.platform !== "darwin") return;
  const directory = await mkdtemp(join(tmpdir(), "petlord-native-test-tools-"));
  const cleanup = () => rm(directory, { recursive: true, force: true });
  const started = performance.now();
  try {
    const helper = join(directory, "foreground-masker");
    await execute("xcrun", [
      "swiftc", "-O", "-framework", "Vision", "-framework", "CoreImage",
      "-framework", "CoreVideo", "-framework", "ImageIO",
      fileURLToPath(new URL("../native/ForegroundMasker.swift", import.meta.url)), "-o", helper,
    ], { timeout: 180_000 });
    const built = performance.now();
    const frames = join(directory, "warmup-frames"), masks = join(directory, "warmup-masks");
    await mkdir(frames);
    await execute(ffmpeg!, [
      "-y", "-i", fileURLToPath(new URL("../../studio/public/demo/pip/state-sitting.png", import.meta.url)),
      "-vf", "scale=1024:1024", "-frames:v", "1", join(frames, "frame-000001.png"),
    ], { timeout: 120_000 });
    await execute(helper, [frames, masks], { timeout: 120_000 });
    await Promise.all([rm(frames, { recursive: true }), rm(masks, { recursive: true })]);
    project.provide("foregroundMaskerPath", helper);
    console.log(`Native media fixture: Swift build ${Math.round(built - started)}ms; real Vision warmup ${Math.round(performance.now() - built)}ms.`);
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
