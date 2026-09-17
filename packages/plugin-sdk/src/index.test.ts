import { describe, expect, it, vi } from "vitest";
import type { PetPluginContext, PetSnapshot } from "./index";
import { createPermissionedPluginContext, definePlugin, PluginPermissionError, PluginRuntime } from "./index";

function context(): PetPluginContext {
  return {
    pet: {
      async getSnapshot(): Promise<PetSnapshot> { return { stateId: "sit", logicalStateId: "idle", availableActions: [] }; },
      async perform() { return { accepted: true }; },
      async speak() {},
      onStateChanged() { return () => undefined; },
    },
    storage: { async get() { return null; }, async set() {}, async remove() {} },
    ui: { async openPanel() {}, async closePanel() {}, async notify() {} },
  };
}

describe("plugin permission boundary", () => {
  it("blocks undeclared capabilities before they reach the host", async () => {
    const base = context();
    const perform = vi.spyOn(base.pet, "perform");
    const restricted = createPermissionedPluginContext("demo", base, ["pet:read"]);
    await expect(restricted.pet.getSnapshot()).resolves.toMatchObject({ stateId: "sit" });
    await expect(restricted.pet.perform("play")).rejects.toBeInstanceOf(PluginPermissionError);
    expect(perform).not.toHaveBeenCalled();
  });

  it("discovers a declared plugin, requires consent, and runs its lifecycle once", async () => {
    const deactivate = vi.fn();
    const plugin = definePlugin({
      manifest: { id: "demo", name: "Demo", version: "1.0.0", entry: "index.js", permissions: ["pet:read"] },
      async activate(host) { return host.pet.getSnapshot(); },
      deactivate,
    });
    const runtime = new PluginRuntime();
    runtime.register(plugin);
    const declaration = { id: "demo", name: "Demo", version: "1.0.0", entry: "index.js", permissions: ["pet:read"] as const };
    await expect(runtime.activate(declaration, context, [])).rejects.toBeInstanceOf(PluginPermissionError);
    await expect(runtime.activate(declaration, context, ["pet:read"])).resolves.toMatchObject({ stateId: "sit" });
    expect(runtime.isActive("demo")).toBe(true);
    await runtime.activate(declaration, context, ["pet:read"]);
    await runtime.deactivate("demo");
    expect(deactivate).toHaveBeenCalledOnce();
  });
});

it("enforces pet control permission for persistent activity loops", async () => {
  const base = context(); const actions: Array<string | null> = [];
  base.pet.setActivityLoop = async action => { actions.push(action); return { accepted: true }; };
  const restricted = createPermissionedPluginContext("demo", base, ["pet:read"]);
  await expect(restricted.pet.setActivityLoop?.("dig")).rejects.toBeInstanceOf(PluginPermissionError);
  expect(actions).toEqual([]);
  const allowed = createPermissionedPluginContext("demo", base, ["pet:control"]);
  await allowed.pet.setActivityLoop?.("dig"); await allowed.pet.setActivityLoop?.(null);
  expect(actions).toEqual(["dig", null]);
});
