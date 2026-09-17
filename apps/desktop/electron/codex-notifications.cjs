"use strict";
const path = require("node:path");
const { createHash, randomUUID } = require("node:crypto");
const { mkdir, readFile, writeFile, rename, copyFile, chmod, open } = require("node:fs/promises");
const { constants } = require("node:fs");
const MANAGED_MARKER = "--petlord-codex-lifecycle";
const HOOKS = ["UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "Interrupt", "SessionEnd"];
const clean = (value, max = 180) => typeof value === "string" ? value.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, max) || undefined : undefined;
const heading = value => clean(value, 240)?.split(/\r?\n/).find(line => line.trim())?.replace(/^#{1,6}\s+|^\*\*|\*\*$/g, "").trim().slice(0, 160);
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 24);

// Only explicit summary fields may provide a thinking title. Never inspect their body/content.
function summaryHeading(text) {
  if (typeof text !== "string") return;
  const line = text.slice(0, 512).split(/\r?\n/).find(value => value.trim())?.trim();
  if (!line) return;
  const match = line.match(/^\*\*([^*\r\n]+)\*\*$/) ?? line.match(/^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?$/);
  const title = match?.[1]?.replace(/^\*\*([^*]+)\*\*$/, "$1").trim();
  return title && title.length <= 96 ? clean(title, 96) : undefined;
}

function structuredSummaryHeading(record, turnId) {
  let parts;
  if (record?.type === "response_item" && record.payload?.type === "reasoning") {
    if (turnId && (record.turn_id ?? record.payload.turn_id) && (record.turn_id ?? record.payload.turn_id) !== turnId) return;
    parts = Array.isArray(record.payload.summary) ? record.payload.summary.filter(part => part?.type === "summary_text").map(part => part.text) : [];
  } else if (record?.method === "item/completed" && record.params?.item?.type === "reasoning" && typeof record.params.threadId === "string" && typeof record.params.turnId === "string") {
    if (turnId && record.params.turnId !== turnId) return;
    parts = record.params.item.summary;
  }
  if (!Array.isArray(parts)) return;
  for (const text of [...parts].reverse()) {
    const title = summaryHeading(text); if (title) return title;
  }
}

function extractVisibleHeading(input, turnId) {
  if (typeof input !== "string") return;
  const lines = input.slice(-128 * 1024).split(/\r?\n/).slice(-200);
  for (let index = lines.length - 1; index >= 0; index--) {
    let record; try { record = JSON.parse(lines[index]); } catch { continue; }
    const publicTitle = structuredSummaryHeading(record, turnId);
    if (publicTitle) return publicTitle;
    const item = record?.payload;
    if (!item || typeof item !== "object") continue;
    if (turnId && (item.turn_id ?? record.turn_id) && (item.turn_id ?? record.turn_id) !== turnId) continue;
    let visible;
    if (record.type === "response_item" && item.type === "message" && item.role === "assistant" && item.channel !== "analysis" && (item.channel === "commentary" || item.phase === "commentary")) {
      visible = Array.isArray(item.content) ? item.content.filter(part => part?.type === "output_text").map(part => part.text).filter(text => typeof text === "string").join("\n") : undefined;
    } else if (record.type === "event_msg" && item.type === "agent_message" && item.phase === "commentary") visible = item.message;
    else if (record.type === "event_msg" && item.type === "public_progress" && item.visibility === "public") visible = item.title;
    // Raw reasoning, analysis, unlabelled summaries and tool arguments are never rendered.
    const result = heading(visible); if (result) return result;
  }
}

