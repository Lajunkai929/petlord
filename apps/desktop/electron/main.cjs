const { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, screen, Tray } = require("electron");
const path = require("node:path");
const { mkdir, readFile, readdir, unlink, writeFile, chmod, copyFile, rename } = require("node:fs/promises");
const { createHash, randomBytes } = require("node:crypto");
const { gunzipSync } = require("node:zlib");
const { createServer } = require("node:http");
const { DatabaseSync } = require("node:sqlite");
const { spawn } = require("node:child_process");
const { homedir } = require("node:os");
const { preparePetLordDataDirectory, resolvePetLordDataDirectory } = require("./storage-paths.cjs");

const defaultSettings = {
  settingsVersion: 2,
  launchAtLogin: false,
  alwaysOnTop: false,
  clickThrough: false,
  displaySize: 320,
  frameRate: 24,
  renderResolution: 480,
  pixelGridSize: 64,
  pixelated: false,
  dock: "right",
  gazeTrackingArea: "wide",
  muted: true,
  todoEnabled: true,
  pluginGrants: {},
  pluginEnabled: {},
};

let mainWindow;
let settingsWindow;
let tray;
let quitting = false;
let runtimeSettings = { ...defaultSettings };
let globalPointerTimer;
let agentDatabase;
let agentSocketServer;
let agentSocketPath;
let agentSocketToken;

const legacyUserDataDirectory = app.getPath("userData");
const petLordDataDirectory = resolvePetLordDataDirectory();
if (process.env.PETLORD_USER_DATA_DIR) {
  app.setPath("userData", petLordDataDirectory);
}

function userDataPath(filename) {
  return path.join(petLordDataDirectory, filename);
}

function packageDirectory() {
  return userDataPath("packages");
}

function activePackageKeyPath() {
  return userDataPath("active-package.txt");
}

function legacyPackagePath() {
  return userDataPath("active-desktop-pet.petlord");
}

function settingsPath() {
  return userDataPath("runtime-settings.json");
}

function runtimeErrorsPath() {
  return userDataPath("runtime-errors.json");
}

function agentDatabasePath() {
  return userDataPath("petlord-client.sqlite");
}

function agentTokenPath() {
  return userDataPath("agent-events.token");
}

function preferredAgentSocketPath() {
  if (process.platform === "win32") {
    const account = String(process.env.USERNAME || "user").replaceAll(/[^A-Za-z0-9_-]/g, "-").slice(0, 40);
    return `\\\\.\\pipe\\petlord-agent-events-${account}`;
  }
  return userDataPath("agent-events.sock");
}

function integrationDirectory() {
  return userDataPath("integrations");
}

function installedAgentHelperPath() {
  return path.join(integrationDirectory(), "agent-notify.cjs");
}

function integrationForwardPath() {
  return path.join(integrationDirectory(), "codex-previous-notify.json");
}

function codexConfigPath() {
  return path.join(process.env.CODEX_HOME || path.join(process.env.PETLORD_INTEGRATION_HOME || homedir(), ".codex"), "config.toml");
}

function claudeSettingsPath() {
  return path.join(process.env.PETLORD_INTEGRATION_HOME || homedir(), ".claude", "settings.json");
}

function text(value, maximum = 4000) {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : undefined;
}

function stableHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 18);
}

function basename(value) {
  return value ? path.basename(value) || undefined : undefined;
}

function normalizeAgentEvent(source, payload, receivedAt = new Date().toISOString()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Agent event payload must be an object.");
  if (source === "codex") {
    const sessionId = text(payload["thread-id"], 240) ?? text(payload.thread_id, 240) ?? text(payload.session_id, 240);
    if (!sessionId) throw new Error("Codex notify payload is missing thread-id.");
    const turnId = text(payload["turn-id"], 240) ?? text(payload.turn_id, 240) ?? "turn";
    const cwd = text(payload.cwd, 4096);
    const inputMessages = Array.isArray(payload["input-messages"])
      ? payload["input-messages"].map((item) => text(item, 400)).filter(Boolean)
      : [];
    const kind = text(payload.type, 120) ?? "agent-turn-complete";
    const type = kind === "agent-turn-failed" ? "failed" : kind === "agent-needs-attention" ? "needs-attention" : "turn-completed";
    const severity = type === "failed" ? "error" : type === "needs-attention" ? "warning" : "success";
    const dedupeKey = `codex:${sessionId}:${turnId}:${kind}`;
    return {
      schemaVersion: 1,
      id: `codex-${stableHash(dedupeKey)}`,
      source: "codex",
      type,
      severity,
      sessionId,
      occurredAt: receivedAt,
      receivedAt,
      dedupeKey,
      title: inputMessages.at(-1) ?? basename(cwd) ?? "Codex 任务",
      summary: text(payload["last-assistant-message"], 4000) ?? text(payload.last_assistant_message, 4000),
      cwd,
      metadata: { turnId, client: text(payload.client, 120) ?? null },
    };
  }
  if (source !== "claude") throw new Error("Unsupported agent source.");
  const sessionId = text(payload.session_id, 240);
  if (!sessionId) throw new Error("Claude Hook payload is missing session_id.");
  const hook = text(payload.hook_event_name, 120) ?? text(payload.type, 120) ?? "Stop";
  const notificationType = text(payload.notification_type, 120);
  const type = hook === "SessionStart" ? "session-started"
    : hook === "UserPromptSubmit" ? "working"
      : hook === "Notification" && notificationType === "permission_prompt" ? "needs-attention"
        : hook === "StopFailure" ? "failed"
          : hook === "TaskCompleted" ? "task-completed"
            : hook === "SessionEnd" ? "session-ended"
              : "turn-completed";
  const severity = type === "failed" ? "error" : type === "needs-attention" ? "warning" : ["turn-completed", "task-completed"].includes(type) ? "success" : "info";
  const cwd = text(payload.cwd, 4096);
  const task = payload.task && typeof payload.task === "object" ? payload.task : {};
  const eventKey = text(payload.turn_id, 240) ?? text(task.id, 240) ?? receivedAt;
  const dedupeKey = `claude:${sessionId}:${eventKey}:${hook}:${notificationType ?? ""}`;
  return {
    schemaVersion: 1,
    id: `claude-${stableHash(dedupeKey)}`,
    source: "claude",
    type,
    severity,
    sessionId,
    occurredAt: receivedAt,
    receivedAt,
    dedupeKey,
    title: text(task.subject, 240) ?? text(payload.title, 240) ?? basename(cwd) ?? "Claude 任务",
    summary: text(payload.last_assistant_message, 4000) ?? text(payload.message, 4000) ?? text(task.subject, 4000),
    cwd,
    metadata: { hook, notificationType: notificationType ?? null, taskId: text(task.id, 240) ?? null },
  };
}

