import { describe, expect, it, vi } from "vitest";
import todoPlugin, { type TodoController } from "@petlord/plugin-todo";
import { PluginRuntime, type PetPluginContext } from "@petlord/plugin-sdk";
import { PetRuntimeCore } from "@petlord/runtime-core";
import type { PetPackageManifest, PluginDeclaration } from "@petlord/schema";

const declaration: PluginDeclaration = {
  id: "petlord.todo",
  name: "To Do",
  version: "0.1.0",
  entry: "index.js",
  permissions: ["pet:read", "pet:control", "storage", "ui:panel", "notifications"],
};

const manifest: PetPackageManifest = {
  manifestVersion: 1,
  id: "todo-flow",
  name: "Todo flow",
  characterName: "Lottery",
  initialStateId: "sit",
  states: [
    { id: "sit", logicalStateId: "idle", label: "坐着", imageUri: "/sit.png", origin: "reference" },
    { id: "greet", logicalStateId: "greet", label: "打招呼", imageUri: "/greet.png", origin: "transition-tail" },
    { id: "play", logicalStateId: "play", label: "开心", imageUri: "/play.png", origin: "transition-tail" },
  ],
  transitions: [
    { id: "to-greet", fromStateId: "sit", toStateId: "greet", videoUri: "/greet.webm", tailFrameUri: "/greet.png", durationMs: 800, endFrameSource: "video-frame", transparentVideo: true, authorityBridge: { mode: "crossfade", durationMs: 300 }, triggers: [] },
    { id: "to-play", fromStateId: "greet", toStateId: "play", videoUri: "/play.webm", tailFrameUri: "/play.png", durationMs: 800, endFrameSource: "video-frame", transparentVideo: true, authorityBridge: { mode: "crossfade", durationMs: 300 }, triggers: [] },
  ],
  logicalStates: [
    { id: "idle", label: "坐着", variantIds: ["sit"], idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true } },
    { id: "greet", label: "打招呼", variantIds: ["greet"], idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true } },
    { id: "play", label: "开心", variantIds: ["play"], idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true } },
  ],
  semanticActions: { greet: "greet", play: "play" },
  plugins: [declaration],
};

function createIntegratedContext() {
  const storage = new Map<string, unknown>();
  const actions: string[] = [];
  let now = 0;
  const petRuntime = new PetRuntimeCore(manifest, { now: () => now });
  const context: PetPluginContext = {
    pet: {
      async getSnapshot() {
        const state = petRuntime.currentState();
        return { stateId: petRuntime.getSnapshot().currentStateId, logicalStateId: state?.logicalStateId ?? "", availableActions: Object.keys(manifest.semanticActions) };
      },
      async perform(action) {
        actions.push(action);
        const result = petRuntime.performSemanticAction(action, now);
        while (petRuntime.getSnapshot().activeTransitionId) {
          const active = petRuntime.activeTransition();
          if (petRuntime.getSnapshot().phase === "video") {
            now += active?.durationMs ?? 1;
            petRuntime.finishVideo(now);
          } else {
            now += active?.authorityBridge.durationMs ?? 1;
            petRuntime.advanceBridge(now);
          }
        }
        return result;
      },
      async speak() {},
      onStateChanged() { return () => undefined; },
    },
    storage: {
      async get<T>(key: string) { return (storage.get(key) as T | undefined) ?? null; },
      async set<T>(key: string, value: T) { storage.set(key, value); },
      async remove(key: string) { storage.delete(key); },
    },
    ui: { openPanel: vi.fn(), closePanel: vi.fn(), notify: vi.fn() },
    events: {
      async list() { return []; },
      subscribe() { return () => undefined; },
      async acknowledge() { return undefined; },
    },
    interactions: {
      onPetClick() { return () => undefined; },
      onPetContextMenu() { return () => undefined; },
    },
    integrations: { async openAgentSession() {} },
  };
  return { context, storage, actions, getStateId: () => petRuntime.getSnapshot().currentStateId };
}

describe("desktop Todo plugin delivery flow", () => {
  it("requires all declared permissions before activation", async () => {
    const runtime = new PluginRuntime();
    runtime.register(todoPlugin);
    const { context } = createIntegratedContext();
    await expect(runtime.activate(declaration, () => context, declaration.permissions.filter((permission) => permission !== "pet:control")))
      .rejects.toThrow("没有获得 pet:control 权限");
    expect(runtime.isActive(declaration.id)).toBe(false);
  });

  it("activates, persists, drives semantic pet transitions, reloads, and removes tasks", async () => {
    const runtime = new PluginRuntime();
    runtime.register(todoPlugin);
    const integrated = createIntegratedContext();
    await runtime.activate(declaration, () => integrated.context, declaration.permissions);
    const controller = runtime.session<TodoController>(declaration.id);
    expect(controller).toBeDefined();
    const item = await controller!.add("验证发布包");
    expect(integrated.actions).toEqual(["greet"]);
    expect(integrated.getStateId()).toBe("greet");
    await controller!.complete(item.id);
    expect(integrated.actions).toEqual(["greet", "play"]);
    expect(integrated.getStateId()).toBe("play");
    expect(integrated.storage.get("items")).toEqual([expect.objectContaining({ title: "验证发布包", completed: true })]);

    await runtime.deactivate(declaration.id);
    await runtime.activate(declaration, () => integrated.context, declaration.permissions);
    const restored = runtime.session<TodoController>(declaration.id)!;
    expect(restored.list()).toEqual([expect.objectContaining({ id: item.id, completed: true })]);
    await restored.remove(item.id);
    expect(restored.list()).toEqual([]);
    expect(integrated.storage.get("items")).toEqual([]);
  });
});
