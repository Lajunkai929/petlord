import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { URL } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { z } from "zod";
import {
  imageModelOptions,
  estimateImageGenerationCost,
  estimateVideoGenerationCost,
  calculateVideoGenerationCostFromTokens,
  squareVideoPixels,
  videoModelOptions,
  type GeneratedMedia,
  type PersistentGenerationJob,
} from "@petlord/generation";
import { adaptiveAlphaExpression, alphaCoverage, detectBackgroundPalette, type NormalizedBackgroundColor } from "./transparency";
import { normalizeArkImageRequest } from "./arkImageRequest";
import { recoverGenerationJobAfterRestart } from "./jobRecovery";
import { SqliteStore, workspaceEntityTypes, type WorkspaceEntityType } from "./sqliteStore";
import { normalizeAgentPayload } from "@petlord/agent-bridge";
import { agentEventSchema, agentEventSourceSchema, type AgentEvent } from "@petlord/schema";

const port = Number(process.env.PETLORD_API_PORT ?? 4312);
const apiKey = process.env.ARK_API_KEY;
const arkBaseUrl = process.env.ARK_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3";
const mediaDirectory = fileURLToPath(new URL("../../../runtime-data/generated/", import.meta.url));
const nativeDirectory = fileURLToPath(new URL("../../../runtime-data/native/", import.meta.url));
const foregroundMaskerSource = fileURLToPath(new URL("../native/ForegroundMasker.swift", import.meta.url));
const foregroundMaskerBinary = join(nativeDirectory, "foreground-masker");
const jobsFile = fileURLToPath(new URL("../../../runtime-data/generation-jobs.json", import.meta.url));
const databaseFile = fileURLToPath(new URL("../../../runtime-data/petlord.sqlite", import.meta.url));
const sqliteStore = new SqliteStore(databaseFile);
const cachedMedia = new Map<string, string>();
const runningJobs = new Set<string>();
const maxConcurrentJobs = 2;
const allowedImageModels = new Set(imageModelOptions.filter((model) => model.mode === "native-image").map((model) => model.id));
const allowedVideoModels = new Set(videoModelOptions.map((model) => model.id));
const execFileAsync = promisify(execFile);
let foregroundMaskerBuild: Promise<string> | undefined;

const imageRequestSchema = z.object({
  model: z.string().refine((model) => allowedImageModels.has(model as never), "Unsupported image model."),
  prompt: z.string().min(1).max(20_000),
  image: z.array(z.string()).max(10).optional(),
  size: z.enum(["1K", "2K", "1024x1024", "2048x2048"]),
  sequential_image_generation: z.enum(["auto", "disabled"]),
  sequential_image_generation_options: z.object({ max_images: z.number().int().min(2).max(5) }).optional(),
  output_format: z.literal("png").optional(),
  response_format: z.enum(["url", "b64_json"]),
  watermark: z.literal(false),
}).superRefine((request, context) => {
  if (request.sequential_image_generation === "auto" && !request.sequential_image_generation_options) {
    context.addIssue({ code: "custom", path: ["sequential_image_generation_options"], message: "Candidate generation requires max_images." });
  }
});

const contentItemSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().min(1).max(20_000) }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({ url: z.string().min(1) }),
    role: z.enum(["first_frame", "last_frame", "reference_image"]),
  }),
]);

const videoRequestSchema = z.object({
  model: z.string().refine((model) => allowedVideoModels.has(model as never), "Unsupported video model."),
  content: z.array(contentItemSchema).min(1).max(12),
  return_last_frame: z.literal(true),
  generate_audio: z.literal(false).optional(),
  resolution: z.enum(["480p", "720p", "1080p"]),
  ratio: z.literal("1:1"),
  duration: z.number().int().min(2).max(15).optional(),
  watermark: z.literal(false),
}).superRefine((request, context) => {
  if (request.model.startsWith("doubao-seedance-2-") && request.duration !== undefined && request.duration < 4) {
    context.addIssue({ code: "custom", path: ["duration"], message: "Seedance 2.0 duration must be between 4 and 15 seconds." });
  }
});

const jobSubmissionSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["state-image", "transition-video"]),
  model: z.string().min(1),
  trigger: z.object({
    projectId: z.string().min(1),
    entityType: z.enum(["state", "transition", "pointer-gaze"]),
    entityId: z.string().min(1),
    label: z.string().min(1),
  }),
  arkType: z.enum(["image", "video"]),
  request: z.unknown(),
  assembledPrompt: z.string().optional(),
  chromaKeyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  cost: z.object({
    status: z.literal("estimated"),
    source: z.literal("estimate"),
    estimatedMinCny: z.number().nonnegative(),
    estimatedMaxCny: z.number().nonnegative(),
    basis: z.string().min(1),
  }).optional(),
  postprocess: z.object({
    transparentVideo: z.boolean(),
    resolution: z.enum(["480p", "720p", "1080p"]),
    keyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
    similarity: z.number().min(0.05).max(0.7),
  }).optional(),
});

const transparentizeMediaSchema = z.object({
  videoUri: z.string().regex(/^\/api\/media\/[A-Za-z0-9-]+\.(?:mp4|webm)$/),
  tailUri: z.string().regex(/^\/api\/media\/[A-Za-z0-9-]+\.(?:png|webp|jpg|jpeg)$/),
  resolution: z.enum(["480p", "720p", "1080p"]),
  keyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  similarity: z.number().min(0.05).max(0.7),
});

const pingPongMediaSchema = z.object({
  videoUri: z.string().regex(/^\/api\/media\/[A-Za-z0-9-]+\.(?:mp4|webm)$/),
  segmentStartMs: z.number().int().nonnegative(),
  segmentEndMs: z.number().int().positive(),
  hasAlpha: z.boolean(),
  pixelWidth: z.number().int().positive().max(4096).optional(),
  pixelHeight: z.number().int().positive().max(4096).optional(),
}).refine((input) => input.segmentEndMs > input.segmentStartMs, {
  path: ["segmentEndMs"],
  message: "Playback segment end must be after its start.",
});

