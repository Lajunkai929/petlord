import { describe, expect, it, vi } from "vitest";
import type { PetPluginContext } from "@petlord/plugin-sdk";
import type { AgentEvent } from "@petlord/schema";
import { AgentActivityController } from "./index";

function fixture(source: AgentEvent["source"] = "codex"): AgentEvent {
  return {
    schemaVersion: 1,
    id: `${source}-event`,
    source,
    type: "turn-completed",
    severity: "success",
    sessionId: `${source}-session`,
    occurredAt: "2026-09-02T08:00:00.000Z",
    receivedAt: "2026-09-02T08:00:01.000Z",
    dedupeKey: `${source}:session:turn`,
    title: "Implement the connector",
    summary: "All checks passed.",
    cwd: "/tmp/project",
    metadata: {},
  };
}

function context() {
  const eventListeners = new Map<string, (event: AgentEvent) => void>();
  const clickListeners: Array<() => boolean | Promise<boolean>> = [];
  const context: PetPluginContext = {
    pet: {
      getSnapshot: vi.fn(async () => ({ stateId: "sitting", logicalStateId: "idle", availableActions: ["greet"] })),
      perform: vi.fn(async () => ({ accepted: true })),
      speak: vi.fn(async () => undefined),
      onStateChanged: vi.fn(() => () => undefined),
    },
    storage: { get: vi.fn(async () => null), set: vi.fn(async () => undefined), remove: vi.fn(async () => undefined) },
    ui: { openPanel: vi.fn(async () => undefined), closePanel: vi.fn(async () => undefined), notify: vi.fn(async () => undefined) },
    events: {
      list: vi.fn(async () => []),
      subscribe: vi.fn((source, listener) => { eventListeners.set(source, listener); return () => eventListeners.delete(source); }),
      acknowledge: vi.fn(async (id, input) => ({ ...fixture(id.startsWith("claude") ? "claude" : "codex"), id, acknowledgedAt: "2026-09-02T08:01:00.000Z", openedAt: input?.opened ? "2026-09-02T08:01:00.000Z" : undefined })),
    },
    interactions: {
      onPetClick: vi.fn((listener) => { clickListeners.push(listener); return () => undefined; }),
      onPetContextMenu: vi.fn(() => () => undefined),
    },
    integrations: { openAgentSession: vi.fn(async () => undefined) },
  };
  return { context, eventListeners, clickListeners };
}

describe("Agent Activity plugin", () => {
  it("reacts to Codex completion and opens the exact session on pet click", async () => {
    const test = context();
    const controller = await new AgentActivityController(test.context).activate();
    expect(test.eventListeners.has("codex")).toBe(true);
    await controller.receive(fixture());
    expect(test.context.pet.perform).toHaveBeenCalledWith("greet");
    expect(test.context.ui.notify).toHaveBeenCalledWith("Codex · Implement the connector", "All checks passed.");
    expect(controller.unreadCount()).toBe(1);
    expect(await test.clickListeners[0]()).toBe(true);
    expect(test.context.integrations.openAgentSession).toHaveBeenCalledWith(expect.objectContaining({ source: "codex", sessionId: "codex-session" }));
    expect(controller.unreadCount()).toBe(0);
  });

  it("handles Claude through the same event path", async () => {
    const test = context();
    const controller = await new AgentActivityController(test.context).activate();
    await controller.receive(fixture("claude"));
    expect(test.context.ui.notify).toHaveBeenCalledWith("Claude · Implement the connector", "All checks passed.");
  });
});