function initializeAgentDatabase() {
  agentDatabase = new DatabaseSync(agentDatabasePath());
  agentDatabase.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  agentDatabase.exec(`
    CREATE TABLE IF NOT EXISTS external_event_inbox (
      event_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      occurred_at TEXT NOT NULL,
      received_at TEXT NOT NULL,
      data_json TEXT NOT NULL,
      acknowledged_at TEXT,
      opened_at TEXT
    );
    CREATE INDEX IF NOT EXISTS external_event_inbox_received_idx ON external_event_inbox(received_at DESC);
    CREATE INDEX IF NOT EXISTS external_event_inbox_unread_idx ON external_event_inbox(acknowledged_at, received_at DESC);
    CREATE TABLE IF NOT EXISTS agent_event_spool (
      spool_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      received_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS plugin_kv (
      plugin_id TEXT NOT NULL,
      storage_key TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (plugin_id, storage_key)
    );
  `);
  const spooled = agentDatabase.prepare("SELECT spool_id, source, payload_json, received_at FROM agent_event_spool ORDER BY received_at").all();
  for (const item of spooled) {
    try {
      storeAgentEvent(normalizeAgentEvent(item.source, JSON.parse(item.payload_json), item.received_at), false);
      agentDatabase.prepare("DELETE FROM agent_event_spool WHERE spool_id = ?").run(item.spool_id);
    } catch (error) {
      console.warn("Unable to recover agent event spool item", error);
    }
  }
}

function pluginStorageGet(pluginId, key) {
  const row = agentDatabase.prepare("SELECT data_json FROM plugin_kv WHERE plugin_id = ? AND storage_key = ?")
    .get(String(pluginId), String(key));
  return row ? JSON.parse(row.data_json) : null;
}

function pluginStorageSet(pluginId, key, value) {
  agentDatabase.prepare(`
    INSERT INTO plugin_kv(plugin_id, storage_key, data_json, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(plugin_id, storage_key) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at
  `).run(String(pluginId), String(key), JSON.stringify(value), new Date().toISOString());
}

function pluginStorageRemove(pluginId, key) {
  agentDatabase.prepare("DELETE FROM plugin_kv WHERE plugin_id = ? AND storage_key = ?").run(String(pluginId), String(key));
}

function storeAgentEvent(event, broadcast = true) {
  const existing = agentDatabase.prepare("SELECT data_json FROM external_event_inbox WHERE dedupe_key = ?").get(event.dedupeKey);
  if (existing) return JSON.parse(existing.data_json);
  agentDatabase.prepare(`
    INSERT INTO external_event_inbox(
      event_id, source, event_type, session_id, dedupe_key, occurred_at, received_at,
      data_json, acknowledged_at, opened_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)
  `).run(event.id, event.source, event.type, event.sessionId, event.dedupeKey, event.occurredAt, event.receivedAt, JSON.stringify(event));
  if (broadcast) mainWindow?.webContents.send("runtime:agent-event", event);
  return event;
}

function listAgentEvents(input = {}) {
  const limit = Math.max(1, Math.min(500, Number(input.limit) || 100));
  const source = ["claude", "codex"].includes(input.source) ? input.source : undefined;
  const conditions = [];
  const parameters = [];
  if (source) { conditions.push("source = ?"); parameters.push(source); }
  if (input.unreadOnly) conditions.push("acknowledged_at IS NULL");
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return agentDatabase.prepare(`SELECT data_json FROM external_event_inbox ${where} ORDER BY received_at DESC LIMIT ?`)
    .all(...parameters, limit)
    .map((row) => JSON.parse(row.data_json));
}