const mediaImportSchema = z.object({
  dataUrl: z.string().min(32).max(224 * 1024 * 1024),
});
const workspaceEntityTypeSchema = z.enum(workspaceEntityTypes);
const workspaceEntityEnvelopeSchema = z.object({ data: z.unknown() });
const workspaceStateEnvelopeSchema = z.object({ data: z.unknown() });
const agentEventIngestSchema = z.object({
  source: agentEventSourceSchema,
  payload: z.unknown(),
});
const agentEventAcknowledgeSchema = z.object({ opened: z.boolean().default(false) });

interface StoredJob extends PersistentGenerationJob {
  arkType: "image" | "video";
  arkRequest?: unknown;
  remoteTaskId?: string;
  postprocess?: {
    transparentVideo: boolean;
    resolution: "480p" | "720p" | "1080p";
    keyColor: string;
    similarity: number;
  };
}

const jobs = new Map<string, StoredJob>();

function writeJson(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "http://localhost:4310",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  });
  response.end(JSON.stringify(payload));
}

function mediaExtension(contentType: string | null, sourceUrl: string) {
  if (contentType?.includes("video/mp4")) return ".mp4";
  if (contentType?.includes("video/webm")) return ".webm";
  if (contentType?.includes("image/png")) return ".png";
  if (contentType?.includes("image/webp")) return ".webp";
  if (contentType?.includes("image/jpeg")) return ".jpg";
  const extension = extname(new URL(sourceUrl).pathname).toLowerCase();
  return [".mp4", ".webm", ".png", ".webp", ".jpg", ".jpeg"].includes(extension) ? extension : ".bin";
}

async function cacheRemoteMedia(sourceUrl: string) {
  const existing = cachedMedia.get(sourceUrl);
  if (existing) return existing;
  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:") throw new Error("Ark returned a non-HTTPS media URL.");
  const remote = await fetch(sourceUrl);
  if (!remote.ok) throw new Error(`Unable to persist generated media (${remote.status}).`);
  const buffer = Buffer.from(await remote.arrayBuffer());
  if (buffer.byteLength > 160 * 1024 * 1024) throw new Error("Generated media exceeds the 160 MB local limit.");
  await mkdir(mediaDirectory, { recursive: true });
  const filename = `${randomUUID()}${mediaExtension(remote.headers.get("content-type"), sourceUrl)}`;
  await writeFile(join(mediaDirectory, filename), buffer);
  const localUrl = `/api/media/${filename}`;
  sqliteStore.upsertMedia({
    id: filename.slice(0, filename.lastIndexOf(".")),
    uri: localUrl,
    mimeType: remote.headers.get("content-type") ?? "application/octet-stream",
    source: "generated",
  });
  cachedMedia.set(sourceUrl, localUrl);
  return localUrl;
}

async function saveDataUrl(dataUrl: string) {
  const match = /^data:((?:image\/(?:png|jpeg|webp))|(?:video\/(?:mp4|webm)));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Only PNG, JPEG, WebP, MP4 and WebM data URLs are supported.");
  const buffer = Buffer.from(match[2], "base64");
  const isVideo = match[1].startsWith("video/");
  const maximumBytes = isVideo ? 160 * 1024 * 1024 : 48 * 1024 * 1024;
  if (buffer.byteLength > maximumBytes) throw new Error(`${isVideo ? "Video" : "Image"} exceeds the local size limit.`);
  const extension = match[1] === "image/png" ? ".png"
    : match[1] === "image/webp" ? ".webp"
      : match[1] === "image/jpeg" ? ".jpg"
        : match[1] === "video/webm" ? ".webm" : ".mp4";
  await mkdir(mediaDirectory, { recursive: true });
  const mediaId = randomUUID();
  const filename = `${mediaId}${extension}`;
  await writeFile(join(mediaDirectory, filename), buffer);
  const media = { id: mediaId, uri: `/api/media/${filename}`, mimeType: match[1], source: "upload" };
  sqliteStore.upsertMedia(media);
  return media;
}

function localMediaPath(uri: string) {
  const match = /^\/api\/media\/([A-Za-z0-9-]+\.(?:mp4|webm|png|webp|jpg|jpeg))$/.exec(uri);
  if (!match) throw new Error("Generated media is not available for local normalization.");
  return join(mediaDirectory, match[1]);
}

function normalizedColorFromHex(color: string): NormalizedBackgroundColor {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const total = Math.max(1, red + green + blue);
  return { red: red / total, green: green / total, blue: blue / total, count: 1 };
}

async function decodeRawFrameData(inputPath: string, filter: string, pixelFormat: "rgb24" | "rgba", vp9Alpha = false) {
  if (!ffmpegPath) throw new Error("FFmpeg runtime is unavailable.");
  const result = await execFileAsync(ffmpegPath, [
    "-hide_banner", "-loglevel", "error",
    ...(vp9Alpha ? ["-c:v", "libvpx-vp9"] : []),
    "-i", inputPath,
    "-vf", filter,
    "-f", "rawvideo",
    "-pix_fmt", pixelFormat,
    "pipe:1",
  ], { encoding: "buffer", maxBuffer: 12 * 1024 * 1024, timeout: 2 * 60 * 1000 });
  return new Uint8Array(result.stdout);
}

async function detectVideoBackgroundPalette(videoUri: string, fallbackColor: string) {
  const width = 64;
  const height = 64;
  const samples = await decodeRawFrameData(localMediaPath(videoUri), `fps=1,scale=${width}:${height}`, "rgb24");
  const detected = detectBackgroundPalette(samples, width, height, 8);
  return detected.length > 0 ? detected : [normalizedColorFromHex(fallbackColor)];
}

