import { spawn } from "node:child_process";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const desktopDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(desktopDirectory, "../..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: repositoryDirectory, env: process.env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${signal ?? code}.`));
    });
  });
}

async function requireFile(target, purpose) {
  await stat(target).catch((error) => {
    if (error?.code === "ENOENT") throw new Error(`${purpose} is missing at ${target}.`);
    throw error;
  });
}

await run(process.execPath, [resolve(desktopDirectory, "scripts/build-default-package.mjs")]);
await run(process.execPath, [resolve(desktopDirectory, "scripts/prepare-native.mjs")]);
await run(npmCommand, ["run", "build", "--workspace", "@petlord/studio"]);

const studioSource = resolve(repositoryDirectory, "apps/studio/dist");
const studioDestination = resolve(desktopDirectory, "studio");
await rm(studioDestination, { recursive: true, force: true });
await cp(studioSource, studioDestination, { recursive: true });

const serviceDirectory = resolve(desktopDirectory, "service");
const serverEntry = resolve(repositoryDirectory, "apps/generation-api/src/server.ts");
const cliEntry = resolve(repositoryDirectory, "scripts/design-cli.mjs");
const mcpEntry = resolve(repositoryDirectory, "scripts/design-mcp.mjs");
await Promise.all([
  requireFile(serverEntry, "Generation API entry"),
  requireFile(cliEntry, "Design CLI entry"),
  requireFile(mcpEntry, "Design MCP entry"),
]);
await rm(serviceDirectory, { recursive: true, force: true });
await mkdir(serviceDirectory, { recursive: true });
await build({
  entryPoints: [serverEntry],
  outfile: resolve(serviceDirectory, "server.mjs"),
  bundle: true,
  format: "esm",
  banner: { js: "import { createRequire as __petlordCreateRequire } from 'node:module'; const require = __petlordCreateRequire(import.meta.url);" },
  platform: "node",
  target: "node22",
  sourcemap: false,
  logLevel: "info",
});
for (const [entry, output] of [[cliEntry, "design-cli.cjs"], [mcpEntry, "design-mcp.cjs"]]) await build({
  entryPoints: [entry],
  outfile: resolve(serviceDirectory, output),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node22",
  sourcemap: false,
  logLevel: "info",
  define: { "import.meta.url": "__petlordImportMetaUrl" },
  banner: { js: "const __petlordImportMetaUrl = require('node:url').pathToFileURL(__filename).href;" },
});
