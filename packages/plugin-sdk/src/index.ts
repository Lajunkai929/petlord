import {
  agentEventSourceSchema,
  pluginDeclarationSchema,
  type AgentEvent,
  type AgentEventSource,
  type PluginDeclaration,
  type PluginPermission,
} from "@petlord/schema";
import { z } from "zod";

export const pluginManifestSchema = pluginDeclarationSchema.extend({
  description: z.string().default(""),
  panel: z
    .object({
      title: z.string().min(1),
      width: z.number().int().min(280).max(720).default(360),
      height: z.number().int().min(240).max(900).default(520),
    })
    .optional(),
});

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export interface PetSnapshot {
  /** Changes when the host creates a new runtime instance (for example, a pet package switch). */
  runtimeId?: string;
  stateId: string;
  logicalStateId: string;
  availableActions: string[];
}

export interface PetControlApi {
  getSnapshot(): Promise<PetSnapshot>;
  perform(action: string): Promise<{ accepted: boolean; reason?: string }>;
  setActivityLoop?(action: string | null): Promise<{ accepted: boolean; reason?: string }>;
  /** durationMs: 0 keeps a status visible until the next message (or an empty message clears it). */
  speak(message: string, options?: { durationMs?: number }): Promise<void>;
  onStateChanged(listener: (snapshot: PetSnapshot) => void): () => void;
}

export interface PluginStorageApi {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface PluginUiApi {
  openPanel(): Promise<void>;
  closePanel(): Promise<void>;
  notify(title: string, body: string): Promise<void>;
}

export interface PluginEventApi {
  list(input?: { source?: AgentEventSource; unreadOnly?: boolean; notificationsOnly?: boolean; latestPerSession?: boolean; limit?: number }): Promise<AgentEvent[]>;
  subscribe(source: AgentEventSource, listener: (event: AgentEvent) => void): () => void;
  acknowledge(id: string, input?: { opened?: boolean }): Promise<AgentEvent | undefined>;
}

export interface PluginInteractionApi {
  onPetClick(listener: () => boolean | Promise<boolean>): () => void;
  onPetContextMenu(listener: () => boolean | Promise<boolean>): () => void;
}

export interface PluginIntegrationApi {
  openAgentSession(input: Pick<AgentEvent, "source" | "sessionId" | "cwd">): Promise<void>;
}

export interface PetPluginContext {
  pet: PetControlApi;
  storage: PluginStorageApi;
  ui: PluginUiApi;
  events: PluginEventApi;
  interactions: PluginInteractionApi;
  integrations: PluginIntegrationApi;
}

export interface PetPlugin<Session = unknown> {
  manifest: PluginManifest;
  activate(context: PetPluginContext): Session | Promise<Session>;
  deactivate?(session: Session): void | Promise<void>;
}

export function definePlugin<Session>(plugin: PetPlugin<Session>): PetPlugin<Session> {
  pluginManifestSchema.parse(plugin.manifest);
  return plugin;
}

export function toPackageDeclaration(manifest: PluginManifest): PluginDeclaration {
  return pluginDeclarationSchema.parse(manifest);
}

export class PluginPermissionError extends Error {
  constructor(pluginId: string, permission: PluginPermission) {
    super(`插件 ${pluginId} 没有获得 ${permission} 权限。`);
    this.name = "PluginPermissionError";
  }
}

function requirePermission(pluginId: string, granted: ReadonlySet<PluginPermission>, permission: PluginPermission) {
  if (!granted.has(permission)) throw new PluginPermissionError(pluginId, permission);
}

function eventPermission(source: AgentEventSource): PluginPermission {
  return source === "claude" ? "integration:claude:events" : "integration:codex:events";
}

function openSessionPermission(source: AgentEventSource): PluginPermission {
  return source === "claude" ? "integration:claude:open-session" : "integration:codex:open-session";
}

export function createPermissionedPluginContext(
  pluginId: string,
  base: PetPluginContext,
  permissions: PluginPermission[],
): PetPluginContext {
  const granted = new Set(permissions);
  return {
    pet: {
      async getSnapshot() {
        requirePermission(pluginId, granted, "pet:read");
        return base.pet.getSnapshot();
      },
      async perform(action) {
        requirePermission(pluginId, granted, "pet:control");
        return base.pet.perform(action);
      },
      async setActivityLoop(action) {
        requirePermission(pluginId, granted, "pet:control");
        return base.pet.setActivityLoop?.(action) ?? { accepted: false, reason: "此运行时尚不支持持续工作动作。" };
      },
      async speak(message, options) {
        requirePermission(pluginId, granted, "pet:control");
        return base.pet.speak(message, options);
      },
      onStateChanged(listener) {
        requirePermission(pluginId, granted, "pet:read");
        return base.pet.onStateChanged(listener);
      },
    },
    storage: {
      async get<T>(key: string) {
        requirePermission(pluginId, granted, "storage");
        return base.storage.get<T>(key);
      },
      async set<T>(key: string, value: T) {
        requirePermission(pluginId, granted, "storage");
        return base.storage.set(key, value);
      },
      async remove(key) {
        requirePermission(pluginId, granted, "storage");
        return base.storage.remove(key);
      },
    },
    ui: {
      async openPanel() {
        requirePermission(pluginId, granted, "ui:panel");
        return base.ui.openPanel();
      },
      async closePanel() {
        requirePermission(pluginId, granted, "ui:panel");
        return base.ui.closePanel();
      },
      async notify(title, body) {
        requirePermission(pluginId, granted, "notifications");
        return base.ui.notify(title, body);
      },
    },
    events: {
      async list(input) {
        requirePermission(pluginId, granted, "background:events");
        if (input?.source) requirePermission(pluginId, granted, eventPermission(input.source));
        const events = await base.events.list(input);
        return events.filter((event) => granted.has(eventPermission(event.source)));
      },
      subscribe(source, listener) {
        agentEventSourceSchema.parse(source);
        requirePermission(pluginId, granted, "background:events");
        requirePermission(pluginId, granted, eventPermission(source));
        return base.events.subscribe(source, listener);
      },
      async acknowledge(id, input) {
        requirePermission(pluginId, granted, "background:events");
        return base.events.acknowledge(id, input);
      },
    },
    interactions: {
      onPetClick(listener) {
        requirePermission(pluginId, granted, "pet:control");
        return base.interactions.onPetClick(listener);
      },
      onPetContextMenu(listener) {
        requirePermission(pluginId, granted, "ui:context-menu");
        return base.interactions.onPetContextMenu(listener);
      },
    },
    integrations: {
      async openAgentSession(input) {
        agentEventSourceSchema.parse(input.source);
        requirePermission(pluginId, granted, openSessionPermission(input.source));
        return base.integrations.openAgentSession(input);
      },
    },
  };
}

export type PluginContextFactory = (pluginId: string) => PetPluginContext;

interface ActivePlugin {
  plugin: PetPlugin<unknown>;
  session: unknown;
}

export class PluginRuntime {
  private readonly registry = new Map<string, PetPlugin<unknown>>();
  private readonly active = new Map<string, ActivePlugin>();

