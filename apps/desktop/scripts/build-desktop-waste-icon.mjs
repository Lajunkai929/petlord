import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execute = promisify(execFile);
const source = resolve(dirname(fileURLToPath(import.meta.url)), "../electron/desktop-waste-icon.swift");

/** Called for each native architecture by prepare-native; never runs during app use. */
export async function buildDesktopWasteIcon({ architecture, outputDirectory }) {
  if (process.platform !== "darwin") throw new Error("The macOS Desktop icon helper must be compiled on macOS.");
  if (!["arm64", "x64"].includes(architecture)) throw new Error(`Unsupported Desktop icon architecture: ${architecture}`);
  await mkdir(outputDirectory, { recursive: true });
  const output = resolve(outputDirectory, "desktop-waste-icon");
  const target = architecture === "arm64" ? "arm64-apple-macosx12.0" : "x86_64-apple-macosx12.0";
  await execute("xcrun", ["swiftc", "-O", "-target", target, "-framework", "AppKit", source, "-o", output], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  const contents = await readFile(output);
  const expectedCpu = architecture === "arm64" ? 0x0100000c : 0x01000007;
  if (contents.length < 20 || contents.readUInt32LE(0) !== 0xfeedfacf || contents.readUInt32LE(4) !== expectedCpu) throw new Error(`Compiled Desktop icon helper does not match darwin/${architecture}`);
  await chmod(output, 0o755);
  return output;
}