function acknowledgeAgentEvent(id, opened = false) {
  const row = agentDatabase.prepare("SELECT data_json FROM external_event_inbox WHERE event_id = ?").get(String(id));
  if (!row) return undefined;
  const current = JSON.parse(row.data_json);
  const timestamp = new Date().toISOString();
  const updated = { ...current, acknowledgedAt: current.acknowledgedAt ?? timestamp, openedAt: opened ? current.openedAt ?? timestamp : current.openedAt };
  agentDatabase.prepare("UPDATE external_event_inbox SET data_json = ?, acknowledged_at = ?, opened_at = ? WHERE event_id = ?")
    .run(JSON.stringify(updated), updated.acknowledgedAt, updated.openedAt ?? null, String(id));
  mainWindow?.webContents.send("runtime:agent-event-updated", updated);
  return updated;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

function appleScriptQuote(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function openAgentSession(input) {
  const source = input?.source;
  const sessionId = text(input?.sessionId, 240);
  if (!["claude", "codex"].includes(source) || !sessionId || !/^[A-Za-z0-9._:-]+$/.test(sessionId)) throw new Error("Invalid agent session target.");
  const cwd = text(input?.cwd, 4096);
  const binary = source === "claude" ? "claude" : "codex";
  const command = `${cwd && path.isAbsolute(cwd) ? `cd ${shellQuote(cwd)} && ` : ""}${binary} resume ${shellQuote(sessionId)}`;
  if (process.platform === "darwin") {
    const child = spawn("/usr/bin/osascript", ["-e", `tell application \"Terminal\" to do script \"${appleScriptQuote(command)}\"`], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }
  const child = spawn(binary, ["resume", sessionId], { cwd: cwd && path.isAbsolute(cwd) ? cwd : undefined, detached: true, stdio: "ignore" });
  child.unref();
}

async function startAgentSocket() {
  agentSocketPath = preferredAgentSocketPath();
  agentSocketToken = randomBytes(32).toString("hex");
  await writeFile(agentTokenPath(), agentSocketToken, { mode: 0o600 });
  await chmod(agentTokenPath(), 0o600).catch(() => undefined);
  if (process.platform !== "win32") await unlink(agentSocketPath).catch(() => undefined);
  agentSocketServer = createServer((request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/events" || request.headers.authorization !== `Bearer ${agentSocketToken}`) {
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) request.destroy();
    });
    request.on("end", () => {
      try {
        const input = JSON.parse(body);
        const stored = storeAgentEvent(normalizeAgentEvent(input.source, input.payload));
        response.writeHead(201, { "Content-Type": "application/json" }).end(JSON.stringify({ id: stored.id }));
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error instanceof Error ? error.message : "Invalid event" }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    agentSocketServer.once("error", reject);
    agentSocketServer.listen(agentSocketPath, () => { agentSocketServer.off("error", reject); resolve(); });
  });
  if (process.platform !== "win32") await chmod(agentSocketPath, 0o600).catch(() => undefined);
}

async function atomicWrite(target, contents) {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.petlord-${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, target);
}

async function ensureAgentHelper() {
  await mkdir(integrationDirectory(), { recursive: true });
  await copyFile(path.join(__dirname, "agent-notify.cjs"), installedAgentHelperPath());
  await chmod(installedAgentHelperPath(), 0o700).catch(() => undefined);
  return installedAgentHelperPath();
}

function agentHelperArguments(source, helperPath) {
  return [
    "/usr/bin/env",
    "node",
    helperPath,
    source,
    "--socket",
    agentSocketPath,
    "--token-file",
    agentTokenPath(),
    "--database",
    agentDatabasePath(),
  ];
}

function parseNotifyArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function backupManagedFile(target, contents) {
  if (!contents) return;
  const backup = `${target}.petlord-backup-${new Date().toISOString().replaceAll(/[^0-9]/g, "").slice(0, 14)}`;
  await writeFile(backup, contents, "utf8");
}

async function installCodexIntegration() {
  const helperPath = await ensureAgentHelper();
  const target = codexConfigPath();
  const original = await readFile(target, "utf8").catch((error) => error?.code === "ENOENT" ? "" : Promise.reject(error));
  const command = agentHelperArguments("codex", helperPath);
  command.push("--forward-file", integrationForwardPath());
  const matcher = /^notify\s*=\s*(\[[^\r\n]*\])\s*(?:\r?\n|$)/m;
  const match = original.match(matcher);
  const existing = match ? parseNotifyArray(match[1]) : undefined;
  if (existing && JSON.stringify(existing) !== JSON.stringify(command)) {
    await atomicWrite(integrationForwardPath(), `${JSON.stringify(existing, null, 2)}\n`);
  }
  const line = `notify = ${JSON.stringify(command)}`;
  const updated = match ? original.replace(matcher, `${line}\n`) : `${line}\n${original}`;
  if (updated !== original) {
    await backupManagedFile(target, original);
    await atomicWrite(target, updated);
  }
  return agentIntegrationStatus();
}

function claudeManagedEvents() {
  return ["SessionStart", "UserPromptSubmit", "Notification", "Stop", "TaskCompleted", "SessionEnd"];
}

async function installClaudeIntegration() {
  const helperPath = await ensureAgentHelper();
  const target = claudeSettingsPath();
  const original = await readFile(target, "utf8").catch((error) => error?.code === "ENOENT" ? "{}\n" : Promise.reject(error));
  const settings = JSON.parse(original);
  const hooks = settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks) ? settings.hooks : {};
  const args = agentHelperArguments("claude", helperPath).map(shellQuote).join(" ");
  for (const eventName of claudeManagedEvents()) {
    const existing = Array.isArray(hooks[eventName]) ? hooks[eventName] : [];
    const retained = existing.filter((entry) => !JSON.stringify(entry).includes(helperPath));
    hooks[eventName] = [...retained, { hooks: [{ type: "command", command: args, timeout: 5 }] }];
  }
  settings.hooks = hooks;
  const updated = `${JSON.stringify(settings, null, 2)}\n`;
  if (updated !== original) {
    await backupManagedFile(target, original);
    await atomicWrite(target, updated);
  }
  return agentIntegrationStatus();
}

async function agentIntegrationStatus() {
  const helperPath = installedAgentHelperPath();
  const [codexConfig, claudeSettings] = await Promise.all([
    readFile(codexConfigPath(), "utf8").catch(() => ""),
    readFile(claudeSettingsPath(), "utf8").catch(() => ""),
  ]);
  return {
    socketPath: agentSocketPath,
    tokenPath: agentTokenPath(),
    databasePath: agentDatabasePath(),
    connected: Boolean(agentSocketServer?.listening),
    codex: { enabled: codexConfig.includes(helperPath), configPath: codexConfigPath() },
    claude: { enabled: claudeSettings.includes(helperPath), configPath: claudeSettingsPath() },
  };
}

async function installAgentIntegration(source) {
  if (source === "codex") return installCodexIntegration();
  if (source === "claude") return installClaudeIntegration();
  throw new Error("Unsupported agent integration.");
}

function safePackageKey(key) {
  if (!key || path.basename(key) !== key || !key.endsWith(".petlord")) throw new Error("Invalid package key.");
  return key;
}

function packageBuffer(contents) {
  if (Buffer.isBuffer(contents)) return contents;
  if (typeof contents === "string") return Buffer.from(contents, "utf8");
  if (contents instanceof Uint8Array) return Buffer.from(contents);
  if (contents?.type === "Buffer" && Array.isArray(contents.data)) return Buffer.from(contents.data);
  throw new Error("不支持的宠物包数据类型。");
}

function decodePackageJson(contents) {
  const input = packageBuffer(contents);
  const decoded = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
  return { input, bundle: JSON.parse(decoded.toString("utf8")) };
}

function sha256(contents) {
  return createHash("sha256").update(contents).digest("hex");
}

function verifyBundleIntegrity(bundle) {
  if (bundle.bundleVersion !== 2) return;
  if (bundle.integrity?.algorithm !== "SHA-256") throw new Error("V2 宠物包缺少 SHA-256 完整性信息。");
  if (sha256(JSON.stringify(bundle.manifest)) !== bundle.integrity.manifestSha256) throw new Error("宠物包 manifest 校验失败，文件可能已损坏或被修改。");
  for (const [key, expected] of Object.entries(bundle.integrity.assets ?? {})) {
    const dataUrl = bundle.assets?.[key];
    const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl ?? "");
    if (!match || sha256(Buffer.from(match[1], "base64")) !== expected) throw new Error(`宠物包资产 ${key} 校验失败。`);
  }
}