  register<Session>(plugin: PetPlugin<Session>) {
    const parsed = pluginManifestSchema.parse(plugin.manifest);
    if (this.registry.has(parsed.id)) throw new Error(`插件 ${parsed.id} 已经注册。`);
    this.registry.set(parsed.id, plugin as PetPlugin<unknown>);
  }

  registeredPlugin(id: string) {
    return this.registry.get(id);
  }

  isActive(id: string) {
    return this.active.has(id);
  }

  activePluginIds() {
    return [...this.active.keys()];
  }

  session<Session>(id: string) {
    return this.active.get(id)?.session as Session | undefined;
  }

  async activate(declarationInput: PluginDeclaration, contextFactory: PluginContextFactory, grantedPermissions: PluginPermission[]) {
    const declaration = pluginDeclarationSchema.parse(declarationInput);
    const plugin = this.registry.get(declaration.id);
    if (!plugin) throw new Error(`宠物包声明了未安装的插件：${declaration.name}（${declaration.id}）。`);
    if (plugin.manifest.version !== declaration.version || plugin.manifest.entry !== declaration.entry) {
      throw new Error(`插件 ${declaration.name} 的版本或入口与宠物包不兼容。`);
    }
    const requested = new Set(declaration.permissions);
    if (plugin.manifest.permissions.some((permission) => !requested.has(permission))) {
      throw new Error(`插件 ${declaration.name} 的本地代码请求了宠物包未声明的权限。`);
    }
    const localPermissions = new Set(plugin.manifest.permissions);
    if (declaration.permissions.some((permission) => !localPermissions.has(permission))) {
      throw new Error(`宠物包为插件 ${declaration.name} 声明了本地插件清单中不存在的权限。`);
    }
    const granted = new Set(grantedPermissions);
    const missing = declaration.permissions.filter((permission) => !granted.has(permission));
    if (missing.length > 0) throw new PluginPermissionError(declaration.id, missing[0]);
    if (this.active.has(declaration.id)) return this.active.get(declaration.id)?.session;
    const context = createPermissionedPluginContext(declaration.id, contextFactory(declaration.id), plugin.manifest.permissions);
    const session = await plugin.activate(context);
    this.active.set(declaration.id, { plugin, session });
    return session;
  }

  async deactivate(id: string) {
    const active = this.active.get(id);
    if (!active) return;
    await active.plugin.deactivate?.(active.session);
    this.active.delete(id);
  }

  async deactivateAll() {
    for (const id of [...this.active.keys()]) await this.deactivate(id);
  }
}
