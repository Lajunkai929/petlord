import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDesktopWasteIcon } from "./build-desktop-waste-icon.mjs";

const execFileAsync = promisify(execFile);
const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(desktopDirectory, "../..");
const targetPlatform = process.env.PETLORD_TARGET_PLATFORM || process.platform;
const targetArchitecture = process.env.PETLORD_TARGET_ARCH || process.arch;
const supportedPlatforms = new Set(["darwin", "linux", "win32"]);
const supportedArchitectures = new Set(["arm64", "x64", "universal"]);

if (!supportedPlatforms.has(targetPlatform)) throw new Error(`Unsupported desktop target platform: ${targetPlatform}`);
if (!supportedArchitectures.has(targetArchitecture)) throw new Error(`Unsupported desktop target architecture: ${targetArchitecture}`);

function binaryTarget(contents) {
  if (contents.length < 20) return undefined;
  if (contents[0] === 0x7f && contents[1] === 0x45 && contents[2] === 0x4c && contents[3] === 0x46) {
    const machine = contents.readUInt16LE(18);
    return { platform: "linux", architecture: machine === 0xb7 ? "arm64" : machine === 0x3e ? "x64" : undefined };
  }
  if (contents[0] === 0x4d && contents[1] === 0x5a) {
    const peOffset = contents.length >= 64 ? contents.readUInt32LE(0x3c) : -1;
    const machine = peOffset >= 0 && contents.length >= peOffset + 6 ? contents.readUInt16LE(peOffset + 4) : -1;
    return { platform: "win32", architecture: machine === 0xaa64 ? "arm64" : machine === 0x8664 ? "x64" : undefined };
  }
  const magic = contents.readUInt32LE(0);
  if (magic === 0xfeedfacf || magic === 0xfeedface) {
    const cpu = contents.readUInt32LE(4);
    return { platform: "darwin", architecture: cpu === 0x0100000c ? "arm64" : cpu === 0x01000007 ? "x64" : undefined };
  }
  return undefined;
}

const architectures = targetArchitecture === "universal" ? ["arm64", "x64"] : [targetArchitecture];
for (const architecture of architectures) {
  const explicitVariable = `PETLORD_FFMPEG_${architecture.toUpperCase()}_PATH`;
  const explicitPath = process.env[explicitVariable] || (architectures.length === 1 ? process.env.PETLORD_FFMPEG_PATH : undefined);
  if (targetPlatform !== process.platform && !explicitPath) {
    throw new Error(`Cross-platform packaging requires ${explicitVariable} for a verified ${targetPlatform}/${architecture} FFmpeg binary.`);
  }
  if (architectures.length > 1 && !explicitPath && architecture !== process.arch) {
    throw new Error(`Universal packaging requires ${explicitVariable} for a verified ${targetPlatform}/${architecture} FFmpeg binary.`);
  }
  const defaultFfmpegPath = resolve(repositoryDirectory, "node_modules/ffmpeg-static", targetPlatform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  const sourceFfmpegPath = resolve(explicitPath || defaultFfmpegPath);
  const detected = binaryTarget(await readFile(sourceFfmpegPath));
  if (!detected || detected.platform !== targetPlatform || detected.architecture !== architecture) {
    const actual = detected ? `${detected.platform}/${detected.architecture ?? "unknown-arch"}` : "unknown binary format";
    throw new Error(`FFmpeg target mismatch: packaging ${targetPlatform}/${architecture}, received ${actual} from ${sourceFfmpegPath}. Set ${explicitVariable} to a matching binary.`);
  }

  const outputDirectory = resolve(desktopDirectory, "native", architecture);
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  const ffmpegFilename = targetPlatform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  await copyFile(sourceFfmpegPath, resolve(outputDirectory, ffmpegFilename));
  if (targetPlatform !== "win32") await chmod(resolve(outputDirectory, ffmpegFilename), 0o755);

  if (targetPlatform === "darwin") {
    if (process.platform !== "darwin") throw new Error("The macOS foreground masker must be compiled on macOS.");
    const source = resolve(repositoryDirectory, "apps/generation-api/native/ForegroundMasker.swift");
    const output = resolve(outputDirectory, "foreground-masker");
    const targetTriple = architecture === "arm64" ? "arm64-apple-macosx12.0" : "x86_64-apple-macosx12.0";
    await execFileAsync("xcrun", [
      "swiftc", "-O", "-target", targetTriple,
      "-framework", "Vision",
      "-framework", "CoreImage",
      "-framework", "CoreVideo",
      "-framework", "ImageIO",
      source,
      "-o", output,
    ], { timeout: 3 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 });
    await chmod(output, 0o755);
    await buildDesktopWasteIcon({ architecture, outputDirectory });
  }
}