function parsePackageSummary(contents, key, activeKey) {
  const { bundle } = decodePackageJson(contents);
  if (bundle?.format !== "petlord-package" || bundle?.bundleVersion !== 1 || typeof bundle?.createdAt !== "string" || !bundle?.manifest?.id) {
    if (bundle?.format !== "petlord-package" || bundle?.bundleVersion !== 2 || typeof bundle?.createdAt !== "string" || !bundle?.manifest?.id) {
      throw new Error("宠物包格式无效或版本不受支持。");
    }
  }
  verifyBundleIntegrity(bundle);
  return {
    key,
    active: key === activeKey,
    createdAt: bundle.createdAt,
    id: bundle.manifest.id,
    name: bundle.manifest.name,
    characterName: bundle.manifest.characterName,
    stateCount: bundle.manifest.states?.length ?? 0,
    transitionCount: bundle.manifest.transitions?.length ?? 0,
  };
}

function normalizeSettings(candidate) {
  const validPermissions = new Set([
    "pet:read",
    "pet:control",
    "storage",
    "ui:panel",
    "ui:context-menu",
    "notifications",
    "background:events",
    "integration:claude:events",
    "integration:claude:open-session",
    "integration:codex:events",
    "integration:codex:open-session",
  ]);
  const pluginGrants = Object.fromEntries(Object.entries(candidate?.pluginGrants ?? {})
    .filter(([id, permissions]) => id.length <= 120 && Array.isArray(permissions))
    .map(([id, permissions]) => [id, [...new Set(permissions.filter((permission) => validPermissions.has(permission)))]]));
  const pluginEnabled = Object.fromEntries(Object.entries(candidate?.pluginEnabled ?? {})
    .filter(([id, enabled]) => id.length <= 120 && typeof enabled === "boolean"));
  return {
    settingsVersion: 2,
    launchAtLogin: Boolean(candidate?.launchAtLogin),
    alwaysOnTop: Boolean(candidate?.alwaysOnTop),
    clickThrough: Boolean(candidate?.clickThrough),
    displaySize: [160, 200, 240, 280, 320, 400, 480].includes(candidate?.displaySize)
      ? candidate.displaySize
      : ({ 0.75: 240, 1: 320, 1.25: 400 })[candidate?.scale] ?? 320,
    frameRate: [12, 18, 24, 30, 60].includes(candidate?.frameRate) ? candidate.frameRate : 24,
    renderResolution: [64, 96, 128, 160, 256, 384, 480, 720, 1024].includes(candidate?.renderResolution) ? candidate.renderResolution : 480,
    pixelGridSize: [24, 32, 40, 48, 64, 80, 96].includes(candidate?.pixelGridSize) ? candidate.pixelGridSize : 64,
    pixelated: Boolean(candidate?.pixelated),
    dock: ["left", "right", "free"].includes(candidate?.dock) ? candidate.dock : "right",
    gazeTrackingArea: ["near", "wide", "screen"].includes(candidate?.gazeTrackingArea) ? candidate.gazeTrackingArea : "wide",
    muted: candidate?.muted !== false,
    todoEnabled: candidate?.todoEnabled !== false,
    pluginGrants,
    pluginEnabled,
  };
}

