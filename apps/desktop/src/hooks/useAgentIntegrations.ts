import { useCallback, useEffect, useState } from "react";
import type { AgentEventSource } from "@petlord/schema";
import type { AgentIntegrationStatus } from "../desktopBridge";

export function useAgentIntegrations() {
  const [status, setStatus] = useState<AgentIntegrationStatus>();
  const [busySource, setBusySource] = useState<AgentEventSource>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!window.petLordDesktop) return;
    setStatus(await window.petLordDesktop.getAgentIntegrationStatus());
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function install(source: AgentEventSource) {
    if (!window.petLordDesktop) return;
    setBusySource(source);
    setMessage("");
    setError("");
    try {
      setStatus(await window.petLordDesktop.installAgentIntegration(source));
      setMessage(`${source === "claude" ? "Claude" : "Codex"} 已连接。后续任务通知会进入宠物收件箱。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "连接失败");
    } finally {
      setBusySource(undefined);
    }
  }

  return { status, busySource, message, error, install, refresh };
}

export type AgentIntegrationsController = ReturnType<typeof useAgentIntegrations>;
