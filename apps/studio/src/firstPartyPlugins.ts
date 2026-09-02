import type { PluginDeclaration } from "@petlord/schema";

export const todoPluginDeclaration: PluginDeclaration = {
  id: "petlord.todo",
  name: "To Do",
  version: "0.1.0",
  entry: "index.js",
  permissions: ["pet:read", "pet:control", "storage", "ui:panel", "notifications"],
};

export const agentActivityPluginDeclaration: PluginDeclaration = {
  id: "petlord.agent-activity",
  name: "Agent Activity",
  version: "0.1.0",
  entry: "index.js",
  permissions: [
    "pet:read",
    "pet:control",
    "ui:panel",
    "ui:context-menu",
    "notifications",
    "background:events",
    "integration:claude:events",
    "integration:claude:open-session",
    "integration:codex:events",
    "integration:codex:open-session",
  ],
};

export const defaultProjectPlugins = [todoPluginDeclaration, agentActivityPluginDeclaration];
