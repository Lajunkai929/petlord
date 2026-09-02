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
  private reactionEventId?: string;
  private readonly disposers: Array<() => void> = [];
  private readonly listeners = new Set<() => void>();

  constructor(private readonly context: PetPluginContext) {}

  async activate() {
    this.events = await this.context.events.list({ unreadOnly: false, limit: 100 });
    this.reactionEventId = this.events.find((item) => !item.acknowledgedAt && REACTION_TYPES.has(item.type))?.id;
    this.disposers.push(
      this.context.events.subscribe("claude", (event) => { void this.receive(event); }),
      this.context.events.subscribe("codex", (event) => { void this.receive(event); }),
      this.context.interactions.onPetClick(() => this.openReaction()),
      this.context.interactions.onPetContextMenu(() => this.openInbox()),
    );
    this.emit();
    return this;
  }

  dispose() {
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

  async receive(event: AgentEvent) {
    if (this.events.some((candidate) => candidate.id === event.id)) return;
    this.events = [event, ...this.events].slice(0, 100);
    if (REACTION_TYPES.has(event.type)) {
      this.reactionEventId = event.id;
      await this.present(event);
    }
    this.emit();
  }

  async acknowledge(id: string) {
    const updated = await this.context.events.acknowledge(id);
    if (!updated) return;
    this.replace(updated);
  }

  async open(id: string) {
    const event = this.events.find((candidate) => candidate.id === id);
    if (!event) return;
    await this.context.integrations.openAgentSession(event);
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
