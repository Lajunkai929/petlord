import { useCallback, useEffect, useState } from "react";
import { agentEventSchema, type AgentEvent, type AgentEventSource } from "@petlord/schema";

async function responseJson(response: Response) {
  const text = await response.text();
  const body = text ? JSON.parse(text) as unknown : undefined;
  if (!response.ok) throw new Error((body as { error?: { message?: string } })?.error?.message ?? `请求失败（${response.status}）`);
  return body;
}

function simulationPayload(source: AgentEventSource) {
  const sessionId = `${source}-studio-${crypto.randomUUID()}`;
  return source === "codex" ? {
    type: "agent-turn-complete",
    "thread-id": sessionId,
    "turn-id": crypto.randomUUID(),
    cwd: "/tmp/petlord-studio",
    "input-messages": ["验证 Codex 宠物通知"],
    "last-assistant-message": "Codex 测试任务已完成。",
  } : {
    hook_event_name: "Stop",
    session_id: sessionId,
    cwd: "/tmp/petlord-studio",
    title: "验证 Claude 宠物通知",
    last_assistant_message: "Claude 测试任务已完成。",
  };
}

export function useAgentPluginStudio() {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [sending, setSending] = useState<AgentEventSource>();
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/agent-events?limit=12");
      const body = await responseJson(response);
      setEvents(agentEventSchema.array().parse(body));
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法读取 Agent 事件");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function simulate(source: AgentEventSource) {
    setSending(source);
    setError("");
    try {
      const response = await fetch("/api/agent-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, payload: simulationPayload(source) }),
      });
      const event = agentEventSchema.parse(await responseJson(response));
      setEvents((current) => [event, ...current.filter((candidate) => candidate.id !== event.id)].slice(0, 12));
      return event;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "测试事件发送失败");
      return undefined;
    } finally {
      setSending(undefined);
    }
  }

  async function acknowledge(id: string) {
    try {
      const response = await fetch(`/api/agent-events/${encodeURIComponent(id)}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opened: false }),
      });
      const updated = agentEventSchema.parse(await responseJson(response));
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "事件更新失败");
    }
  }

  return { events, sending, error, simulate, acknowledge, refresh };
}

export type AgentPluginStudioController = ReturnType<typeof useAgentPluginStudio>;
