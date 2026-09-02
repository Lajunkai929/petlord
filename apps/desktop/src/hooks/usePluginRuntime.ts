import { useEffect, useRef, useState } from "react";
import todoPlugin from "@petlord/plugin-todo";
import agentActivityPlugin from "@petlord/plugin-agent-activity";
import { PluginRuntime, type PluginContextFactory } from "@petlord/plugin-sdk";
import type { PluginDeclaration, PluginPermission } from "@petlord/schema";
import type { DesktopSettingsController } from "./useDesktopSettings";

export interface RuntimePluginStatus {
  declaration: PluginDeclaration;
  status: "pending-consent" | "active" | "disabled" | "missing" | "error";
  error?: string;
}

function permissionsGranted(declaration: PluginDeclaration, grants: Record<string, PluginPermission[]>) {
  const granted = new Set(grants[declaration.id] ?? []);
  return declaration.permissions.every((permission) => granted.has(permission));
}

export function usePluginRuntime(
  declarations: PluginDeclaration[],
  contextFactory: PluginContextFactory,
  settings: DesktopSettingsController,
) {
  const runtimeRef = useRef<PluginRuntime | null>(null);
  if (!runtimeRef.current) {
    runtimeRef.current = new PluginRuntime();
    runtimeRef.current.register(todoPlugin);
    runtimeRef.current.register(agentActivityPlugin);
  }
  const runtime = runtimeRef.current;
  const [statuses, setStatuses] = useState<RuntimePluginStatus[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => () => { void runtime.deactivateAll(); }, [runtime]);

  useEffect(() => {
    let cancelled = false;
    const synchronize = async () => {
      const declaredIds = new Set(declarations.map((declaration) => declaration.id));
      for (const activeId of runtime.activePluginIds()) {
        const declaration = declarations.find((candidate) => candidate.id === activeId);
        const enabled = settings.settings.pluginEnabled[activeId] !== false;
        if (!declaredIds.has(activeId) || !enabled || !declaration || !permissionsGranted(declaration, settings.settings.pluginGrants)) {
          await runtime.deactivate(activeId);
          if (!cancelled) setRevision((current) => current + 1);
        }
      }

      const next: RuntimePluginStatus[] = [];
      for (const declaration of declarations) {
        if (!runtime.registeredPlugin(declaration.id)) {
          next.push({ declaration, status: "missing", error: "本机没有安装这个插件。" });
          continue;
        }
        if (settings.settings.pluginEnabled[declaration.id] === false) {
          next.push({ declaration, status: "disabled" });
          continue;
        }
        if (!permissionsGranted(declaration, settings.settings.pluginGrants)) {
          next.push({ declaration, status: "pending-consent" });
          continue;
        }
        try {
          const wasActive = runtime.isActive(declaration.id);
          await runtime.activate(declaration, contextFactory, settings.settings.pluginGrants[declaration.id] ?? []);
          next.push({ declaration, status: "active" });
          if (!wasActive && !cancelled) setRevision((current) => current + 1);
        } catch (caught) {
          next.push({ declaration, status: "error", error: caught instanceof Error ? caught.message : "插件启动失败" });
        }
      }
      if (!cancelled) setStatuses(next);
    };
    void synchronize();
    return () => { cancelled = true; };
  }, [contextFactory, declarations, runtime, settings.settings.pluginEnabled, settings.settings.pluginGrants]);

  async function grant(declaration: PluginDeclaration) {
    await settings.update({
      pluginGrants: { ...settings.settings.pluginGrants, [declaration.id]: declaration.permissions },
      pluginEnabled: { ...settings.settings.pluginEnabled, [declaration.id]: true },
    });
  }

  async function setEnabled(id: string, enabled: boolean) {
    await settings.update({ pluginEnabled: { ...settings.settings.pluginEnabled, [id]: enabled } });
  }

  return {
    statuses,
    revision,
    pendingCount: statuses.filter((status) => status.status === "pending-consent").length,
    session: <Session,>(id: string) => runtime.session<Session>(id),
    isActive: (id: string) => runtime.isActive(id),
    grant,
    setEnabled,
  };
}

export type PluginRuntimeController = ReturnType<typeof usePluginRuntime>;
