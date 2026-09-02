import { agentEventSchema, type AgentEvent, type AgentEventSeverity, type AgentEventSource, type AgentEventType } from "@petlord/schema";

type JsonObject = Record<string, unknown>;

function object(input: unknown): JsonObject {
  return input && typeof input === "object" && !Array.isArray(input) ? input as JsonObject : {};
}

function text(input: unknown, maximum = 4000): string | undefined {
  if (typeof input !== "string") return undefined;
  const value = input.trim();
  return value ? value.slice(0, maximum) : undefined;
}

function timestamp(input: unknown, fallback: string) {
  const value = text(input, 80);
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? fallback : parsed.toISOString();
}

function shortHash(input: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function event(input: Omit<AgentEvent, "schemaVersion" | "id" | "dedupeKey" | "receivedAt" | "metadata"> & {
  eventKey: string;
  receivedAt: string;
  metadata?: AgentEvent["metadata"];
}) {
  const dedupeKey = `${input.source}:${input.sessionId}:${input.eventKey}`;
  return agentEventSchema.parse({
    ...input,
    schemaVersion: 1,
    id: `${input.source}-${shortHash(dedupeKey)}-${shortHash(`${dedupeKey}:${input.occurredAt}`)}`,
    dedupeKey,
    metadata: input.metadata ?? {},
  });
}

function basename(path: string | undefined) {
  const normalized = path?.replaceAll("\\", "/").replace(/\/$/, "");
  return normalized?.slice(normalized.lastIndexOf("/") + 1) || undefined;
}

function codexType(payload: JsonObject): { type: AgentEventType; severity: AgentEventSeverity } {
  const kind = text(payload.type, 120);
  if (kind === "agent-turn-complete") return { type: "turn-completed", severity: "success" };
  if (kind === "agent-turn-failed") return { type: "failed", severity: "error" };
  if (kind === "agent-needs-attention") return { type: "needs-attention", severity: "warning" };
  return { type: "turn-completed", severity: "success" };
}

/** Normalize the JSON payload passed to Codex's official `notify` command. */
export function normalizeCodexNotifyPayload(input: unknown, receivedAt = new Date().toISOString()): AgentEvent {
  const payload = object(input);
  const sessionId = text(payload["thread-id"], 240) ?? text(payload.thread_id, 240) ?? text(payload.session_id, 240);
  if (!sessionId) throw new Error("Codex notify payload is missing thread-id.");
  const turnId = text(payload["turn-id"], 240) ?? text(payload.turn_id, 240) ?? "turn";
  const cwd = text(payload.cwd, 4096);
  const inputMessages = Array.isArray(payload["input-messages"])
    ? payload["input-messages"].map((item) => text(item, 400)).filter(Boolean) as string[]
    : [];
  const summary = text(payload["last-assistant-message"], 4000) ?? text(payload.last_assistant_message, 4000);
  const status = codexType(payload);
  return event({
    source: "codex",
    type: status.type,
    severity: status.severity,
    sessionId,
    eventKey: `${turnId}:${text(payload.type, 120) ?? "agent-turn-complete"}`,
    occurredAt: timestamp(payload.occurred_at, receivedAt),
    receivedAt,
    title: inputMessages.at(-1) ?? basename(cwd) ?? "Codex 任务",
    summary,
    cwd,
    metadata: {
      turnId,
      client: text(payload.client, 120) ?? null,
    },
  });
}

function claudeType(payload: JsonObject): { type: AgentEventType; severity: AgentEventSeverity } {
  const hook = text(payload.hook_event_name, 120) ?? text(payload.type, 120) ?? "Stop";
  const notification = text(payload.notification_type, 120);
  if (hook === "SessionStart") return { type: "session-started", severity: "info" };
  if (hook === "UserPromptSubmit") return { type: "working", severity: "info" };
  if (hook === "Notification" && notification === "permission_prompt") return { type: "needs-attention", severity: "warning" };
  if (hook === "StopFailure") return { type: "failed", severity: "error" };
  if (hook === "TaskCompleted") return { type: "task-completed", severity: "success" };
  if (hook === "SessionEnd") return { type: "session-ended", severity: "info" };
  return { type: "turn-completed", severity: "success" };
}

/** Normalize Claude Code Hook JSON without reading the transcript file. */
export function normalizeClaudeHookPayload(input: unknown, receivedAt = new Date().toISOString()): AgentEvent {
  const payload = object(input);
  const sessionId = text(payload.session_id, 240);
  if (!sessionId) throw new Error("Claude Hook payload is missing session_id.");
  const hook = text(payload.hook_event_name, 120) ?? text(payload.type, 120) ?? "Stop";
  const cwd = text(payload.cwd, 4096);
  const task = object(payload.task);
  const taskId = text(task.id, 240);
  const summary = text(payload.last_assistant_message, 4000)
    ?? text(payload.message, 4000)
    ?? text(task.subject, 4000);
  const status = claudeType(payload);
  return event({
    source: "claude",
    type: status.type,
    severity: status.severity,
    sessionId,
    eventKey: `${text(payload.turn_id, 240) ?? taskId ?? timestamp(payload.occurred_at, receivedAt)}:${hook}:${text(payload.notification_type, 120) ?? ""}`,
    occurredAt: timestamp(payload.occurred_at, receivedAt),
    receivedAt,
    title: text(task.subject, 240) ?? text(payload.title, 240) ?? basename(cwd) ?? "Claude 任务",
    summary,
    cwd,
    metadata: {
      hook,
      notificationType: text(payload.notification_type, 120) ?? null,
      taskId: taskId ?? null,
    },
  });
}

export function normalizeAgentPayload(source: AgentEventSource, payload: unknown, receivedAt?: string) {
  return source === "codex"
    ? normalizeCodexNotifyPayload(payload, receivedAt)
    : normalizeClaudeHookPayload(payload, receivedAt);
}

export interface CodexNotifyEdit {
  text: string;
  previousNotify?: string[];
  changed: boolean;
}

function parseTomlStringArray(value: string): string[] | undefined {
  try {
    const normalized = value.trim().replace(/^\[/, "[").replace(/\]$/, "]");
    const parsed = JSON.parse(normalized);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Safely updates only the user-level Codex `notify` entry and returns the notifier it replaced. */
export function installCodexNotify(configText: string, command: string[]): CodexNotifyEdit {
  const line = `notify = ${JSON.stringify(command)}`;
  const matcher = /^notify\s*=\s*(\[[^\n]*\])\s*$/m;
  const match = configText.match(matcher);
  if (match) {
    const previousNotify = parseTomlStringArray(match[1]);
    if (JSON.stringify(previousNotify) === JSON.stringify(command)) return { text: configText, previousNotify, changed: false };
    return { text: configText.replace(matcher, line), previousNotify, changed: true };
  }
  return { text: `${line}\n${configText}`, changed: true };
}

export function uninstallCodexNotify(configText: string, managedCommand: string[], previousNotify?: string[]): CodexNotifyEdit {
  const matcher = /^notify\s*=\s*(\[[^\n]*\])\s*\n?/m;
  const match = configText.match(matcher);
  if (!match || JSON.stringify(parseTomlStringArray(match[1])) !== JSON.stringify(managedCommand)) {
    return { text: configText, previousNotify, changed: false };
  }
  const replacement = previousNotify ? `notify = [${previousNotify.map((item) => JSON.stringify(item)).join(", ")}]\n` : "";
  return { text: configText.replace(matcher, replacement), previousNotify, changed: true };
}

export const managedClaudeHookEvents = [
  "SessionStart",
  "UserPromptSubmit",
  "Notification",
  "Stop",
  "TaskCompleted",
  "SessionEnd",
] as const;

export function installClaudeHooks(settingsInput: unknown, command: string) {
  const settings = structuredClone(object(settingsInput));
  const hooks = object(settings.hooks);
  for (const eventName of managedClaudeHookEvents) {
    const current = Array.isArray(hooks[eventName]) ? hooks[eventName] as unknown[] : [];
    const retained = current.filter((entry) => object(entry)._petLordManaged !== true);
    hooks[eventName] = [...retained, {
      _petLordManaged: true,
      hooks: [{ type: "command", command }],
    }];
  }
  settings.hooks = hooks;
  return settings;
}

export function uninstallClaudeHooks(settingsInput: unknown) {
  const settings = structuredClone(object(settingsInput));
  const hooks = object(settings.hooks);
  for (const [eventName, value] of Object.entries(hooks)) {
    if (!Array.isArray(value)) continue;
    const retained = value.filter((entry) => object(entry)._petLordManaged !== true);
    if (retained.length > 0) hooks[eventName] = retained;
    else delete hooks[eventName];
  }
  settings.hooks = hooks;
  return settings;
}
