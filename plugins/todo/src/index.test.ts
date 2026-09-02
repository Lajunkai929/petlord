import { describe, expect, it, vi } from "vitest";
import type { PetPluginContext } from "@petlord/plugin-sdk";
import { TodoController } from "./index";

function createContext() {
  const values = new Map<string, unknown>();
  const perform = vi.fn(async () => ({ accepted: true }));
  const context: PetPluginContext = {
    pet: {
      async getSnapshot() {
        return { stateId: "sit-a", logicalStateId: "sit", availableActions: ["greet", "play"] };
      },
      perform,
      async speak() {},
      onStateChanged() {
        return () => undefined;
      },
    },
    storage: {
      async get<T>(key: string) {
        return (values.get(key) as T | undefined) ?? null;
      },
      async set<T>(key: string, value: T) {
        values.set(key, value);
      },
      async remove(key: string) {
        values.delete(key);
      },
    },
    ui: {
      async openPanel() {},
      async closePanel() {},
      async notify() {},
    },
  };
  return { context, perform, values };
}

describe("To Do plugin", () => {
  it("persists tasks and requests semantic pet actions", async () => {
    const { context, perform, values } = createContext();
    const controller = new TodoController(context);
    await controller.load();
    const item = await controller.add("整理状态图");
    expect(perform).toHaveBeenLastCalledWith("greet");
    expect(values.get("items")).toEqual([expect.objectContaining({ title: "整理状态图" })]);

    await controller.complete(item.id);
    expect(perform).toHaveBeenLastCalledWith("play");
    expect(controller.list()[0].completed).toBe(true);
  });
});