async function readActivePackageKey() {
  try {
    return (await readFile(activePackageKeyPath(), "utf8")).trim();
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function listPackages() {
  await mkdir(packageDirectory(), { recursive: true });
  const activeKey = await readActivePackageKey();
  const entries = await readdir(packageDirectory(), { withFileTypes: true });
  const summaries = await Promise.all(entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".petlord"))
    .map(async (entry) => {
      try {
        return parsePackageSummary(await readFile(path.join(packageDirectory(), entry.name)), entry.name, activeKey);
      } catch {
        return null;
      }
    }));
  return summaries.filter(Boolean).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function broadcast(channel, ...args) {
  for (const window of [mainWindow, settingsWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send(channel, ...args);
  }
}

async function notifyPackageChanged(contents) {
  broadcast("runtime:package-changed", contents ?? null);
  if (contents && mainWindow && !mainWindow.isDestroyed()) mainWindow.showInactive();
  updateTrayMenu();
}

async function savePackageContents(contents, options = {}) {
  const parsed = parsePackageSummary(contents, "pending.petlord", "");
  const encoded = packageBuffer(contents);
  await mkdir(packageDirectory(), { recursive: true });
  const packages = await listPackages();
  const explicitTarget = options.targetKey ? packages.find((candidate) => candidate.key === safePackageKey(String(options.targetKey))) : undefined;
  const sameNameTarget = options.mode === "new" ? undefined : packages.find((candidate) => candidate.name.trim().toLocaleLowerCase() === parsed.name.trim().toLocaleLowerCase());
  const timestamp = parsed.createdAt.replaceAll(/[^0-9]/g, "").slice(0, 14) || Date.now().toString();
  const id = String(parsed.id).replaceAll(/[^A-Za-z0-9_-]/g, "-").slice(0, 52);
  const key = explicitTarget?.key ?? sameNameTarget?.key ?? safePackageKey(`${timestamp}-${id}.petlord`);
  await writeFile(path.join(packageDirectory(), key), encoded);
  await writeFile(activePackageKeyPath(), key, "utf8");
  const updatedPackages = await listPackages();
  for (const old of updatedPackages.slice(30)) {
    if (!old.active) await unlink(path.join(packageDirectory(), old.key)).catch(() => undefined);
  }
  await notifyPackageChanged(encoded);
  return (await listPackages()).find((candidate) => candidate.key === key);
}

async function migrateLegacyPackage() {
  if ((await listPackages()).length > 0) return;
  try {
    await savePackageContents(await readFile(legacyPackagePath()));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function loadActivePackage() {
  await migrateLegacyPackage();
  const key = await readActivePackageKey();
  if (!key) return null;
  return readFile(path.join(packageDirectory(), safePackageKey(key)));
}

async function activatePackage(key) {
  const safeKey = safePackageKey(key);
  const contents = await readFile(path.join(packageDirectory(), safeKey));
  parsePackageSummary(contents, safeKey, safeKey);
  await writeFile(activePackageKeyPath(), safeKey, "utf8");
  await notifyPackageChanged(contents);
  return contents;
}

async function removePackage(key) {
  const safeKey = safePackageKey(key);
  const activeKey = await readActivePackageKey();
  if (safeKey === activeKey) throw new Error("当前正在使用的宠物包不能删除，请先切换到其他版本。");
  await unlink(path.join(packageDirectory(), safeKey));
  updateTrayMenu();
  return listPackages();
}

function subscriptionServerUrl(value) {
  const parsed = new URL(String(value ?? "").trim());
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("订阅地址必须是有效的 HTTP 或 HTTPS 服务器地址。");
  }
  parsed.search = "";
  parsed.hash = "";
  parsed.pathname = parsed.pathname.replace(/\/api\/library(?:\/packages)?\/?$/, "").replace(/\/+$/, "");
  return parsed.toString().replace(/\/+$/, "");
}

async function subscriptionResponse(response, operation) {
  if (response.ok) return response;
  const payload = await response.json().catch(() => undefined);
  throw new Error(payload?.error?.message ?? `${operation}失败（HTTP ${response.status}）。`);
}

async function listSubscriptionPackages(serverUrl) {
  const baseUrl = subscriptionServerUrl(serverUrl);
  const response = await subscriptionResponse(await fetch(`${baseUrl}/api/library/packages`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  }), "读取订阅");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 2 * 1024 * 1024) throw new Error("订阅列表超过 2 MB 安全限制。");
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 2 * 1024 * 1024) throw new Error("订阅列表超过 2 MB 安全限制。");
  return JSON.parse(text);
}

