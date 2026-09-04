import type { Root } from "react-dom/client";
import type { AgentEvent, AgentEventSource, PluginPermission, PublishedPackageSummary } from "@petlord/schema";
import type { RuntimeDisplaySize, RuntimeFrameRate, RuntimePixelGridSize, RuntimeRenderResolution } from "@petlord/runtime-react";

export interface DesktopRuntimeSettings {
  settingsVersion: 2;
  launchAtLogin: boolean;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  displaySize: RuntimeDisplaySize;
  frameRate: RuntimeFrameRate;
  renderResolution: RuntimeRenderResolution;
  pixelGridSize: RuntimePixelGridSize;
  pixelated: boolean;
  dock: "left" | "right" | "free";
  gazeTrackingArea: "near" | "wide" | "screen";
  muted: boolean;
  todoEnabled: boolean;
  pluginGrants: Record<string, PluginPermission[]>;
  pluginEnabled: Record<string, boolean>;
}

export interface InstalledPackageSummary {
  key: string;
  active: boolean;
  createdAt: string;
  id: string;
  name: string;
  characterName: string;
  stateCount: number;
  transitionCount: number;
}

export type DesktopPackageContents = string | ArrayBuffer | Uint8Array;
export interface PackageImportOptions {
  mode: "replace" | "new";
  targetKey?: string;
}

export interface PetLordDesktopBridge {
  close(): Promise<void>;
  showSettings(): Promise<void>;
  hideSettings(): Promise<void>;
  showPet(): Promise<void>;
  setIgnoreMouse(ignore: boolean): Promise<void>;
  movePetWindow(input: { x: number; y: number; pointerX?: number; pointerY?: number }): void;
  onGlobalPointerMoved(listener: (point: { clientX: number; clientY: number; screenX: number; screenY: number }) => void): () => void;
  getSettings(): Promise<DesktopRuntimeSettings>;
  updateSettings(patch: Partial<DesktopRuntimeSettings>): Promise<DesktopRuntimeSettings>;
  choosePackage(): Promise<DesktopPackageContents | null>;
  loadPackage(): Promise<DesktopPackageContents | null>;
  savePackage(contents: DesktopPackageContents, options?: PackageImportOptions): Promise<InstalledPackageSummary | undefined>;
  listPackages(): Promise<InstalledPackageSummary[]>;
  activatePackage(key: string): Promise<DesktopPackageContents>;
  removePackage(key: string): Promise<InstalledPackageSummary[]>;
  listSubscriptionPackages(serverUrl: string): Promise<PublishedPackageSummary[]>;
  downloadSubscriptionPackage(serverUrl: string, publicationId: string): Promise<DesktopPackageContents>;
  exportDiagnostics(): Promise<string | null>;
  reportError(input: { message: string; stack?: string; source?: string }): Promise<void>;
  listAgentEvents(input?: { source?: AgentEventSource; unreadOnly?: boolean; limit?: number }): Promise<AgentEvent[]>;
  acknowledgeAgentEvent(id: string, input?: { opened?: boolean }): Promise<AgentEvent | undefined>;
  simulateAgentEvent(source: AgentEventSource, payload: unknown): Promise<AgentEvent>;
  openAgentSession(input: Pick<AgentEvent, "source" | "sessionId" | "cwd">): Promise<void>;
  getAgentIntegrationStatus(): Promise<AgentIntegrationStatus>;
  installAgentIntegration(source: AgentEventSource): Promise<AgentIntegrationStatus>;
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
  pluginStorageGet<T>(pluginId: string, key: string): Promise<T | null>;
  pluginStorageSet<T>(pluginId: string, key: string, value: T): Promise<void>;
  pluginStorageRemove(pluginId: string, key: string): Promise<void>;
  onClickThroughChanged(listener: (enabled: boolean) => void): () => void;
  onSettingsChanged(listener: (settings: DesktopRuntimeSettings) => void): () => void;
  onPackageChanged(listener: (contents: DesktopPackageContents | null) => void): () => void;
  onOpenPackageImport(listener: () => void): () => void;
}

export interface AgentIntegrationStatus {
  socketPath: string;
  tokenPath: string;
  databasePath: string;
  connected: boolean;
  codex: { enabled: boolean; configPath: string };
  claude: { enabled: boolean; configPath: string };
}

declare global {
  interface Window {
    petLordDesktop?: PetLordDesktopBridge;
    petLordReactRoot?: Root;
  }
}
