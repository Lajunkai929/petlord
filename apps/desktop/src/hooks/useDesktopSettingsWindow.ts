import { useEffect, useMemo, useState } from "react";
import type { PluginDeclaration, PluginPermission } from "@petlord/schema";
import { useAgentIntegrations } from "./useAgentIntegrations";
import { useDesktopPetPackage } from "./useDesktopPetPackage";
import { materializePackageManifest } from "./useDesktopPetPackage";
import { useDesktopSettings } from "./useDesktopSettings";

export type SettingsSection = "pets" | "behavior" | "plugins";

function allPermissionsGranted(declaration: PluginDeclaration, grants: Record<string, PluginPermission[]>) {
  const granted = new Set(grants[declaration.id] ?? []);
  return declaration.permissions.every((permission) => granted.has(permission));
}

export function useDesktopSettingsWindow() {
  const petPackages = useDesktopPetPackage();
  const settings = useDesktopSettings();
  const agentIntegrations = useAgentIntegrations();
  const [section, setSection] = useState<SettingsSection>("pets");
  const [importTargetKey, setImportTargetKey] = useState("new");
  const plugins = useMemo(() => petPackages.manifest?.plugins ?? [], [petPackages.manifest?.plugins]);
  const pendingManifest = useMemo(() => petPackages.pendingImport ? materializePackageManifest(petPackages.pendingImport.bundle) : undefined, [petPackages.pendingImport]);

  useEffect(() => {
    const pending = petPackages.pendingImport;
    if (!pending) return;
    setImportTargetKey(pending.suggestedTargetKey ?? "new");
  }, [petPackages.pendingImport]);

  async function grantPlugin(declaration: PluginDeclaration) {
    await settings.update({
      pluginGrants: { ...settings.settings.pluginGrants, [declaration.id]: declaration.permissions },
      pluginEnabled: { ...settings.settings.pluginEnabled, [declaration.id]: true },
    });
  }

  async function setPluginEnabled(id: string, enabled: boolean) {
    await settings.update({ pluginEnabled: { ...settings.settings.pluginEnabled, [id]: enabled } });
  }

  function pluginStatus(declaration: PluginDeclaration) {
    if (!allPermissionsGranted(declaration, settings.settings.pluginGrants)) return "permission" as const;
    return settings.settings.pluginEnabled[declaration.id] === false ? "disabled" as const : "active" as const;
  }

  async function confirmImport() {
    await petPackages.confirmImport(importTargetKey === "new"
      ? { mode: "new" }
      : { mode: "replace", targetKey: importTargetKey });
  }

  return {
    petPackages,
    settings,
    agentIntegrations,
    section,
    setSection,
    plugins,
    pendingManifest,
    pluginStatus,
    grantPlugin,
    setPluginEnabled,
    importTargetKey,
    setImportTargetKey,
    confirmImport,
    close: () => window.petLordDesktop?.hideSettings(),
    showPet: () => window.petLordDesktop?.showPet(),
  };
}

export type DesktopSettingsWindowController = ReturnType<typeof useDesktopSettingsWindow>;