async function downloadSubscriptionPackage(serverUrl, publicationId) {
  if (!/^[a-f0-9]{64}$/.test(String(publicationId))) throw new Error("订阅包 ID 无效。");
  const baseUrl = subscriptionServerUrl(serverUrl);
  const response = await subscriptionResponse(await fetch(`${baseUrl}/api/library/packages/${publicationId}/download`, {
    headers: { Accept: "application/vnd.petlord.package+gzip, application/octet-stream" },
    signal: AbortSignal.timeout(60_000),
  }), "下载订阅包");
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > 224 * 1024 * 1024) throw new Error("订阅包超过 224 MB 安全限制。");
  const contents = Buffer.from(await response.arrayBuffer());
  if (contents.byteLength === 0 || contents.byteLength > 224 * 1024 * 1024) throw new Error("订阅包大小无效。");
  parsePackageSummary(contents, "subscription.petlord", "");
  return contents;
}

async function loadSettings() {
  try {
    const stored = JSON.parse(await readFile(settingsPath(), "utf8"));
    if (stored.settingsVersion !== 2) stored.alwaysOnTop = false;
    runtimeSettings = normalizeSettings({ ...defaultSettings, ...stored });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return runtimeSettings;
}

async function saveSettings(patch) {
  const allowed = Object.fromEntries(Object.keys(defaultSettings)
    .filter((key) => Object.prototype.hasOwnProperty.call(patch ?? {}, key))
    .map((key) => [key, patch[key]]));
  const next = normalizeSettings({ ...runtimeSettings, ...allowed });
  if (app.isPackaged && Object.prototype.hasOwnProperty.call(allowed, "launchAtLogin")) {
    app.setLoginItemSettings({ openAtLogin: Boolean(next.launchAtLogin), openAsHidden: true });
  }
  runtimeSettings = next;
  await writeFile(settingsPath(), JSON.stringify(runtimeSettings, null, 2), "utf8");
  applySettings();
  broadcast("runtime:settings-changed", runtimeSettings);
  updateTrayMenu();
  return runtimeSettings;
}

function petWindowDimensions() {
  const displaySize = Number(runtimeSettings.displaySize) || 320;
  return [Math.max(260, displaySize + 36), Math.max(330, displaySize + 96)];
}

function dockWindow() {
  if (!mainWindow || runtimeSettings.dock === "free") return;
  const display = screen.getDisplayMatching(mainWindow.getBounds());
  const [width, height] = mainWindow.getSize();
  const margin = 10;
  const x = runtimeSettings.dock === "left"
    ? display.workArea.x + margin
    : display.workArea.x + display.workArea.width - width - margin;
  const y = display.workArea.y + display.workArea.height - height - margin;
  mainWindow.setPosition(Math.round(x), Math.round(y), true);
}

function movePetWindow(input) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const requestedX = Number(input?.x);
  const requestedY = Number(input?.y);
  if (!Number.isFinite(requestedX) || !Number.isFinite(requestedY)) return;
  const [width, height] = mainWindow.getSize();
  const pointerX = Number.isFinite(Number(input?.pointerX)) ? Number(input.pointerX) : requestedX + width / 2;
  const pointerY = Number.isFinite(Number(input?.pointerY)) ? Number(input.pointerY) : requestedY + height / 2;
  const display = screen.getDisplayNearestPoint({ x: Math.round(pointerX), y: Math.round(pointerY) });
  const minimumVisible = 48;
  const minimumX = display.workArea.x - width + minimumVisible;
  const maximumX = display.workArea.x + display.workArea.width - minimumVisible;
  const minimumY = display.workArea.y - height + minimumVisible;
  const maximumY = display.workArea.y + display.workArea.height - minimumVisible;
  const x = Math.min(maximumX, Math.max(minimumX, Math.round(requestedX)));
  const y = Math.min(maximumY, Math.max(minimumY, Math.round(requestedY)));
  mainWindow.setPosition(x, y, false);
  if (runtimeSettings.dock !== "free") {
    runtimeSettings = { ...runtimeSettings, dock: "free" };
    void writeFile(settingsPath(), JSON.stringify(runtimeSettings, null, 2), "utf8")
      .catch((error) => console.warn("Unable to persist the undocked pet position mode", error));
    broadcast("runtime:settings-changed", runtimeSettings);
    updateTrayMenu();
  }
}

function setPetWindowIgnoreMouse(ignore) {
  mainWindow?.setIgnoreMouseEvents(Boolean(runtimeSettings.clickThrough || ignore), { forward: true });
}

function stopGlobalPointerTracking() {
  if (globalPointerTimer) clearInterval(globalPointerTimer);
  globalPointerTimer = undefined;
}

