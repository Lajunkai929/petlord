import { definePlugin, type PetPluginContext } from "@petlord/plugin-sdk";

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  dueAt?: string;
}

const STORAGE_KEY = "items";

export class TodoController {
  private items: TodoItem[] = [];

  constructor(private readonly context: PetPluginContext) {}

  async load(): Promise<TodoItem[]> {
    this.items = (await this.context.storage.get<TodoItem[]>(STORAGE_KEY)) ?? [];
    return this.list();
  }

  list(): TodoItem[] {
    return this.items.map((item) => ({ ...item }));
  }

  async add(title: string, dueAt?: string): Promise<TodoItem> {
    const item: TodoItem = {
      id: crypto.randomUUID(),
      title: title.trim(),
      completed: false,
      dueAt,
    };
    if (!item.title) throw new Error("待办名称不能为空");
    this.items = [item, ...this.items];
    await this.persist();
    await this.context.pet.perform("greet");
    return { ...item };
  }

  async complete(id: string): Promise<void> {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item || item.completed) return;
    item.completed = true;
    await this.persist();
    const result = await this.context.pet.perform("play");
    if (!result.accepted) await this.context.pet.speak("完成一项，做得不错。", { durationMs: 2600 });
  }

  async remove(id: string): Promise<void> {
    this.items = this.items.filter((item) => item.id !== id);
    await this.persist();
  }

  private async persist(): Promise<void> {
    await this.context.storage.set(STORAGE_KEY, this.items);
  }
}

export default definePlugin<TodoController>({
  manifest: {
    id: "petlord.todo",
    name: "To Do",
    version: "0.1.0",
    entry: "index.js",
    description: "用宠物动作承接待办提醒与完成反馈。",
    permissions: ["pet:read", "pet:control", "storage", "ui:panel", "notifications"],
    panel: { title: "今天要做", width: 360, height: 520 },
  },
  async activate(context) {
    const controller = new TodoController(context);
    await controller.load();
    return controller;
  },
});
