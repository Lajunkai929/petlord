import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const requestedTarget = process.argv[2] ?? "dir";
const targets = {
  dir: { platform: process.platform, architecture: process.arch, builder: ["--dir", "--publish", "never"] },
  "mac-arm64": { platform: "darwin", architecture: "arm64", builder: ["--mac", "dmg", "--arm64", "--publish", "never"] },
  "mac-universal": { platform: "darwin", architecture: "universal", builder: ["--mac", "dmg", "--universal", "--publish", "never"] },
  "linux-x64": { platform: "linux", architecture: "x64", builder: ["--linux", "AppImage", "deb", "--x64", "--publish", "never"] },
  "win-x64": { platform: "win32", architecture: "x64", builder: ["--win", "nsis", "--x64", "--publish", "never"] },
};
const target = targets[requestedTarget];
if (!target) throw new Error(`Unknown desktop package target: ${requestedTarget}`);

async function run(args, environment) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(npmCommand, args, { cwd: desktopDirectory, env: environment, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${npmCommand} ${args.join(" ")} exited with ${signal ?? code}.`));
    });
  });
}

const buildEnvironment = {
  ...process.env,
  PETLORD_TARGET_PLATFORM: target.platform,
  PETLORD_TARGET_ARCH: target.architecture,
};
await run(["run", "build"], buildEnvironment);
await run(["exec", "electron-builder", "--", ...target.builder], buildEnvironment);
