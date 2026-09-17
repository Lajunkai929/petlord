import { access, chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const codexExecutable = "/Applications/ChatGPT.app/Contents/Resources/codex";
const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function executableExists(path: string) {
  return access(path, constants.X_OK).then(() => true, () => false);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "petlord-codex-design-"));
  cleanup.push(root);
  const dataDirectory = join(root, "petlord");
  const configDirectory = join(root, "codex");
  const launcherPath = join(dataDirectory, "bin", "petlord-mcp");
  await mkdir(join(dataDirectory, "bin"), { recursive: true });
  await mkdir(configDirectory, { recursive: true });
  await writeFile(launcherPath, "#!/bin/sh\nexit 0\n");
  await chmod(launcherPath, 0o700);
  return { root, dataDirectory, configDirectory, launcherPath };
}

describe.skipIf(!await executableExists(codexExecutable))("Codex design MCP integration", () => {
  it("backs up existing config, registers the stable launcher through Codex, and stays idempotent", async () => {
    const { createCodexDesignIntegration } = require("../electron/codex-design-integration.cjs") as {
      createCodexDesignIntegration(options: Record<string, string>): {
        status(): Promise<Record<string, unknown>>;
        connect(): Promise<Record<string, unknown>>;
      };
    };
    const paths = await fixture();
    const configPath = join(paths.configDirectory, "config.toml");
    const original = 'model = "gpt-5.6-sol"\nnotify = ["existing-notifier"]\n';
    await writeFile(configPath, original);
    const integration = createCodexDesignIntegration({
      dataDirectory: paths.dataDirectory,
      launcherPath: paths.launcherPath,
      codexConfigDirectory: paths.configDirectory,
      codexExecutable,
    });

    expect(await integration.status()).toMatchObject({ available: true, connected: false, conflict: false });
    expect(await readFile(configPath, "utf8")).toBe(original);
    expect((await readdir(paths.configDirectory)).filter((name) => name.includes("petlord-backup"))).toEqual([]);

    expect(await integration.connect()).toMatchObject({
      available: true,
      connected: true,
      conflict: false,
      requiresReload: true,
    });
    const configured = await readFile(configPath, "utf8");
    expect(configured).toContain('model = "gpt-5.6-sol"');
    expect(configured).toContain('notify = ["existing-notifier"]');
    expect(configured).toContain("[mcp_servers.petlord-design]");
    expect(configured).toContain(`command = "${paths.launcherPath}"`);
    const backups = (await readdir(paths.configDirectory)).filter((name) => name.includes("petlord-backup"));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(paths.configDirectory, backups[0]), "utf8")).toBe(original);

    expect(await integration.connect()).toMatchObject({ connected: true, conflict: false });
    expect(await readFile(configPath, "utf8")).toBe(configured);
    expect((await readdir(paths.configDirectory)).filter((name) => name.includes("petlord-backup"))).toEqual(backups);
  });

  it("reports a same-name foreign server without exposing or replacing it", async () => {
    const { createCodexDesignIntegration } = require("../electron/codex-design-integration.cjs") as {
      createCodexDesignIntegration(options: Record<string, string>): {
        status(): Promise<Record<string, unknown>>;
        connect(): Promise<Record<string, unknown>>;
      };
    };
    const paths = await fixture();
    const foreignLauncher = join(paths.root, "foreign-secret-mcp");
    await writeFile(foreignLauncher, "#!/bin/sh\nexit 0\n");
    await chmod(foreignLauncher, 0o700);
    await execFileAsync(codexExecutable, ["mcp", "add", "petlord-design", "--", foreignLauncher], {
      env: { ...process.env, CODEX_HOME: paths.configDirectory },
    });
    const configPath = join(paths.configDirectory, "config.toml");
    const before = await readFile(configPath, "utf8");
    const integration = createCodexDesignIntegration({
      dataDirectory: paths.dataDirectory,
      launcherPath: paths.launcherPath,
      codexConfigDirectory: paths.configDirectory,
      codexExecutable,
    });

    const status = await integration.status();
    expect(status).toMatchObject({ available: true, connected: false, conflict: true });
    expect(JSON.stringify(status)).not.toContain(foreignLauncher);
    expect(await integration.connect()).toMatchObject({ connected: false, conflict: true });
    expect(await readFile(configPath, "utf8")).toBe(before);
    expect((await readdir(paths.configDirectory)).filter((name) => name.includes("petlord-backup"))).toEqual([]);
  });

  it("reports a matching but disabled server as requiring manual enablement without rewriting it", async () => {
    const { createCodexDesignIntegration } = require("../electron/codex-design-integration.cjs") as {
      createCodexDesignIntegration(options: Record<string, string>): {
        status(): Promise<Record<string, unknown>>;
        connect(): Promise<Record<string, unknown>>;
      };
    };
    const paths = await fixture();
    await execFileAsync(codexExecutable, ["mcp", "add", "petlord-design", "--", paths.launcherPath], {
      env: { ...process.env, CODEX_HOME: paths.configDirectory },
    });
    const configPath = join(paths.configDirectory, "config.toml");
    const configured = await readFile(configPath, "utf8");
    const disabled = configured.replace(
      "[mcp_servers.petlord-design]\n",
      "[mcp_servers.petlord-design]\nenabled = false\n",
    );
    await writeFile(configPath, disabled);
    const integration = createCodexDesignIntegration({
      dataDirectory: paths.dataDirectory,
      launcherPath: paths.launcherPath,
      codexConfigDirectory: paths.configDirectory,
      codexExecutable,
    });

    const status = await integration.status();
    expect(status).toMatchObject({
      available: true,
      configured: true,
      connected: false,
      conflict: false,
      disabled: true,
      restricted: false,
      requiresManualAction: true,
    });
    expect(String(status.message)).toContain("Enable it in Codex");
    expect(await integration.connect()).toMatchObject({ connected: false, disabled: true, requiresManualAction: true });
    expect(await readFile(configPath, "utf8")).toBe(disabled);
    expect((await readdir(paths.configDirectory)).filter((name) => name.includes("petlord-backup"))).toEqual([]);
  });

  it.each([
    {
      name: "environment overrides",
      addArguments: ["--env", "PETLORD_DESIGN_CONNECTION_FILE=/tmp/private-descriptor"],
      configuration: "",
      secret: "private-descriptor",
    },
    { name: "inherited environment", addArguments: [], configuration: 'env_vars = ["PRIVATE_VALUE"]\n', secret: "PRIVATE_VALUE" },
    { name: "a working directory", addArguments: [], configuration: 'cwd = "/tmp/private-workspace"\n', secret: "private-workspace" },
    { name: "an enabled tool allowlist", addArguments: [], configuration: 'enabled_tools = ["petlord_status"]\n', secret: "petlord_status" },
    { name: "a disabled tool denylist", addArguments: [], configuration: 'disabled_tools = ["petlord_edit"]\n', secret: "petlord_edit" },
    { name: "launcher arguments", addArguments: [], configuration: 'args = ["--private-option"]\n', secret: "private-option" },
  ])("preserves a matching server with $name and reports it as unavailable", async ({ addArguments, configuration, secret }) => {
    const { createCodexDesignIntegration } = require("../electron/codex-design-integration.cjs") as {
      createCodexDesignIntegration(options: Record<string, string>): {
        status(): Promise<Record<string, unknown>>;
        connect(): Promise<Record<string, unknown>>;
      };
    };
    const paths = await fixture();
    await execFileAsync(
      codexExecutable,
      ["mcp", "add", "petlord-design", ...addArguments, "--", paths.launcherPath],
      { env: { ...process.env, CODEX_HOME: paths.configDirectory } },
    );
    const configPath = join(paths.configDirectory, "config.toml");
    const configured = await readFile(configPath, "utf8");
    const restricted = configuration
      ? configured.replace("[mcp_servers.petlord-design]\n", `[mcp_servers.petlord-design]\n${configuration}`)
      : configured;
    await writeFile(configPath, restricted);
    const integration = createCodexDesignIntegration({
      dataDirectory: paths.dataDirectory,
      launcherPath: paths.launcherPath,
      codexConfigDirectory: paths.configDirectory,
      codexExecutable,
    });

    const status = await integration.status();
    expect(status).toMatchObject({
      available: true,
      configured: true,
      connected: false,
      conflict: false,
      disabled: false,
      restricted: true,
      requiresManualAction: true,
    });
    expect(JSON.stringify(status)).not.toContain(secret);
    expect(await integration.connect()).toMatchObject({ connected: false, restricted: true, requiresManualAction: true });
    expect(await readFile(configPath, "utf8")).toBe(restricted);
    expect((await readdir(paths.configDirectory)).filter((name) => name.includes("petlord-backup"))).toEqual([]);
  });
});
