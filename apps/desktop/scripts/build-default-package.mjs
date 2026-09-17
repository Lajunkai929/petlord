import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { PNG } from "pngjs";

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(desktopDirectory, "../..");
const lottery = JSON.parse(await readFile(resolve(repositoryDirectory, "packages/pixel-art/src/examples/lottery.json"), "utf8"));
const sitIdle = lottery.animations.find((animation) => animation.id === "sit-idle");
if (!sitIdle || sitIdle.frames[0]?.frameId !== "sitting" || sitIdle.frames.at(-1)?.frameId !== "sitting") {
  throw new Error("Lottery sit-idle animation must start and end on the sitting frame.");
}

const rendererBuild = await build({
  entryPoints: [resolve(repositoryDirectory, "packages/pixel-art/src/index.ts")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  write: false,
  logLevel: "silent",
});
const rendererSource = rendererBuild.outputFiles[0]?.text;
if (!rendererSource) throw new Error("Pixel renderer bundle produced no JavaScript output.");
const { renderPixelFrame } = await import(`data:text/javascript;base64,${Buffer.from(rendererSource).toString("base64")}`);

const assets = {};
const assetHashes = {};
const frameUris = new Map();
for (const frame of sitIdle.frames) {
  if (frameUris.has(frame.frameId)) continue;
  const rendered = renderPixelFrame(lottery.document, frame.frameId);
  const png = new PNG({ width: rendered.width, height: rendered.height });
  png.data = Buffer.from(rendered.rgba);
  const encoded = PNG.sync.write(png, { colorType: 6, inputColorType: 6, bitDepth: 8 });
  const hash = createHash("sha256").update(encoded).digest("hex");
  const key = `${hash}.png`;
  assets[key] = `data:image/png;base64,${encoded.toString("base64")}`;
  assetHashes[key] = hash;
  frameUris.set(frame.frameId, `asset://${key}`);
}

const sittingUri = frameUris.get("sitting");
const durationMs = sitIdle.frames.reduce((total, frame) => total + frame.durationMs, 0);
const manifest = {
  manifestVersion: 1,
  id: "petlord-bundled-companion",
  name: "PetLord 内置像素伙伴",
  characterName: "彩票",
  initialStateId: "petlord-ready",
  states: [{
    id: "petlord-ready",
    logicalStateId: "petlord-ready-state",
    label: "坐着",
    imageUri: sittingUri,
    origin: "initial",
    nativePixel: { width: lottery.document.width, height: lottery.document.height },
  }],
  transitions: [{
    id: "petlord-sit-idle",
    fromStateId: "petlord-ready",
    toStateId: "petlord-ready",
    tailFrameUri: sittingUri,
    durationMs,
    endFrameSource: "source-frame",
    transparentVideo: true,
    authorityBridge: { mode: "hard-cut", durationMs: 120 },
    idleRule: { enabled: true, weight: 1, cooldownMs: 0 },
    playback: { mode: "forward", repeatMode: "fixed", minCycles: 1, maxCycles: 1, segmentStartMs: 0, segmentEndMs: durationMs },
    triggers: [{ id: "petlord-click", event: "left-click", enabled: true }],
    nativeAnimation: {
      frames: sitIdle.frames.map((frame) => ({ imageUri: frameUris.get(frame.frameId), durationMs: frame.durationMs })),
    },
  }],
  logicalStates: [{
    id: "petlord-ready-state",
    label: "坐着",
    variantIds: ["petlord-ready"],
    idleScheduler: {
      enabled: true,
      playbackMode: "continuous",
      strategy: "weighted-round-robin",
      minIntervalMs: 1000,
      maxIntervalMs: 1000,
      avoidImmediateRepeat: false,
    },
  }],
  semanticActions: { idle: "petlord-ready-state" },
  plugins: [],
};
const bundle = {
  format: "petlord-package",
  bundleVersion: 2,
  createdAt: "2026-09-09T00:00:00.000Z",
  manifest,
  assets,
  integrity: {
    algorithm: "SHA-256",
    manifestSha256: createHash("sha256").update(JSON.stringify(manifest)).digest("hex"),
    assets: assetHashes,
  },
};
const output = resolve(desktopDirectory, "resources/default.petlord");
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(bundle)}\n`);
