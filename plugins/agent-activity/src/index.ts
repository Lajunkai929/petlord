import { definePlugin, type PetPluginContext } from "@petlord/plugin-sdk";
import type { AgentEvent, AgentEventSource } from "@petlord/schema";

const REACTION_TYPES = new Set<AgentEvent["type"]>(["needs-attention", "turn-completed", "task-completed", "failed"]);

function actionCandidates(type: AgentEvent["type"]) {
  if (type === "needs-attention" || type === "failed") return ["attention", "greet", "play"];
  return ["happy", "greet", "play"];
}

function sourceLabel(source: AgentEventSource) {
  return source === "claude" ? "Claude" : "Codex";
}

export class AgentActivityController {
  private events: AgentEvent[] = [];
  private readonly seenEventIds = new Set<string>();
  private reactionEventId?: string;
  private readonly sessions = new Map<string, AgentEvent>();
  private loopAction: string | null = null;
  private runtimeId?: string;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private readonly disposers: Array<() => void> = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly context: PetPluginContext) {}

  async activate() {
    let loading = true;
    const buffered: AgentEvent[] = [];
    const incoming = (event: AgentEvent) => {
      if (loading) buffered.push(event);
      else void this.receive(event).catch(() => undefined);
    };
    // Subscribe before reading history so a completion cannot disappear between the read and subscribe.
    this.disposers.push(this.context.events.subscribe("claude", incoming), this.context.events.subscribe("codex", incoming));
    try {
      const [recentEvents, notifications] = await Promise.all([
        this.context.events.list({ unreadOnly: false, latestPerSession: true, limit: 100 }),
        this.context.events.list({ unreadOnly: false, notificationsOnly: true, limit: 100 }),
      ]);
      this.events = notifications.filter(event => REACTION_TYPES.has(event.type));
      // Reduce both snapshots in time order; the per-session result is authoritative for equal timestamps.
      for (const event of [...notifications, ...recentEvents].sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))) {
        this.rememberEvent(event.id); this.updateSession(event);
      }
      this.reactionEventId = this.events.find(item => !item.acknowledgedAt)?.id;
      this.disposers.push(
        this.context.pet.onStateChanged(snapshot => {
          if (!snapshot.runtimeId || snapshot.runtimeId === this.runtimeId) return;
          this.runtimeId = snapshot.runtimeId;
          this.queue = this.queue.catch(() => undefined).then(() => this.syncActivityLoop(true));
          void this.queue.catch(() => undefined);
        }),
        this.context.interactions.onPetClick(() => this.openReaction()),
        this.context.interactions.onPetContextMenu(() => this.openInbox()),
      );
      const pending = buffered.map(event => this.receive(event));
      loading = false;
      await Promise.all(pending);
      await this.syncActivityLoop();
      this.emit();
      return this;
    } catch (caught) { this.dispose(); throw caught; }
  }

  dispose() {
    this.disposed = true;
    void this.context.pet.setActivityLoop?.(null).catch(() => undefined);
    void this.context.pet.speak("", { durationMs: 0 }).catch(() => undefined);
    for (const dispose of this.disposers.splice(0)) dispose();
    this.listeners.clear();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  list() {
    return this.events.map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }

  unreadCount() {
    return this.events.filter((event) => !event.acknowledgedAt).length;
  }

  reaction() {
    return this.events.find((event) => event.id === this.reactionEventId);
  }

  receive(event: AgentEvent): Promise<void> {
    this.queue = this.queue.catch(() => undefined).then(async () => {
      if (this.disposed || this.seenEventIds.has(event.id) || this.events.some(candidate => candidate.id === event.id)) return;
      this.rememberEvent(event.id);
      if (REACTION_TYPES.has(event.type)) this.events = [event, ...this.events].slice(0, 100);
      const current = this.updateSession(event);
      if (current && REACTION_TYPES.has(event.type)) {
        this.reactionEventId = event.id;
        await this.changeActivityLoop(null);
        await this.present(event);
      } else if (current && event.type === "working") {
        await this.context.pet.speak(`${sourceLabel(event.source)} · ${(event.summary ?? "正在处理任务").slice(0, 96)}`, { durationMs: 0 });
      } else if (current && event.type === "session-ended") {
        await this.context.pet.speak(event.summary ?? "任务已中断", { durationMs: 3200 });
      }
      await this.syncActivityLoop(current && event.type === "working");
      this.emit();
    });
    return this.queue;
  }

  private rememberEvent(id: string) {
    this.seenEventIds.add(id);
    if (this.seenEventIds.size > 1000) this.seenEventIds.delete(this.seenEventIds.values().next().value!);
  }

  private updateSession(event: AgentEvent) {
    if (event.metadata.test === true) return true;
    const key = `${event.source}:${event.sessionId}`;
    const previous = this.sessions.get(key);
    const terminal = (type: AgentEvent["type"]) => ["turn-completed", "task-completed", "failed", "session-ended"].includes(type);
    if (previous) {
      if (event.receivedAt < previous.receivedAt) return false;
      const sameTurn = event.metadata.turnId === previous.metadata.turnId;
      if (!sameTurn && event.type !== "working" && event.type !== "session-started" && event.metadata.hookEvent !== "SessionEnd") return false;
      if (sameTurn && terminal(previous.type) && event.type === "working") return false;
    }
    this.sessions.set(key, event);
    return true;
  }

  private async changeActivityLoop(action: string | null, force = false) {
    if (this.disposed || (!force && this.loopAction === action)) return;
    if (!this.context.pet.setActivityLoop) return;
    const result = await this.context.pet.setActivityLoop(action);
    if (result.accepted) this.loopAction = action;
  }

  private async syncActivityLoop(force = false) {
    if (this.disposed) return;
    if (![...this.sessions.values()].some(event => event.type === "working")) { await this.changeActivityLoop(null, force); return; }
    const snapshot = await this.context.pet.getSnapshot();
    this.runtimeId = snapshot.runtimeId;
    const action = ["working", "dig", "digging"].find(candidate => snapshot.availableActions.includes(candidate));
    if (action) await this.changeActivityLoop(action, force);
  }

  async acknowledge(id: string) {
    const updated = await this.context.events.acknowledge(id);
    if (!updated) return;
    this.replace(updated);
  }

  async open(id: string) {
    const event = this.events.find((candidate) => candidate.id === id);
    if (!event) return;
    if (event.metadata.test !== true) await this.context.integrations.openAgentSession(event);
    const updated = await this.context.events.acknowledge(event.id, { opened: true });
    if (updated) this.replace(updated);
  }

  private async openReaction() {
    const event = this.reaction();
    if (!event) return false;
    await this.open(event.id);
    this.reactionEventId = undefined;
    this.emit();
    return true;
  }

  private async openInbox() {
    if (this.unreadCount() === 0) return false;
    await this.context.ui.openPanel();
    return true;
  }

  private async present(event: AgentEvent) {
    const body = event.summary ?? (event.type === "needs-attention" ? "等待你的操作" : "任务已经完成");
    const message = `${sourceLabel(event.source)} · ${event.title}：${body}`;
    await Promise.all([
      this.context.pet.speak(message, { durationMs: 4600 }),
      this.context.ui.notify(`${sourceLabel(event.source)} · ${event.title}`, body),
    ]);
    const snapshot = await this.context.pet.getSnapshot();
    const action = actionCandidates(event.type).find((candidate) => snapshot.availableActions.includes(candidate));
    if (action) await this.context.pet.perform(action);
    else await this.context.pet.speak(event.type === "needs-attention" ? "需要你确认一下。" : "任务完成了。", { durationMs: 3200 });
  }

  private replace(updated: AgentEvent) {
    this.events = this.events.map((event) => event.id === updated.id ? updated : event);
    if (this.reactionEventId === updated.id && updated.acknowledgedAt) {
      this.reactionEventId = this.events.find((event) => !event.acknowledgedAt && REACTION_TYPES.has(event.type))?.id;
    }
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export default definePlugin<AgentActivityController>({
  manifest: {
    id: "petlord.agent-activity",
    name: "Agent Activity",
    version: "0.1.0",
    entry: "index.js",
    description: "把 Claude 与 Codex 的任务状态转成宠物动作、提醒和会话收件箱。",
    permissions: [
      "pet:read",
      "pet:control",
      "ui:panel",
      "ui:context-menu",
      "notifications",
      "background:events",
      "integration:claude:events",
      "integration:claude:open-session",
      "integration:codex:events",
      "integration:codex:open-session",
    ],
    panel: { title: "Agent 收件箱", width: 400, height: 560 },
  },
  async activate(context) {
    return new AgentActivityController(context).activate();
  },
  deactivate(controller) {
    controller.dispose();
  },
});