function workEvent(sessionId: string, turnId: string, type: AgentEvent["type"], order: number): AgentEvent {
  return { ...fixture(), id: `${sessionId}-${turnId}-${order}`, sessionId, type, severity: "info", summary: "检查可见状态图", receivedAt: `2026-09-10T08:00:${String(order).padStart(2, "0")}.000Z`, occurredAt: `2026-09-10T08:00:${String(order).padStart(2, "0")}.000Z`, metadata: { turnId } };
}
it("holds the digging loop during working and stops it on completion without auto-opening Codex", async () => {
  const test = context(); const loops: Array<string | null> = [];
  test.context.pet.getSnapshot = async () => ({ stateId: "sit", logicalStateId: "idle", availableActions: ["dig", "greet"] });
  test.context.pet.setActivityLoop = async action => { loops.push(action); return { accepted: true }; };
  const controller = await new AgentActivityController(test.context).activate();
  await controller.receive(workEvent("a", "one", "working", 1));
  await controller.receive(workEvent("a", "one", "working", 2));
  expect(loops).toEqual(["dig", "dig"]);
  expect(controller.unreadCount()).toBe(0); expect(controller.list()).toEqual([]);
  expect(test.context.pet.speak).toHaveBeenCalledWith(expect.stringContaining("检查可见状态图"), { durationMs: 0 });
  await controller.receive(workEvent("a", "one", "turn-completed", 3));
  expect(loops.at(-1)).toBeNull();
  expect(test.context.integrations.openAgentSession).not.toHaveBeenCalled();
});
it("tracks sessions and turns independently and ignores late events from a completed turn", async () => {
  const test = context(); const loops: Array<string | null> = [];
  test.context.pet.getSnapshot = async () => ({ stateId: "sit", logicalStateId: "idle", availableActions: ["working", "greet"] });
  test.context.pet.setActivityLoop = async action => { loops.push(action); return { accepted: true }; };
  const controller = await new AgentActivityController(test.context).activate();
  await controller.receive(workEvent("a", "one", "working", 1));
  await controller.receive(workEvent("b", "one", "working", 2));
  await controller.receive(workEvent("a", "one", "turn-completed", 3));
  expect(loops.at(-1)).toBe("working");
  await controller.receive(workEvent("b", "two", "working", 4));
  await controller.receive(workEvent("b", "one", "turn-completed", 5));
  expect(loops.at(-1)).toBe("working");
  await controller.receive(workEvent("b", "two", "session-ended", 6));
  expect(loops.at(-1)).toBeNull();
  await controller.receive(workEvent("b", "two", "working", 4));
  expect(loops.at(-1)).toBeNull();
});
it("pauses for attention and resumes only when a new working event arrives", async () => {
  const test = context(); const loops: Array<string | null> = [];
  test.context.pet.getSnapshot = async () => ({ stateId: "sit", logicalStateId: "idle", availableActions: ["digging", "attention"] });
  test.context.pet.setActivityLoop = async action => { loops.push(action); return { accepted: true }; };
  const controller = await new AgentActivityController(test.context).activate();
  await controller.receive(workEvent("a", "one", "working", 1));
  await controller.receive(workEvent("a", "one", "needs-attention", 2));
  expect(loops.at(-1)).toBeNull(); expect(test.context.pet.perform).toHaveBeenCalledWith("attention");
  await controller.receive(workEvent("a", "one", "working", 3)); expect(loops.at(-1)).toBe("digging");
  controller.dispose(); await Promise.resolve(); expect(loops.at(-1)).toBeNull();
});

it("acknowledges self-test reminders without trying to open a synthetic Codex session", async () => {
  const test = context(); const controller = await new AgentActivityController(test.context).activate();
  const event = { ...fixture(), metadata: { test: true } };
  await controller.receive(event); await controller.open(event.id);
  expect(test.context.integrations.openAgentSession).not.toHaveBeenCalled();
  expect(test.context.events.acknowledge).toHaveBeenCalledWith(event.id, { opened: true });
});

it("caps persistent working bubbles at a short 96-character public status", async () => {
  const test = context(); const controller = await new AgentActivityController(test.context).activate();
  await controller.receive({ ...workEvent("a", "short", "working", 1), summary: "x".repeat(200) });
  expect(test.context.pet.speak).toHaveBeenCalledWith(`Codex · ${"x".repeat(96)}`, { durationMs: 0 });
});

it("keeps high-frequency working events out of unread inbox counts and never evicts a real reminder", async () => {
  const test = context(); const controller = await new AgentActivityController(test.context).activate();
  const reminder = fixture(); await controller.receive(reminder);
  for (let index = 0; index < 200; index++) {
    const time = new Date(Date.UTC(2026, 8, 10, 8, 0, index)).toISOString();
    await controller.receive({ ...workEvent("working-session", "one-turn", "working", 1), id: `tool-${index}`, receivedAt: time, occurredAt: time });
  }
  expect(controller.unreadCount()).toBe(1);
  expect(controller.list().map(event => event.id)).toEqual([reminder.id]);
  expect(controller.reaction()?.id).toBe(reminder.id);
});
it("loads reminder history separately from recent lifecycle progress on activation", async () => {
  const test = context(); const loops: Array<string | null> = [];
  test.context.pet.getSnapshot = async () => ({ stateId: "sit", logicalStateId: "idle", availableActions: ["dig"] });
  test.context.pet.setActivityLoop = async action => { loops.push(action); return { accepted: true }; };
  test.context.events.list = async input => input?.notificationsOnly ? [fixture()] : [workEvent("active-session", "active-turn", "working", 1)];
  const controller = await new AgentActivityController(test.context).activate();
  expect(controller.list()).toEqual([fixture()]); expect(controller.unreadCount()).toBe(1);
  expect(loops).toEqual(["dig"]);
});