async function enrichCodexHookPayload(payload) {
  const hook = clean(payload?.hook_event_name);
  const result = { hook_event_name: hook, session_id: clean(payload?.session_id, 240), turn_id: clean(payload?.turn_id, 240), cwd: clean(payload?.cwd, 4096), tool_name: clean(payload?.tool_name, 120), tool_use_id: clean(payload?.tool_use_id ?? payload?.tool_call_id, 240), event_id: randomUUID(), petlord_test: payload?.petlord_test === true };
  if (hook === "Stop") result.last_assistant_message = heading(payload.last_assistant_message);
  if (["PreToolUse", "PostToolUse"].includes(hook) && typeof payload.transcript_path === "string") {
    let file;
    try {
      file = await open(payload.transcript_path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
      const stat = await file.stat();
      if (stat.isFile()) {
        const length = Math.min(stat.size, 128 * 1024);
        const buffer = Buffer.alloc(length);
        await file.read(buffer, 0, length, stat.size - length);
        result.public_heading = extractVisibleHeading(buffer.toString("utf8"), result.turn_id);
      }
    } catch { /* Transcript format/path is optional; named tool status remains available. */ }
    finally { await file?.close().catch(() => undefined); }
  }
  return result;
}

function normalizeCodexEvent(payload, receivedAt = new Date().toISOString()) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Codex notification must be an object.");
  const sessionId = clean(payload.session_id ?? payload["thread-id"] ?? payload.thread_id, 240);
  if (!sessionId) throw new Error("Codex notification is missing session_id.");
  const turnId = clean(payload.turn_id ?? payload["turn-id"], 240) ?? "turn";
  const hook = clean(payload.hook_event_name, 80);
  const legacy = payload.type;
  const type = hook === "SessionStart" ? "session-started"
    : ["UserPromptSubmit", "PreToolUse", "PostToolUse"].includes(hook) ? "working"
      : hook === "PermissionRequest" || legacy === "agent-needs-attention" ? "needs-attention"
        : hook === "Interrupt" || hook === "SessionEnd" ? "session-ended"
          : hook === "Stop" || legacy === "agent-turn-complete" ? "turn-completed"
            : legacy === "agent-turn-failed" ? "failed" : undefined;
  if (!type) throw new Error("Unsupported Codex lifecycle event.");
  const tool = clean(payload.tool_name, 80);
  const toolLabel = tool && (/exec_command|Bash|shell/.test(tool) ? "执行命令" : /apply_patch|Edit|Write/.test(tool) ? "修改文件" : /web|search/.test(tool) ? "查询资料" : `使用工具 ${tool}`);
  const fallback = hook === "UserPromptSubmit" ? "开始处理任务" : hook === "PermissionRequest" ? "等待你的授权或操作" : hook === "Interrupt" ? "任务已中断" : type === "session-ended" ? "会话已结束" : type === "failed" ? "任务运行失败" : type === "turn-completed" ? "本轮任务已完成" : toolLabel ?? "正在处理任务";
  const summary = type === "working" ? heading(payload.public_heading)?.slice(0, 96) ?? toolLabel ?? fallback
    : heading(payload.last_assistant_message ?? payload["last-assistant-message"]) ?? fallback;
  const eventKey = ["working", "needs-attention"].includes(type) ? hash(`${hook}:${clean(payload.tool_use_id ?? payload.event_id, 240) ?? `${tool}:${summary}:${receivedAt}`}`) : "";
  const dedupeKey = `codex:${hash(sessionId)}:${hash(turnId)}:${type}:${eventKey}`;
  return { schemaVersion: 1, id: `codex-${hash(dedupeKey)}`, source: "codex", type, severity: type === "failed" ? "error" : type === "needs-attention" ? "warning" : type === "turn-completed" ? "success" : "info", sessionId, occurredAt: receivedAt, receivedAt, dedupeKey, title: clean(path.basename(clean(payload.cwd, 4096) ?? ""), 160) ?? "Codex 任务", summary, cwd: clean(payload.cwd, 4096), metadata: { turnId, hookEvent: hook ?? null, toolName: tool ?? null, test: payload.petlord_test === true, interrupted: hook === "Interrupt" } };
}

const quote = value => `'${String(value).replace(/'/g, `'"'"'`)}'`;
async function readOptional(file) { return readFile(file, "utf8").catch(error => error.code === "ENOENT" ? "" : Promise.reject(error)); }
async function atomicWrite(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await writeFile(temp, value, { encoding: "utf8", mode: 0o600 }); await rename(temp, file);
}
function parseHooks(original) {
  const config = original ? JSON.parse(original) : {};
  if (!config || typeof config !== "object" || Array.isArray(config) || (config.hooks !== undefined && (!config.hooks || typeof config.hooks !== "object" || Array.isArray(config.hooks)))) throw new Error("hooks.json 格式无效，原文件已保留。");
  for (const groups of Object.values(config.hooks ?? {})) if (!Array.isArray(groups) || groups.some(group => !Array.isArray(group?.hooks))) throw new Error("hooks.json 中有无法安全合并的配置，原文件已保留。");
  return config;
}