function publishGlobalPointer() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const bounds = mainWindow.getBounds();
  mainWindow.webContents.send("runtime:global-pointer-moved", {
    clientX: cursor.x - bounds.x,
    clientY: cursor.y - bounds.y,
    screenX: cursor.x,
    screenY: cursor.y,
  });
}

function syncGlobalPointerTracking() {
  stopGlobalPointerTracking();
  if (runtimeSettings.gazeTrackingArea === "near") return;
  publishGlobalPointer();
  globalPointerTimer = setInterval(publishGlobalPointer, 33);
  globalPointerTimer.unref?.();
}

function applySettings() {
  if (!mainWindow) return;
  if (runtimeSettings.alwaysOnTop) mainWindow.setAlwaysOnTop(true, "floating");
  else mainWindow.setAlwaysOnTop(false);
  const [width, height] = petWindowDimensions();
  mainWindow.setSize(width, height, true);
  setPetWindowIgnoreMouse(runtimeSettings.clickThrough);
  syncGlobalPointerTracking();
  dockWindow();
}

function surfaceUrl(surface) {
  const devUrl = process.env.PETLORD_DESKTOP_URL;
  if (devUrl) {
    const url = new URL(devUrl);
    url.searchParams.set("surface", surface);
    return { type: "url", value: url.toString() };
  }
  return { type: "file", value: path.join(__dirname, "../dist/index.html"), query: { surface } };
}

function loadSurface(window, surface) {
  const target = surfaceUrl(surface);
  if (target.type === "url") window.loadURL(target.value);
  else window.loadFile(target.value, { query: target.query });
}

function createPetWindow(hasPackage) {
  const [width, height] = petWindowDimensions();
  mainWindow = new BrowserWindow({
    width,
    height,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: Boolean(runtimeSettings.alwaysOnTop),
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  mainWindow.once("ready-to-show", () => {
    applySettings();
    if (hasPackage) mainWindow.showInactive();
  });
  mainWindow.on("closed", () => { stopGlobalPointerTracking(); mainWindow = undefined; });
  loadSurface(mainWindow, "pet");
}

function createSettingsWindow(showInitially) {
  settingsWindow = new BrowserWindow({
    width: 860,
    height: 650,
    minWidth: 720,
    minHeight: 560,
    backgroundColor: "#f3f5ef",
    title: "PetLord 设置",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    trafficLightPosition: { x: 18, y: 18 },
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  settingsWindow.once("ready-to-show", () => { if (showInitially) settingsWindow.show(); });
  settingsWindow.on("close", (event) => {
    if (quitting) return;
    event.preventDefault();
    settingsWindow.hide();
  });
  settingsWindow.on("closed", () => { settingsWindow = undefined; });
  loadSurface(settingsWindow, "settings");
}

function showSettings(openImport = false) {
  if (!settingsWindow || settingsWindow.isDestroyed()) createSettingsWindow(true);
  else {
    settingsWindow.show();
    settingsWindow.focus();
  }
  if (openImport) {
    if (settingsWindow.webContents.isLoadingMainFrame()) settingsWindow.webContents.once("did-finish-load", () => settingsWindow?.webContents.send("runtime:open-package-import"));
    else settingsWindow.webContents.send("runtime:open-package-import");
  }
}

function updateTrayMenu() {
  if (!tray) return;
  void listPackages().then((packages) => {
    const packageItems = packages.length > 0
      ? packages.map((item) => ({
          label: item.name,
          type: "radio",
          checked: item.active,
          click: () => { void activatePackage(item.key); },
        }))
      : [{ label: "还没有宠物配置", enabled: false }];
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "打开设置", click: () => showSettings() },
      { label: "导入配置", click: () => showSettings(true) },
      { type: "separator" },
      { label: "宠物配置", submenu: packageItems },
      {
        label: "固定在最前面",
        type: "checkbox",
        checked: Boolean(runtimeSettings.alwaysOnTop),
        click: (item) => { void saveSettings({ alwaysOnTop: item.checked }); },
      },
      { type: "separator" },
      { label: "退出 PetLord", click: () => { quitting = true; app.quit(); } },
    ]));
  });
}

function createTray() {
  const iconPath = path.join(__dirname, "../build/icon.png");
  let image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) image = image.resize({ width: 18, height: 18 });
  tray = new Tray(image);
  tray.setToolTip("PetLord");
  tray.on("click", () => showSettings());
  updateTrayMenu();
}