async function validateAlphaOutput(path: string, vp9Alpha = false) {
  const rgba = await decodeRawFrameData(path, "scale=64:64,select=eq(n\\,0)", "rgba", vp9Alpha);
  const coverage = alphaCoverage(rgba);
  if (coverage.transparentRatio < 0.02) {
    throw new Error("透明化没有识别出有效背景，已拒绝生成伪透明版本。请提高抠除强度后重试。");
  }
  if (coverage.opaqueRatio < 0.02) {
    throw new Error("透明化几乎移除了整个角色，已拒绝保存结果。请降低抠除强度后重试。");
  }
  return coverage;
}

async function ensureForegroundMasker() {
  if (process.platform !== "darwin") throw new Error("Apple Vision foreground extraction is only available on macOS.");
  if (!foregroundMaskerBuild) foregroundMaskerBuild = (async () => {
    await mkdir(nativeDirectory, { recursive: true });
    const [sourceInfo, binaryInfo] = await Promise.all([
      stat(foregroundMaskerSource),
      stat(foregroundMaskerBinary).catch(() => undefined),
    ]);
    if (!binaryInfo || binaryInfo.mtimeMs < sourceInfo.mtimeMs) {
      await execFileAsync("xcrun", [
        "swiftc", "-O",
        "-framework", "Vision",
        "-framework", "CoreImage",
        "-framework", "CoreVideo",
        "-framework", "ImageIO",
        foregroundMaskerSource,
        "-o", foregroundMaskerBinary,
      ], { timeout: 3 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    }
    return foregroundMaskerBinary;
  })().catch((error) => {
    foregroundMaskerBuild = undefined;
    throw error;
  });
  return foregroundMaskerBuild;
}

async function appleVisionForegroundExtraction(input: {
  videoUri: string;
  tailUri: string;
  videoOutput: string;
  tailOutput: string;
  pixels: number;
}) {
  if (!ffmpegPath) throw new Error("FFmpeg runtime is unavailable.");
  const masker = await ensureForegroundMasker();
  const taskDirectory = await mkdtemp(join(tmpdir(), "petlord-foreground-"));
  const videoFrames = join(taskDirectory, "video-frames");
  const videoMasks = join(taskDirectory, "video-masks");
  const tailFrames = join(taskDirectory, "tail-frames");
  const tailMasks = join(taskDirectory, "tail-masks");
  await Promise.all([videoFrames, videoMasks, tailFrames, tailMasks].map((directory) => mkdir(directory, { recursive: true })));
  const geometry = `scale=${input.pixels}:${input.pixels}:force_original_aspect_ratio=decrease,pad=${input.pixels}:${input.pixels}:(ow-iw)/2:(oh-ih)/2:color=black`;
  try {
    await execFileAsync(ffmpegPath, [
      "-y", "-i", localMediaPath(input.videoUri),
      "-vf", `fps=24,${geometry}`,
      join(videoFrames, "frame-%06d.png"),
    ], { timeout: 4 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    await execFileAsync(ffmpegPath, [
      "-y", "-i", localMediaPath(input.tailUri),
      "-vf", geometry,
      "-frames:v", "1",
      join(tailFrames, "frame-000001.png"),
    ], { timeout: 2 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    await execFileAsync(masker, [videoFrames, videoMasks], { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    await execFileAsync(masker, [tailFrames, tailMasks], { timeout: 2 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    await execFileAsync(ffmpegPath, [
      "-y",
      "-framerate", "24", "-i", join(videoFrames, "frame-%06d.png"),
      "-framerate", "24", "-i", join(videoMasks, "frame-%06d.png"),
      "-filter_complex", "[0:v]format=rgba[subject];[1:v]format=gray[mask];[subject][mask]alphamerge,format=yuva420p[output]",
      "-map", "[output]", "-an",
      "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0",
      input.videoOutput,
    ], { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", join(tailFrames, "frame-000001.png"),
      "-i", join(tailMasks, "frame-000001.png"),
      "-filter_complex", "[0:v]format=rgba[subject];[1:v]format=gray[mask];[subject][mask]alphamerge,format=rgba[output]",
      "-map", "[output]", "-frames:v", "1",
      input.tailOutput,
    ], { timeout: 2 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  } finally {
    await rm(taskDirectory, { recursive: true, force: true });
  }
}

async function normalizeGeneratedImage(imageUri: string, size: "1K" | "2K" | "1024x1024" | "2048x2048", model: string) {
  if (!ffmpegPath) throw new Error("FFmpeg runtime is unavailable; image normalization could not run.");
  const pixels = size === "2K" || size === "2048x2048" || (size === "1K" && model.startsWith("doubao-seedream-5-")) ? 2048 : 1024;
  const outputFilename = `${randomUUID()}.png`;
  const outputPath = join(mediaDirectory, outputFilename);
  const taskDirectory = await mkdtemp(join(tmpdir(), "petlord-image-foreground-"));
  const imageFrames = join(taskDirectory, "image-frames");
  const imageMasks = join(taskDirectory, "image-masks");
  await Promise.all([imageFrames, imageMasks].map((directory) => mkdir(directory, { recursive: true })));
  const geometry = `scale=${pixels}:${pixels}:force_original_aspect_ratio=decrease,pad=${pixels}:${pixels}:(ow-iw)/2:(oh-ih)/2:color=white`;
  try {
    await execFileAsync(ffmpegPath, [
      "-y", "-i", localMediaPath(imageUri), "-vf", geometry, "-frames:v", "1", join(imageFrames, "frame-000001.png"),
    ], { timeout: 2 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    const masker = await ensureForegroundMasker();
    await execFileAsync(masker, [imageFrames, imageMasks], { timeout: 2 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    await execFileAsync(ffmpegPath, [
      "-y",
      "-i", join(imageFrames, "frame-000001.png"),
      "-i", join(imageMasks, "frame-000001.png"),
      "-filter_complex", "[0:v]format=rgba[subject];[1:v]format=gray[mask];[subject][mask]alphamerge,format=rgba[output]",
      "-map", "[output]", "-frames:v", "1", outputPath,
    ], { timeout: 2 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  } finally {
    await rm(taskDirectory, { recursive: true, force: true });
  }
  const coverage = await validateAlphaOutput(outputPath);
  return {
    uri: `/api/media/${outputFilename}`,
    mimeType: "image/png",
    pixelWidth: pixels,
    pixelHeight: pixels,
    hasAlpha: true,
    transparencyMethod: "apple-vision-foreground-mask" as const,
    alphaCoverage: coverage,
  };
}

async function normalizeGeneratedVideo(
  videoUri: string,
  tailUri: string,
  resolution: "480p" | "720p" | "1080p",
  transparentVideo: boolean,
  keyColor = "#00FF00",
  similarity = 0.34,
) {
  if (!ffmpegPath) throw new Error("FFmpeg runtime is unavailable; video normalization could not run.");
  const pixels = squareVideoPixels(resolution);
  const videoFilename = `${randomUUID()}.${transparentVideo ? "webm" : "mp4"}`;
  const tailFilename = `${randomUUID()}.png`;
  const videoOutput = join(mediaDirectory, videoFilename);
  const tailOutput = join(mediaDirectory, tailFilename);
  const geometry = `scale=${pixels}:${pixels}:force_original_aspect_ratio=decrease,pad=${pixels}:${pixels}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`;
  let transparencyMethod: "none" | "apple-vision-foreground-mask" | "adaptive-color-matte" = "none";
  if (transparentVideo && process.platform === "darwin") {
    await appleVisionForegroundExtraction({ videoUri, tailUri, videoOutput, tailOutput, pixels });
    transparencyMethod = "apple-vision-foreground-mask";
  } else {
    const backgroundPalette = transparentVideo ? await detectVideoBackgroundPalette(videoUri, keyColor) : [];
    const alphaExpression = adaptiveAlphaExpression(backgroundPalette, similarity);
    const keying = `format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alphaExpression}'`;
    const videoFilter = transparentVideo ? `${keying},${geometry},format=yuva420p` : geometry;
    const tailFilter = transparentVideo ? `${keying},${geometry},format=rgba` : geometry;
    await execFileAsync(ffmpegPath, [
      "-y", "-i", localMediaPath(videoUri), "-vf", videoFilter, "-an",
      ...(transparentVideo
        ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0"]
        : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]),
      videoOutput,
    ], { timeout: 10 * 60 * 1000 });
    await execFileAsync(ffmpegPath, [
      "-y", "-i", localMediaPath(tailUri), "-vf", tailFilter, "-frames:v", "1", tailOutput,
    ], { timeout: 2 * 60 * 1000 });
    transparencyMethod = transparentVideo ? "adaptive-color-matte" : "none";
  }

  const coverage = transparentVideo
    ? await validateAlphaOutput(videoOutput, true)
    : { transparentRatio: 0, opaqueRatio: 1 };
  if (transparentVideo) await validateAlphaOutput(tailOutput);

  return {
    videoUri: `/api/media/${videoFilename}`,
    videoMimeType: transparentVideo ? "video/webm" : "video/mp4",
    tailUri: `/api/media/${tailFilename}`,
    pixels,
    coverage,
    transparencyMethod,
  };
}

async function createPingPongMedia(input: z.infer<typeof pingPongMediaSchema>) {
  if (!ffmpegPath) throw new Error("FFmpeg runtime is unavailable; ping-pong processing could not run.");
  const inputPath = localMediaPath(input.videoUri);
  const extension = input.hasAlpha ? "webm" : "mp4";
  const videoFilename = `${randomUUID()}.${extension}`;
  const tailFilename = `${randomUUID()}.png`;
  const videoOutput = join(mediaDirectory, videoFilename);
  const tailOutput = join(mediaDirectory, tailFilename);
  const startSeconds = (input.segmentStartMs / 1000).toFixed(3);
  const endSeconds = (input.segmentEndMs / 1000).toFixed(3);
  const decoder = input.hasAlpha ? ["-c:v", "libvpx-vp9"] : [];
  const outputFormat = input.hasAlpha ? "yuva420p" : "yuv420p";
  const filter = `[0:v]trim=start=${startSeconds}:end=${endSeconds},setpts=PTS-STARTPTS,split=2[forward][reverse-input];[reverse-input]reverse,setpts=PTS-STARTPTS[reverse];[forward][reverse]concat=n=2:v=1:a=0,format=${outputFormat}[output]`;
  await execFileAsync(ffmpegPath, [
    "-y", ...decoder, "-i", inputPath,
    "-filter_complex", filter,
    "-map", "[output]", "-an",
    ...(input.hasAlpha
      ? ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0"]
      : ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart"]),
    videoOutput,
  ], { timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  await execFileAsync(ffmpegPath, [
    "-y", ...decoder, "-i", inputPath,
    "-ss", startSeconds,
    "-frames:v", "1", "-vf", "format=rgba", tailOutput,
  ], { timeout: 2 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
  const coverage = input.hasAlpha ? await validateAlphaOutput(videoOutput, true) : undefined;
  if (input.hasAlpha) await validateAlphaOutput(tailOutput);
  const durationMs = (input.segmentEndMs - input.segmentStartMs) * 2;
  return {
    durationMs,
    video: {
      uri: `/api/media/${videoFilename}`,
      mimeType: input.hasAlpha ? "video/webm" : "video/mp4",
      provider: "local-ffmpeg",
      model: "forward-reverse-concat",
      pixelWidth: input.pixelWidth,
      pixelHeight: input.pixelHeight,
      silent: true,
      hasAlpha: input.hasAlpha,
      alphaCoverage: coverage,
    },
    tail: {
      uri: `/api/media/${tailFilename}`,
      mimeType: "image/png",
      provider: "local-ffmpeg",
      model: "ping-pong-start-frame",
      pixelWidth: input.pixelWidth,
      pixelHeight: input.pixelHeight,
      hasAlpha: input.hasAlpha,
      alphaCoverage: coverage,
    },
  };
}

async function persistArkPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const result = structuredClone(payload) as {
    data?: Array<{ url?: string }>;
    status?: string;
    content?: {
      video_url?: string;
      last_frame_url?: string;
      last_frame?: { url?: string } | string;
      image_url?: string;
    };
  };
  if (result.data) {
    for (const item of result.data) {
      if (item.url) item.url = await cacheRemoteMedia(item.url);
    }
  }
  if (result.status === "succeeded" && result.content) {
    if (result.content.video_url) result.content.video_url = await cacheRemoteMedia(result.content.video_url);
    if (result.content.last_frame_url) result.content.last_frame_url = await cacheRemoteMedia(result.content.last_frame_url);
    if (result.content.image_url) result.content.image_url = await cacheRemoteMedia(result.content.image_url);
    if (typeof result.content.last_frame === "string") {
      result.content.last_frame = await cacheRemoteMedia(result.content.last_frame);
    } else if (result.content.last_frame?.url) {
      result.content.last_frame.url = await cacheRemoteMedia(result.content.last_frame.url);
    }
  }
  return result;
}

async function serveMedia(request: IncomingMessage, response: ServerResponse, filename: string) {
  if (!/^[A-Za-z0-9-]+\.(mp4|webm|png|webp|jpg|jpeg|bin)$/.test(filename)) {
    return writeJson(response, 400, { error: { message: "Invalid media path." } });
  }
  const filePath = join(mediaDirectory, filename);
  let metadata;
  try {
    metadata = await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return writeJson(response, 404, { error: { message: "Media file not found." } });
    }
    throw error;
  }
  const type = filename.endsWith(".mp4") ? "video/mp4"
    : filename.endsWith(".webm") ? "video/webm"
      : filename.endsWith(".png") ? "image/png"
        : filename.endsWith(".webp") ? "image/webp"
          : "image/jpeg";
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return writeJson(response, 416, { error: { message: "Invalid byte range." } });
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= metadata.size || end < start) {
      return writeJson(response, 416, { error: { message: "Requested media range is not satisfiable." } });
    }
    response.writeHead(206, {
      "Content-Type": type,
      "Content-Length": String(end - start + 1),
      "Content-Range": `bytes ${start}-${end}/${metadata.size}`,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, {
    "Content-Type": type,
    "Content-Length": String(metadata.size),
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=31536000, immutable",
  });
  createReadStream(filePath).pipe(response);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 224 * 1024 * 1024) throw new Error("Request body exceeds 224 MB.");
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function arkRequest(path: string, init?: RequestInit) {
  if (!apiKey) {
    return { status: 503, payload: { error: { message: "ARK_API_KEY 未配置" } } };
  }
  const response = await fetch(`${arkBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...init?.headers,
    },
  });
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { error: { message: text || `Ark returned ${response.status}.` } };
  }
  return { status: response.status, payload };
}

function publicJob(job: StoredJob): PersistentGenerationJob {
  const { arkType: _arkType, arkRequest: _arkRequest, remoteTaskId: _remoteTaskId, postprocess: _postprocess, ...visible } = job;
  return visible;
}

function indexJobMedia(job: StoredJob) {
  const result = job.result;
  const media = [
    ...(result?.images ?? []),
    ...(result?.image ? [result.image] : []),
    ...(result?.video ? [result.video] : []),
    ...(result?.tail ? [result.tail] : []),
  ];
  for (const item of media) {
    const filename = item.uri.match(/^\/api\/media\/([^/]+)$/)?.[1];
    if (!filename) continue;
    sqliteStore.upsertMedia({
      id: filename.includes(".") ? filename.slice(0, filename.lastIndexOf(".")) : filename,
      uri: item.uri,
      mimeType: item.mimeType,
      source: "generation-job",
      jobId: job.id,
      model: item.model,
      pixelWidth: item.pixelWidth,
      pixelHeight: item.pixelHeight,
      hasAlpha: item.hasAlpha,
    });
  }
}

async function persistJobs() {
  sqliteStore.replaceGenerationJobs([...jobs.values()]);
}

async function loadJobs() {
  const sqliteJobs = sqliteStore.listGenerationJobs<StoredJob>();
  if (sqliteJobs.length > 0) {
    let changed = false;
    for (const storedJob of sqliteJobs) {
      const recovered = recoverGenerationJobAfterRestart(storedJob);
      jobs.set(recovered.job.id, recovered.job);
      indexJobMedia(recovered.job);
      changed ||= recovered.changed;
    }
    if (changed) await persistJobs();
    return;
  }
  try {
    const stored = JSON.parse(await readFile(jobsFile, "utf8")) as StoredJob[];
    let changed = false;
    for (const storedJob of stored) {
      const recovered = recoverGenerationJobAfterRestart(storedJob);
      jobs.set(recovered.job.id, recovered.job);
      indexJobMedia(recovered.job);
      changed ||= recovered.changed;
    }
    if (changed || stored.length > 0) await persistJobs();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function arkError(payload: unknown, status: number) {
  const candidate = payload as { error?: { message?: string }; message?: string } | undefined;
  return candidate?.error?.message ?? candidate?.message ?? `Ark request failed with ${status}.`;
}

function videoTail(payload: {
  content?: { last_frame_url?: string; last_frame?: string | { url?: string }; image_url?: string };
}) {
  const lastFrame = payload.content?.last_frame;
  return payload.content?.last_frame_url ??
    (typeof lastFrame === "string" ? lastFrame : lastFrame?.url) ??
    payload.content?.image_url;
}

async function updateStoredJob(job: StoredJob, patch: Partial<StoredJob>) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  jobs.set(job.id, job);
  await persistJobs();
}

async function runStoredJob(job: StoredJob) {
  if (runningJobs.has(job.id) || ["succeeded", "failed"].includes(job.status)) return;
  runningJobs.add(job.id);
  const startedAt = Date.now();
  try {
    if (job.arkType === "image") {
      const body = imageRequestSchema.parse(job.arkRequest);
      await updateStoredJob(job, { status: "running", progress: 20 });
      const response = await arkRequest("/images/generations", { method: "POST", body: JSON.stringify(normalizeArkImageRequest(body)) });
      if (response.status >= 300) throw new Error(arkError(response.payload, response.status));
      const payload = await persistArkPayload(response.payload) as {
        model?: string;
        data?: Array<{ url?: string; b64_json?: string }>;
      };
      const rawImages: GeneratedMedia[] = (payload.data ?? []).flatMap((item) => {
        const uri = item.url ?? (item.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined);
        return uri ? [{
          uri,
          mimeType: uri.includes(".png") ? "image/png" : "image/jpeg",
          provider: "volcengine-ark",
          model: payload.model ?? job.model,
        }] : [];
      });
      const images: GeneratedMedia[] = [];
      for (const rawImage of rawImages) {
        const processed = await normalizeGeneratedImage(rawImage.uri, body.size, body.model);
        images.push({
          ...processed,
          provider: "volcengine-ark",
          model: payload.model ?? job.model,
        });
      }
      if (images.length === 0) throw new Error("图片模型没有返回可用图片");
      await updateStoredJob(job, {
        status: "succeeded",
        progress: 100,
        result: { image: images[0], images },
        assembledPrompt: job.assembledPrompt ?? body.prompt,
        cost: (() => {
          const actual = estimateImageGenerationCost(job.model, images.length)?.maximumCny;
          return job.cost && actual !== undefined ? { ...job.cost, status: "settled" as const, source: "unit-output" as const, actualCny: actual } : job.cost;
        })(),
        arkRequest: undefined,
      });
      return;
    }

    if (!job.remoteTaskId) {
      const body = videoRequestSchema.parse(job.arkRequest);
      await updateStoredJob(job, { status: "submitting", progress: 6 });
      const response = await arkRequest("/contents/generations/tasks", { method: "POST", body: JSON.stringify(body) });
      if (response.status >= 300) throw new Error(arkError(response.payload, response.status));
      const taskId = (response.payload as { id?: string }).id;
      if (!taskId) throw new Error("Seedance 没有返回任务 ID");
      await updateStoredJob(job, {
        status: "queued",
        progress: 12,
        remoteTaskId: taskId,
        arkRequest: undefined,
      });
    }

    for (;;) {
      const response = await arkRequest(`/contents/generations/tasks/${job.remoteTaskId}`);
      if (response.status >= 300) throw new Error(arkError(response.payload, response.status));
      const payload = response.payload as {
        status?: string;
        model?: string;
        duration?: string | number;
        error?: { message?: string };
        content?: { video_url?: string; last_frame_url?: string; last_frame?: string | { url?: string }; image_url?: string };
        usage?: { completion_tokens?: number; total_tokens?: number };
      };
      if (["failed", "cancelled", "expired"].includes(payload.status ?? "")) {
        throw new Error(payload.error?.message ?? `视频任务状态：${payload.status}`);
      }
      if (payload.status === "succeeded") {
        const persisted = await persistArkPayload(payload) as typeof payload;
        let tailUri = videoTail(persisted);
        if (!tailUri) throw new Error("Seedance 已完成，但没有返回尾帧图片");
        let videoUri = persisted.content?.video_url;
        let videoMimeType = "video/mp4";
        let pixels = job.postprocess ? squareVideoPixels(job.postprocess.resolution) : undefined;
        let hasAlpha = false;
        let transparencyMethod: GeneratedMedia["transparencyMethod"];
        let normalizedAlphaCoverage: GeneratedMedia["alphaCoverage"];
        if (job.kind !== "state-image") {
          if (!videoUri) throw new Error("视频任务没有返回视频文件");
          if (job.postprocess) {
            await updateStoredJob(job, { status: "running", progress: 95 });
            const normalized = await normalizeGeneratedVideo(
              videoUri,
              tailUri,
              job.postprocess.resolution,
              job.postprocess.transparentVideo,
              job.postprocess.keyColor,
              job.postprocess.similarity,
            );
            videoUri = normalized.videoUri;
            videoMimeType = normalized.videoMimeType;
            tailUri = normalized.tailUri;
            pixels = normalized.pixels;
            hasAlpha = job.postprocess.transparentVideo;
            transparencyMethod = normalized.transparencyMethod === "none" ? undefined : normalized.transparencyMethod;
            normalizedAlphaCoverage = normalized.coverage;
          }
        }
        const tail: GeneratedMedia = {
          uri: tailUri,
          mimeType: "image/png",
          provider: "volcengine-ark",
          model: persisted.model ?? job.model,
          pixelWidth: pixels,
          pixelHeight: pixels,
          hasAlpha,
        };
        const durationSeconds = Number(persisted.duration);
        if (job.kind === "state-image") {
          await updateStoredJob(job, {
            status: "succeeded",
            progress: 100,
            result: { image: tail },
          });
        } else {
          if (!videoUri) throw new Error("视频任务没有返回视频文件");
          await updateStoredJob(job, {
            status: "succeeded",
            progress: 100,
            result: {
              video: {
                uri: videoUri,
                mimeType: videoMimeType,
                provider: "volcengine-ark",
                model: persisted.model ?? job.model,
                pixelWidth: pixels,
                pixelHeight: pixels,
                silent: true,
                hasAlpha,
                transparencyMethod,
                alphaCoverage: normalizedAlphaCoverage,
              },
              tail: {
                ...tail,
                transparencyMethod,
                alphaCoverage: normalizedAlphaCoverage,
              },
              durationMs: Number.isFinite(durationSeconds) ? durationSeconds * 1000 : undefined,
            },
            cost: (() => {
              if (!job.cost) return job.cost;
              const completionTokens = Number(persisted.usage?.completion_tokens);
              const providerActual = calculateVideoGenerationCostFromTokens(job.model, completionTokens);
              if (providerActual !== null) {
                return {
                  ...job.cost,
                  status: "settled" as const,
                  source: "provider-usage" as const,
                  actualCny: providerActual,
                  basis: `火山任务返回 ${completionTokens.toLocaleString("zh-CN")} 个视频 token`,
                };
              }
              if (!Number.isFinite(durationSeconds) || !job.postprocess) return job.cost;
              const reconciled = estimateVideoGenerationCost({
                model: job.model,
                resolution: job.postprocess.resolution,
                durationMode: "fixed",
                durationSeconds,
              })?.maximumCny;
              return reconciled === undefined ? job.cost : {
                ...job.cost,
                status: "settled" as const,
                source: "duration-reconciled" as const,
                actualCny: reconciled,
                basis: `火山任务未返回 token 用量，按 ${durationSeconds} 秒回算`,
              };
            })(),
          });
        }
        return;
      }
      const elapsed = Date.now() - startedAt;
      await updateStoredJob(job, {
        status: payload.status === "running" ? "running" : "queued",
        progress: payload.status === "running" ? Math.min(92, 28 + Math.round(elapsed / 8000)) : 12,
      });
      await new Promise((resolve) => setTimeout(resolve, 8000));
    }
  } catch (error) {
    await updateStoredJob(job, {
      status: "failed",
      error: error instanceof Error ? error.message : "生成任务失败",
    });
  } finally {
    runningJobs.delete(job.id);
    queueMicrotask(scheduleStoredJobs);
  }
}

function scheduleStoredJobs() {
  const slots = Math.max(0, maxConcurrentJobs - runningJobs.size);
  if (slots === 0) return;
  const pending = [...jobs.values()]
    .filter((job) => !["succeeded", "failed"].includes(job.status) && !runningJobs.has(job.id))
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(0, slots);
  for (const job of pending) void runStoredJob(job);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? `localhost:${port}`}`);
  if (request.method === "OPTIONS") return writeJson(response, 204, null);

  try {
    const entityMatch = url.pathname.match(/^\/api\/workspace\/entities\/([^/]+)(?:\/([^/]+))?$/);
    if (entityMatch) {
      const type = workspaceEntityTypeSchema.parse(decodeURIComponent(entityMatch[1])) as WorkspaceEntityType;
      const id = entityMatch[2] ? decodeURIComponent(entityMatch[2]) : undefined;
      if (request.method === "GET" && !id) return writeJson(response, 200, sqliteStore.listEntities(type));
      if (request.method === "PUT" && id) {
        const input = workspaceEntityEnvelopeSchema.parse(await readJson(request));
        const entityId = (input.data as { id?: unknown } | null)?.id;
        if (typeof entityId === "string" && entityId !== id) {
          return writeJson(response, 409, { error: { message: "Entity id does not match URL." } });
        }
        sqliteStore.upsertEntity(type, id, input.data);
        return writeJson(response, 200, { saved: true });
      }
      if (request.method === "DELETE" && id) {
        sqliteStore.deleteEntity(type, id);
        return writeJson(response, 200, { deleted: true });
      }
    }

    const workspaceStateMatch = url.pathname.match(/^\/api\/workspace\/state\/([^/]+)$/);
    if (workspaceStateMatch) {
      const key = decodeURIComponent(workspaceStateMatch[1]);
      if (request.method === "GET") return writeJson(response, 200, { data: sqliteStore.getState(key) ?? null });
      if (request.method === "PUT") {
        const input = workspaceStateEnvelopeSchema.parse(await readJson(request));
        sqliteStore.setState(key, input.data);
        return writeJson(response, 200, { saved: true });
      }
      if (request.method === "DELETE") {
        sqliteStore.deleteState(key);
        return writeJson(response, 200, { deleted: true });
      }
    }

    if (request.method === "GET" && url.pathname === "/api/media/library") {
      return writeJson(response, 200, sqliteStore.listMedia());
    }

    if (url.pathname === "/api/agent-events") {
      if (request.method === "GET") {
        const unreadOnly = url.searchParams.get("unread") === "1";
        const limit = Number(url.searchParams.get("limit") ?? 100);
        return writeJson(response, 200, sqliteStore.listAgentEvents<AgentEvent>({ unreadOnly, limit }));
      }
      if (request.method === "POST") {
        const input = agentEventIngestSchema.parse(await readJson(request));
        const normalized = normalizeAgentPayload(input.source, input.payload);
        return writeJson(response, 201, sqliteStore.upsertAgentEvent(normalized));
      }
    }

    const agentEventAcknowledgeMatch = url.pathname.match(/^\/api\/agent-events\/([^/]+)\/acknowledge$/);
    if (request.method === "POST" && agentEventAcknowledgeMatch) {
      const id = decodeURIComponent(agentEventAcknowledgeMatch[1]);
      const input = agentEventAcknowledgeSchema.parse(await readJson(request));
      const updated = sqliteStore.acknowledgeAgentEvent<AgentEvent>(id, input.opened);
      return updated
        ? writeJson(response, 200, agentEventSchema.parse(updated))
        : writeJson(response, 404, { error: { message: "Agent event not found." } });
    }

    if (request.method === "POST" && url.pathname === "/api/media/import") {
      const body = mediaImportSchema.parse(await readJson(request));
      return writeJson(response, 201, await saveDataUrl(body.dataUrl));
    }

    if (request.method === "POST" && url.pathname === "/api/media/ping-pong") {
      const input = pingPongMediaSchema.parse(await readJson(request));
      return writeJson(response, 201, await createPingPongMedia(input));
    }

    if (request.method === "POST" && url.pathname === "/api/media/transparentize") {
      const input = transparentizeMediaSchema.parse(await readJson(request));
      const processed = await normalizeGeneratedVideo(
        input.videoUri,
        input.tailUri,
        input.resolution,
        true,
        input.keyColor,
        input.similarity,
      );
      return writeJson(response, 201, {
        video: {
          uri: processed.videoUri,
          mimeType: processed.videoMimeType,
          provider: "local-ffmpeg",
          model: processed.transparencyMethod,
          pixelWidth: processed.pixels,
          pixelHeight: processed.pixels,
          silent: true,
          hasAlpha: true,
          transparencyMethod: processed.transparencyMethod,
          alphaCoverage: processed.coverage,
        },
        tail: {
          uri: processed.tailUri,
          mimeType: "image/png",
          provider: "local-ffmpeg",
          model: processed.transparencyMethod,
          pixelWidth: processed.pixels,
          pixelHeight: processed.pixels,
          hasAlpha: true,
          transparencyMethod: processed.transparencyMethod,
          alphaCoverage: processed.coverage,
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/jobs") {
      const visible = [...jobs.values()]
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(publicJob);
      return writeJson(response, 200, visible);
    }

    const retryJobMatch = url.pathname.match(/^\/api\/jobs\/([^/]+)\/retry$/);
    if (request.method === "POST" && retryJobMatch) {
      const jobId = decodeURIComponent(retryJobMatch[1]);
      const job = jobs.get(jobId);
      if (!job) return writeJson(response, 404, { error: { message: "Generation job not found." } });
      if (job.status !== "failed") {
        return writeJson(response, 409, { error: { message: "Only failed generation jobs can be resumed." } });
      }
      if (!job.remoteTaskId && !job.arkRequest) {
        return writeJson(response, 409, { error: { message: "This job no longer contains enough provider state to resume safely." } });
      }
      await updateStoredJob(job, {
        status: "queued",
        progress: job.remoteTaskId ? 12 : 0,
        error: undefined,
      });
      scheduleStoredJobs();
      return writeJson(response, 202, publicJob(job));
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/jobs/")) {
      const jobId = decodeURIComponent(url.pathname.slice("/api/jobs/".length));
      const job = jobs.get(jobId);
      return job
        ? writeJson(response, 200, publicJob(job))
        : writeJson(response, 404, { error: { message: "Generation job not found." } });
    }

    if (request.method === "POST" && url.pathname === "/api/jobs") {
      const input = jobSubmissionSchema.parse(await readJson(request));
      const existing = jobs.get(input.id);
      if (existing) return writeJson(response, 200, publicJob(existing));
      const arkRequest = input.arkType === "image"
        ? imageRequestSchema.parse(input.request)
        : videoRequestSchema.parse(input.request);
      const createdAt = new Date().toISOString();
      const job: StoredJob = {
        id: input.id,
        kind: input.kind,
        status: "queued",
        progress: 0,
        model: input.model,
        trigger: input.trigger,
        createdAt,
        updatedAt: createdAt,
        arkType: input.arkType,
        arkRequest,
        postprocess: input.postprocess,
        assembledPrompt: input.assembledPrompt,
        chromaKeyColor: input.chromaKeyColor,
        cost: input.cost,
      };
      jobs.set(job.id, job);
      await persistJobs();
      scheduleStoredJobs();
      return writeJson(response, 202, publicJob(job));
    }

    if (request.method === "GET" && url.pathname === "/api/ark/health") {
      return writeJson(response, 200, {
        configured: Boolean(apiKey),
        provider: "volcengine-ark",
        defaultVideoModel: "doubao-seedance-2-0-mini-260615",
        defaultImageModel: "doubao-seedream-5-0-260128",
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/media/")) {
      return await serveMedia(request, response, url.pathname.slice("/api/media/".length));
    }

    if (request.method === "POST" && url.pathname === "/api/ark/images/generations") {
      const body = imageRequestSchema.parse(await readJson(request));
      const result = await arkRequest("/images/generations", { method: "POST", body: JSON.stringify(normalizeArkImageRequest(body)) });
      return writeJson(response, result.status, result.status < 300 ? await persistArkPayload(result.payload) : result.payload);
    }

    if (request.method === "POST" && url.pathname === "/api/ark/video/tasks") {
      const body = videoRequestSchema.parse(await readJson(request));
      const result = await arkRequest("/contents/generations/tasks", { method: "POST", body: JSON.stringify(body) });
      return writeJson(response, result.status, result.payload);
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/ark/video/tasks/")) {
      const taskId = decodeURIComponent(url.pathname.slice("/api/ark/video/tasks/".length));
      if (!/^cgt-[A-Za-z0-9_-]+$/.test(taskId)) return writeJson(response, 400, { error: { message: "Invalid task id." } });
      const result = await arkRequest(`/contents/generations/tasks/${taskId}`);
      return writeJson(response, result.status, result.status < 300 ? await persistArkPayload(result.payload) : result.payload);
    }

    return writeJson(response, 404, { error: { message: "Not found." } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return writeJson(response, 400, { error: { message: error.issues[0]?.message ?? "Invalid request." } });
    }
    return writeJson(response, 500, {
      error: { message: error instanceof Error ? error.message : "Unexpected server error." },
    });
  }
});

await loadJobs();
scheduleStoredJobs();

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`PetLord generation API ready on http://127.0.0.1:${port}\n`);
});