function createCodexNotificationIntegration(options) {
  const configPath = path.join(path.resolve(options.codexConfigDirectory), "hooks.json");
  const directory = path.resolve(options.dataDirectory);
  const helperPath = path.join(directory, "agent-notify.cjs");
  const modulePath = path.join(directory, "codex-notifications.cjs");
  const helperSource = options.helperSourcePath ?? path.join(__dirname, "agent-notify.cjs");
  const command = [...(options.commandPrefix ?? [process.execPath]), helperPath, "codex-hook", MANAGED_MARKER, "--socket", options.socketPath, "--token-file", options.tokenPath, "--database", options.databasePath].map(quote).join(" ");
  let lastLiveEventAt, lastTestAt, installedAt = 0, installing = false;
  const managed = handler => handler?.type === "command" && typeof handler.command === "string" && handler.command.includes(MANAGED_MARKER) && handler.command.includes(quote(helperPath)) && handler.command.includes(quote("codex-hook"));
  async function status() {
    let config, error;
    try { config = parseHooks(await readOptional(configPath)); } catch (caught) { error = caught.message; }
    const configured = Boolean(config && HOOKS.every(event => config.hooks?.[event]?.some(group => group.hooks.some(handler => handler.type === "command" && handler.command === command))));
    const helperReady = await Promise.all([readOptional(helperPath), readOptional(helperSource), readOptional(modulePath), readOptional(__filename)]).then(([helper, source, module, own]) => Boolean(helper && helper === source && module === own));
    return { available: options.isAvailable ? await options.isAvailable() : true, configured, helperReady, configPath, requiresHookReview: configured && !lastLiveEventAt, lastLiveEventAt, lastTestAt, error, message: lastLiveEventAt ? "已收到真实 Codex 生命周期事件。" : configured ? "配置已写入。请在 Codex 的 /hooks 中审查并信任 PetLord hooks，再开始一个任务验证。" : "尚未配置 Codex 任务提醒。" };
  }
  async function install() {
    if (installing) throw new Error("正在保存通知配置，请稍候。");
    installing = true;
    try {
      const original = await readOptional(configPath); const config = parseHooks(original);
      const hooks = { ...(config.hooks ?? {}) };
      for (const [event, groups] of Object.entries(hooks)) hooks[event] = groups.flatMap(group => {
        const retained = group.hooks.filter(handler => !managed(handler));
        return retained.length ? [{ ...group, hooks: retained }] : [];
      });
      for (const event of HOOKS) hooks[event] = [...(hooks[event] ?? []), { hooks: [{ type: "command", command, timeout: event === "Interrupt" ? 1 : 3 }] }];
      const updated = `${JSON.stringify({ ...config, hooks }, null, 2)}\n`;
      await mkdir(directory, { recursive: true });
      const oldHelper = await readOptional(helperPath); const sourceHelper = await readOptional(helperSource);
      if (!sourceHelper) throw new Error("通知助手文件缺失，请重新安装 PetLord。");
      await atomicWrite(helperPath, sourceHelper); await chmod(helperPath, 0o700);
      const own = await readFile(__filename, "utf8"); const oldModule = await readOptional(modulePath); await atomicWrite(modulePath, own);
      if (updated !== original) {
        if (await readOptional(configPath) !== original) throw new Error("Codex hooks 同时发生了修改，请刷新后重试。");
        if (original) await copyFile(configPath, `${configPath}.petlord-backup-${Date.now()}-${randomUUID()}`, constants.COPYFILE_EXCL);
        await atomicWrite(configPath, updated);
      }
      if (updated !== original || oldHelper !== sourceHelper || oldModule !== own) { installedAt = Date.now(); lastLiveEventAt = undefined; }
      return status();
    } finally { installing = false; }
  }
  function observe(event) {
    if (event?.source === "codex" && event.metadata?.hookEvent && event.metadata?.test !== true && Date.parse(event.receivedAt) >= installedAt) lastLiveEventAt = event.receivedAt;
  }
  async function test() {
    if (!options.sendTest) throw new Error("通知自测接口尚未连接。");
    await options.sendTest({ session_id: `petlord-test-${randomUUID()}`, turn_id: "test", hook_event_name: "Stop", last_assistant_message: "这是 PetLord 通知自测，尚不能证明 Codex hooks 已运行。", petlord_test: true });
    lastTestAt = new Date().toISOString(); return status();
  }
  return { status, install, test, observe };
}
module.exports = { normalizeCodexEvent, extractVisibleHeading, enrichCodexHookPayload, createCodexNotificationIntegration, HOOKS };
