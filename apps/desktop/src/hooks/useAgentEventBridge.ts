import { useEffect, useRef } from "react";
import type { AgentEvent, AgentEventSource } from "@petlord/schema";
import type { PluginEventApi, PluginIntegrationApi } from "@petlord/plugin-sdk";

interface AgentEventBridge {
  events: PluginEventApi;
  integrations: PluginIntegrationApi;
  simulate(source: AgentEventSource, payload: unknown): Promise<AgentEvent>;
  connect(): void;
  dispose(): void;
}

function createBridge(): AgentEventBridge {
  const memory = new Map<string, AgentEvent>();
  const listeners = new Map<AgentEventSource, Set<(event: AgentEvent) => void>>([
    ["claude", new Set()],
    ["codex", new Set()],
  ]);
  const emit = (event: AgentEvent) => {
    memory.set(event.id, event);
    for (const listener of listeners.get(event.source) ?? []) listener(event);
  };
  let unsubscribeDesktop: (() => void) | undefined;

  return {
    events: {
      async list(input) {
        const stored = window.petLordDesktop
          ? await window.petLordDesktop.listAgentEvents(input)
          : [...memory.values()]
              .filter((event) => !input?.source || event.source === input.source)
              .filter((event) => !input?.unreadOnly || !event.acknowledgedAt)
              .sort((left, right) => right.receivedAt.localeCompare(left.receivedAt))
              .slice(0, input?.limit ?? 100);
        for (const event of stored) memory.set(event.id, event);
        return stored;
      },
      subscribe(source, listener) {
        listeners.get(source)?.add(listener);
        return () => listeners.get(source)?.delete(listener);
      },
      async acknowledge(id, input) {
        if (window.petLordDesktop) return window.petLordDesktop.acknowledgeAgentEvent(id, input);
        const current = memory.get(id);
        if (!current) return undefined;
        const timestamp = new Date().toISOString();
        const updated = { ...current, acknowledgedAt: current.acknowledgedAt ?? timestamp, openedAt: input?.opened ? current.openedAt ?? timestamp : current.openedAt };
        memory.set(id, updated);
        return updated;
      },
    },
    integrations: {
      async openAgentSession(input) {
        if (window.petLordDesktop) return window.petLordDesktop.openAgentSession(input);
      },
    },
    async simulate(source, payload) {
      if (window.petLordDesktop) return window.petLordDesktop.simulateAgentEvent(source, payload);
      const now = new Date().toISOString();
      const event: AgentEvent = {
        schemaVersion: 1,
        id: `${source}-${crypto.randomUUID()}`,
        source,
        type: "turn-completed",
        severity: "success",
        sessionId: `${source}-preview-session`,
        occurredAt: now,
        receivedAt: now,
        dedupeKey: `${source}:preview:${crypto.randomUUID()}`,
        title: `${source === "claude" ? "Claude" : "Codex"} 测试任务`,
        summary: "测试事件已完成。",
        metadata: {},
      };
      emit(event);
      return event;
    },
    connect() {
      if (!unsubscribeDesktop) unsubscribeDesktop = window.petLordDesktop?.onAgentEvent(emit);
    },
    dispose() {
      unsubscribeDesktop?.();
      unsubscribeDesktop = undefined;
    },
  };
}

export function useAgentEventBridge() {
  const bridgeRef = useRef<AgentEventBridge | null>(null);
  if (!bridgeRef.current) bridgeRef.current = createBridge();
  useEffect(() => {
    bridgeRef.current?.connect();
    return () => bridgeRef.current?.dispose();
  }, []);
  return bridgeRef.current;
}
