const path = require("node:path");
const { constants } = require("node:fs");
const { access, copyFile, mkdir, readFile } = require("node:fs/promises");
const { homedir } = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const serverName = "petlord-design";

async function isExecutable(candidate) {
  if (!candidate) return false;
  return access(candidate, constants.X_OK).then(() => true, () => false);
}

async function resolveCodexExecutable(explicit, environment = process.env) {
  const candidates = [];
  if (explicit) candidates.push(path.resolve(explicit));
  for (const directory of String(environment.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    candidates.push(path.join(directory, process.platform === "win32" ? "codex.exe" : "codex"));
  }
  if (process.platform === "darwin") {
    candidates.push(
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      "/Applications/Codex.app/Contents/Resources/codex",
    );
  }
  for (const candidate of [...new Set(candidates)]) {
    if (await isExecutable(candidate)) return candidate;
  }
  return undefined;
}

function createCodexDesignIntegration(options) {
  const dataDirectory = path.resolve(options.dataDirectory);
  const launcherPath = path.resolve(options.launcherPath);
  const codexConfigDirectory = path.resolve(options.codexConfigDirectory ?? process.env.CODEX_HOME ?? path.join(homedir(), ".codex"));
  const environment = { ...process.env, ...(options.environment ?? {}), CODEX_HOME: codexConfigDirectory };

  async function inspect(executable) {
    try {
      const result = await execFileAsync(executable, ["mcp", "get", serverName, "--json"], {
        env: environment,
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
      const configured = JSON.parse(result.stdout);
      const transport = configured?.transport;
      const commandMatches = transport?.type === "stdio"
        && path.resolve(String(transport.command ?? "")) === launcherPath;
      if (!commandMatches) return "conflict";

      const disabled = configured.enabled === false
        || (typeof configured.disabled_reason === "string" && configured.disabled_reason.length > 0);
      if (disabled) return "disabled";

      const environmentOverrides = transport.env && typeof transport.env === "object"
        ? Object.keys(transport.env).length > 0
        : false;
      const inheritedEnvironment = Array.isArray(transport.env_vars) && transport.env_vars.length > 0;
      const workingDirectoryOverride = typeof transport.cwd === "string" && transport.cwd.length > 0;
      const argumentOverrides = !Array.isArray(transport.args) || transport.args.length > 0;
      const enabledToolAllowlist = Array.isArray(configured.enabled_tools);
      const disabledTools = Array.isArray(configured.disabled_tools) && configured.disabled_tools.length > 0;
      const restricted = environmentOverrides
        || inheritedEnvironment
        || workingDirectoryOverride
        || argumentOverrides
        || enabledToolAllowlist
        || disabledTools;
      return restricted ? "restricted" : "connected";
    } catch (error) {
      if (error?.code === 1 && /No MCP server named/.test(String(error.stderr ?? ""))) return "missing";
      throw new Error("Unable to inspect the Codex MCP configuration.");
    }
  }

  async function status() {
    const [executable, launcherReady] = await Promise.all([
      resolveCodexExecutable(options.codexExecutable, environment),
      isExecutable(launcherPath),
    ]);
    if (!executable) {
      return {
        available: false,
        launcherReady,
        configured: false,
        connected: false,
        conflict: false,
        disabled: false,
        restricted: false,
        requiresManualAction: false,
        requiresReload: false,
        message: "Codex CLI is not installed or could not be found.",
      };
    }
    const state = await inspect(executable);
    return {
      available: true,
      launcherReady,
      configured: state !== "missing",
      connected: state === "connected",
      conflict: state === "conflict",
      disabled: state === "disabled",
      restricted: state === "restricted",
      requiresManualAction: state === "disabled" || state === "restricted",
      requiresReload: false,
      message: state === "connected"
        ? "PetLord Design is registered. Reload Codex or start a new session to use it."
        : state === "conflict"
          ? "A different MCP server already uses the name petlord-design. PetLord left it unchanged."
          : state === "disabled"
            ? "PetLord Design is configured but disabled. Enable it in Codex MCP settings, then reload or start a new session."
            : state === "restricted"
              ? "PetLord Design has custom Codex MCP settings that may prevent full access. Review them in Codex MCP settings, then reload or start a new session. PetLord left them unchanged."
          : "PetLord Design is ready to connect to Codex.",
    };
  }

  async function backupConfig() {
    const configPath = path.join(codexConfigDirectory, "config.toml");
    try {
      await readFile(configPath);
    } catch (error) {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    }
    const backupPath = path.join(codexConfigDirectory, `config.toml.petlord-backup-${Date.now()}-${process.pid}`);
    await copyFile(configPath, backupPath, constants.COPYFILE_EXCL);
    return backupPath;
  }

  async function connect() {
    const current = await status();
    if (!current.available || current.conflict || current.connected || current.requiresManualAction) return current;
    if (!current.launcherReady) throw new Error(`PetLord MCP launcher is unavailable in ${dataDirectory}.`);
    const executable = await resolveCodexExecutable(options.codexExecutable, environment);
    if (!executable) return current;
    await mkdir(codexConfigDirectory, { recursive: true, mode: 0o700 });
    await backupConfig();
    try {
      await execFileAsync(executable, ["mcp", "add", serverName, "--", launcherPath], {
        env: environment,
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      });
    } catch {
      throw new Error("Codex could not register the PetLord Design MCP server.");
    }
    const connected = await status();
    if (!connected.connected) throw new Error("Codex did not retain the PetLord Design MCP registration.");
    return {
      ...connected,
      requiresReload: true,
      message: "PetLord Design was added. Reload Codex or start a new session to use it.",
    };
  }

  return { status, connect };
}

module.exports = { createCodexDesignIntegration, resolveCodexExecutable };