async function exportDiagnostics() {
  const packages = await listPackages();
  const runtimeErrors = await readFile(runtimeErrorsPath(), "utf8").then(JSON.parse).catch(() => []);
  const report = {
    createdAt: new Date().toISOString(),
    application: { name: app.getName(), version: app.getVersion(), packaged: app.isPackaged, dataDirectory: petLordDataDirectory },
    runtime: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    system: { platform: process.platform, architecture: process.arch, release: require("node:os").release() },
    settings: runtimeSettings,
    packages,
    runtimeErrors,
  };
  const result = await dialog.showSaveDialog(settingsWindow ?? mainWindow, {
    title: "导出 PetLord 诊断报告",
    defaultPath: `petlord-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON 诊断报告", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await writeFile(result.filePath, JSON.stringify(report, null, 2), "utf8");
  return result.filePath;
}

async function reportRuntimeError(input) {
  const entry = {
    createdAt: new Date().toISOString(),
    message: String(input?.message ?? "Unknown renderer error").slice(0, 4000),
    stack: String(input?.stack ?? "").slice(0, 12_000),
    source: String(input?.source ?? "renderer").slice(0, 120),
  };
  const stored = await readFile(runtimeErrorsPath(), "utf8").then(JSON.parse).catch(() => []);
  const current = Array.isArray(stored) ? stored : [];
  await writeFile(runtimeErrorsPath(), JSON.stringify([entry, ...current].slice(0, 20), null, 2), "utf8");
}

app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock?.setIcon(path.join(__dirname, "../build/icon.png"));
  try {
    const migrated = await preparePetLordDataDirectory(petLordDataDirectory, process.env.PETLORD_USER_DATA_DIR ? undefined : legacyUserDataDirectory);
    if (migrated.length > 0) console.info(`Migrated PetLord data to ${petLordDataDirectory}: ${migrated.join(", ")}`);
  } catch (error) {
    console.warn(`Unable to migrate legacy PetLord data to ${petLordDataDirectory}`, error);
  }
  await loadSettings();
  initializeAgentDatabase();
  await startAgentSocket();
  const hasPackage = Boolean(await loadActivePackage().catch(() => null));
  ipcMain.handle("runtime:close", () => { settingsWindow?.hide(); });
  ipcMain.handle("runtime:set-ignore-mouse", (_event, ignore) => setPetWindowIgnoreMouse(ignore));
  ipcMain.on("runtime:move-pet-window", (event, input) => {
    if (event.sender === mainWindow?.webContents) movePetWindow(input);
  });
  ipcMain.handle("runtime:show-settings", () => showSettings());
  ipcMain.handle("runtime:hide-settings", () => settingsWindow?.hide());
  ipcMain.handle("runtime:show-pet", () => mainWindow?.showInactive());
  ipcMain.handle("runtime:get-settings", () => runtimeSettings);
  ipcMain.handle("runtime:update-settings", (_event, patch) => saveSettings(patch));
  ipcMain.handle("runtime:choose-package", async () => {
    const result = await dialog.showOpenDialog(settingsWindow ?? mainWindow, {
      title: "选择 PetLord 宠物包",
      properties: ["openFile"],
      filters: [{ name: "PetLord 宠物包", extensions: ["petlord"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return readFile(result.filePaths[0]);
  });
  ipcMain.handle("runtime:save-package", (_event, contents, options) => savePackageContents(contents, options));
  ipcMain.handle("runtime:load-package", () => loadActivePackage());
  ipcMain.handle("runtime:list-packages", () => listPackages());
  ipcMain.handle("runtime:activate-package", (_event, key) => activatePackage(String(key)));
  ipcMain.handle("runtime:remove-package", (_event, key) => removePackage(String(key)));
  ipcMain.handle("runtime:list-subscription-packages", (_event, serverUrl) => listSubscriptionPackages(serverUrl));
  ipcMain.handle("runtime:download-subscription-package", (_event, serverUrl, publicationId) => downloadSubscriptionPackage(serverUrl, publicationId));
  ipcMain.handle("runtime:export-diagnostics", () => exportDiagnostics());
  ipcMain.handle("runtime:report-error", (_event, input) => reportRuntimeError(input));
  ipcMain.handle("runtime:list-agent-events", (_event, input) => listAgentEvents(input));
  ipcMain.handle("runtime:acknowledge-agent-event", (_event, id, input) => acknowledgeAgentEvent(id, Boolean(input?.opened)));
  ipcMain.handle("runtime:simulate-agent-event", (_event, source, payload) => storeAgentEvent(normalizeAgentEvent(source, payload)));
  ipcMain.handle("runtime:open-agent-session", (_event, input) => openAgentSession(input));
  ipcMain.handle("runtime:agent-integration-status", () => agentIntegrationStatus());
  ipcMain.handle("runtime:install-agent-integration", (_event, source) => installAgentIntegration(source));
  ipcMain.handle("runtime:plugin-storage-get", (_event, pluginId, key) => pluginStorageGet(pluginId, key));
  ipcMain.handle("runtime:plugin-storage-set", (_event, pluginId, key, value) => pluginStorageSet(pluginId, key, value));
  ipcMain.handle("runtime:plugin-storage-remove", (_event, pluginId, key) => pluginStorageRemove(pluginId, key));
  createPetWindow(hasPackage);
  createSettingsWindow(!hasPackage || process.env.PETLORD_SHOW_SETTINGS === "1");
  createTray();
  app.dock?.hide();
  globalShortcut.register("CommandOrControl+Shift+P", () => {
    void saveSettings({ clickThrough: !runtimeSettings.clickThrough });
  });
});

app.on("before-quit", () => {
  quitting = true;
  globalShortcut.unregisterAll();
  stopGlobalPointerTracking();
  agentSocketServer?.close();
  agentDatabase?.close();
  if (process.platform !== "win32" && agentSocketPath) void unlink(agentSocketPath).catch(() => undefined);
});
app.on("window-all-closed", () => {
  // PetLord remains available from the system tray.
});
app.on("activate", () => showSettings());
