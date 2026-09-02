import { describe, expect, it } from "vitest";
import {
  installClaudeHooks,
  installCodexNotify,
  normalizeClaudeHookPayload,
  normalizeCodexNotifyPayload,
  uninstallClaudeHooks,
  uninstallCodexNotify,
} from "./index";

const now = "2026-09-02T08:00:00.000Z";

describe("agent event normalizers", () => {
  it("maps the official Codex notify payload without losing the session target", () => {
    const result = normalizeCodexNotifyPayload({
      type: "agent-turn-complete",
      "thread-id": "thread-123",
      "turn-id": "turn-456",
      cwd: "/Users/test/projects/demo",
      "input-messages": ["Fix the event bridge"],
      "last-assistant-message": "Implemented and tested.",
    }, now);
    expect(result).toMatchObject({
      source: "codex",
      type: "turn-completed",
      severity: "success",
      sessionId: "thread-123",
      title: "Fix the event bridge",
      summary: "Implemented and tested.",
      cwd: "/Users/test/projects/demo",
    });
  });

  it("maps Claude permission and stop hooks", () => {
    expect(normalizeClaudeHookPayload({
      session_id: "claude-session",
      hook_event_name: "Notification",
      notification_type: "permission_prompt",
      cwd: "/tmp/demo",
      message: "Approval required",
    }, now).type).toBe("needs-attention");
    expect(normalizeClaudeHookPayload({
      session_id: "claude-session",
      hook_event_name: "Stop",
      cwd: "/tmp/demo",
      last_assistant_message: "Done",
    }, now).type).toBe("turn-completed");
  });
});

describe("managed agent configuration", () => {
  it("chains and restores an existing Codex notifier", () => {
    const original = 'model = "gpt-5"\nnotify = ["existing-notifier", "turn-ended"]\n';
    const managed = ["node", "/app/agent-notify.cjs", "codex"];
    const installed = installCodexNotify(original, managed);
    expect(installed.previousNotify).toEqual(["existing-notifier", "turn-ended"]);
    expect(installed.text).toContain(JSON.stringify(managed));
    const restored = uninstallCodexNotify(installed.text, managed, installed.previousNotify);
    expect(restored.text).toBe(original);
  });

  it("merges and removes only PetLord-owned Claude Hooks", () => {
    const original = { hooks: { Stop: [{ hooks: [{ type: "command", command: "existing" }] }] }, theme: "dark" };
    const installed = installClaudeHooks(original, "petlord-agent-notify claude");
    expect((installed.hooks as Record<string, unknown[]>).Stop).toHaveLength(2);
    expect(uninstallClaudeHooks(installed)).toEqual(original);
  });
});
