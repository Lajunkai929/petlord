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