it("reasserts working on new progress after the host loop was manually stopped", async () => {
  const test = context(); let hostLoop: string | null = null;
  test.context.pet.getSnapshot = async () => ({ runtimeId: "runtime-one", stateId: "sit", logicalStateId: "idle", availableActions: ["working"] });
  test.context.pet.setActivityLoop = async action => { hostLoop = action; return { accepted: true }; };
  const controller = await new AgentActivityController(test.context).activate();
  await controller.receive(workEvent("a", "one", "working", 1)); expect(hostLoop).toBe("working");
  hostLoop = null;
  await controller.receive(workEvent("a", "one", "working", 2)); expect(hostLoop).toBe("working");
});
it("reasserts work for a replacement runtime but not for ordinary state changes", async () => {
  const test = context(); let runtimeId = "runtime-one"; let hostLoop: string | null = null;
  let listener: ((snapshot: Awaited<ReturnType<PetPluginContext["pet"]["getSnapshot"]>>) => void) | undefined;
  test.context.pet.getSnapshot = async () => ({ runtimeId, stateId: "sit", logicalStateId: "idle", availableActions: ["working"] });
  test.context.pet.onStateChanged = callback => { listener = callback; return () => { listener = undefined; }; };
  test.context.pet.setActivityLoop = async action => { hostLoop = action; return { accepted: true }; };
  const controller = await new AgentActivityController(test.context).activate();
  await controller.receive(workEvent("a", "one", "working", 1));
  hostLoop = null; runtimeId = "runtime-two";
  listener?.(await test.context.pet.getSnapshot());
  await vi.waitFor(() => expect(hostLoop).toBe("working"));
  hostLoop = null; listener?.(await test.context.pet.getSnapshot());
  await Promise.resolve(); await Promise.resolve();
  expect(hostLoop).toBeNull();
  controller.dispose(); expect(listener).toBeUndefined();
});

it("restores each session's latest lifecycle state even when another session dominates recent progress", async () => {
  const test = context(); let hostLoop: string | null = null;
  test.context.pet.getSnapshot = async () => ({ stateId: "sit", logicalStateId: "idle", availableActions: ["dig", "greet"] });
  test.context.pet.setActivityLoop = async action => { hostLoop = action; return { accepted: true }; };
  test.context.events.list = async input => input?.notificationsOnly ? [] : input?.latestPerSession
    ? [workEvent("b", "one", "working", 2), workEvent("a", "one", "working", 1)]
    : [workEvent("b", "one", "working", 2)];
  const controller = await new AgentActivityController(test.context).activate();
  await controller.receive(workEvent("b", "one", "turn-completed", 3));
  expect(hostLoop).toBe("dig");
  await controller.receive(workEvent("a", "one", "turn-completed", 4)); expect(hostLoop).toBeNull();
});
it("does not miss completion events while the initial history requests are in flight", async () => {
  const test = context(); let release!: () => void; let hostLoop: string | null = null;
  const pending = new Promise<void>(resolve => { release = resolve; });
  test.context.pet.getSnapshot = async () => ({ stateId: "sit", logicalStateId: "idle", availableActions: ["dig", "greet"] });
  test.context.pet.setActivityLoop = async action => { hostLoop = action; return { accepted: true }; };
  test.context.events.list = async input => { if (input?.notificationsOnly) return []; await pending; return [workEvent("a", "one", "working", 1)]; };
  const activating = new AgentActivityController(test.context).activate();
  const listener = test.eventListeners.get("codex");
  listener?.(workEvent("a", "one", "turn-completed", 2));
  release(); const controller = await activating;
  expect(controller.unreadCount()).toBe(1); expect(hostLoop).toBeNull();
});

it("uses the latest-per-session snapshot to break timestamp ties with notification history", async () => {
  const test = context(); let hostLoop: string | null = null;
  test.context.pet.getSnapshot = async () => ({ stateId: "sit", logicalStateId: "idle", availableActions: ["dig"] });
  test.context.pet.setActivityLoop = async action => { hostLoop = action; return { accepted: true }; };
  const working = workEvent("a", "one", "working", 1);
  const attention = { ...workEvent("a", "one", "needs-attention", 1), id: "earlier-attention-same-millisecond" };
  test.context.events.list = async input => input?.notificationsOnly ? [attention] : [working];
  const controller = await new AgentActivityController(test.context).activate();
  expect(hostLoop).toBe("dig"); expect(controller.unreadCount()).toBe(1);
});
