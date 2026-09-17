import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { AgentEvent } from "@petlord/schema";
const require = createRequire(import.meta.url);
const { normalizeCodexEvent, extractVisibleHeading, createCodexNotificationIntegration } = require("../electron/codex-notifications.cjs");
const directories: string[] = [];
afterEach(async () => { for (const dir of directories.splice(0)) await rm(dir, { recursive: true, force: true }); });
const payload = { session_id: "session-a", turn_id: "turn-a", cwd: "/work/pet" };
it("normalizes Codex lifecycle states and deduplicates legacy completion against Stop", () => {
  for (const [hook, type] of [["UserPromptSubmit", "working"], ["PreToolUse", "working"], ["PermissionRequest", "needs-attention"], ["Stop", "turn-completed"], ["Interrupt", "session-ended"]]) {
    expect(normalizeCodexEvent({ ...payload, hook_event_name: hook }).type).toBe(type);
  }
  const complete = normalizeCodexEvent({ ...payload, hook_event_name: "Stop" });
  const legacy = normalizeCodexEvent({ "thread-id": payload.session_id, "turn-id": payload.turn_id, type: "agent-turn-complete" });
  expect(complete.dedupeKey).toBe(legacy.dedupeKey);
  expect(() => normalizeCodexEvent({ ...payload, hook_event_name: "Unsupported" })).toThrow();
  const tool = normalizeCodexEvent({ ...payload, hook_event_name: "PreToolUse", tool_name: "exec_command", tool_input: { cmd: "SECRET_COMMAND" } });
  expect(tool.summary).toContain("命令"); expect(JSON.stringify(tool)).not.toContain("SECRET_COMMAND");
});
it("extracts only bounded visible commentary or explicitly public headings and never analysis", () => {
  const lines = [
    { type: "response_item", payload: { type: "message", role: "assistant", channel: "commentary", content: [{ type: "output_text", text: "正在检查动作绑定。\n下一步更新参考图。" }] } },
    { type: "response_item", payload: { type: "reasoning", content: [{ type: "text", text: "PRIVATE_REASONING" }] } },
    { type: "event_msg", payload: { type: "agent_reasoning", text: "PRIVATE_ANALYSIS" } },
  ];
  expect(extractVisibleHeading(lines.map(line => JSON.stringify(line)).join("\n"))).toBe("正在检查动作绑定。");
  expect(extractVisibleHeading(JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", channel: "analysis", content: [{ type: "output_text", text: "PRIVATE" }] } }))).toBeUndefined();
  expect(extractVisibleHeading('{broken json\n' + JSON.stringify({ type: "event_msg", payload: { type: "public_progress", title: "可见进度标题", visibility: "public" } }))).toBe("可见进度标题");
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "petlord-codex-notify-")); directories.push(directory);
  const configDirectory = join(directory, "codex"); await mkdir(configDirectory);
  const config = 'notify = ["other-notifier", "--keep"]\n[hooks]\n# keep inline hooks too\n[mcp_servers.existing]\ncommand = "custom"\n';
  await writeFile(join(configDirectory, "config.toml"), config);
  const other = { description: "User hooks", hooks: { Stop: [{ matcher: "custom", hooks: [{ type: "command", command: "existing-tool" }] }] }, custom: { keep: true } };
  await writeFile(join(configDirectory, "hooks.json"), JSON.stringify(other));
  const events: AgentEvent[] = [];
  const integration = createCodexNotificationIntegration({
    codexConfigDirectory: configDirectory, dataDirectory: join(directory, "integrations"),
    helperSourcePath: resolve("apps/desktop/electron/agent-notify.cjs"),
    commandPrefix: [process.execPath], socketPath: join(directory, "events.sock"), tokenPath: join(directory, "token"), databasePath: join(directory, "db"),
    isAvailable: async () => true,
    sendTest: async (data: unknown) => { const event = normalizeCodexEvent(data); events.push(event); return event; },
  });
  return { directory, configDirectory, config, other, integration, events };
}
it("installs and repairs only owned handlers without changing notify, inline hooks or trust", async () => {
  const test = await fixture();
  const installed = await test.integration.install();
  expect(installed.configured).toBe(true); expect(installed.lastLiveEventAt).toBeUndefined(); expect(installed.requiresHookReview).toBe(true);
  const hooks = JSON.parse(await readFile(join(test.configDirectory, "hooks.json"), "utf8"));
  expect(hooks.hooks.Stop[0]).toEqual(test.other.hooks.Stop[0]); expect(hooks.custom).toEqual({ keep: true });
  expect(await readFile(join(test.configDirectory, "config.toml"), "utf8")).toBe(test.config);
  const once = await readFile(join(test.configDirectory, "hooks.json"), "utf8");
  await test.integration.install(); expect(await readFile(join(test.configDirectory, "hooks.json"), "utf8")).toBe(once);
  expect((await readdir(test.configDirectory)).filter(name => name.includes("backup"))).toHaveLength(1);
  expect(await readdir(test.configDirectory)).not.toContain("hook-trust.json");
  hooks.hooks.PreToolUse = []; await writeFile(join(test.configDirectory, "hooks.json"), JSON.stringify(hooks));
  expect((await test.integration.status()).configured).toBe(false);
  await test.integration.install(); expect((await test.integration.status()).configured).toBe(true);
});
it("keeps configuration-written and test-delivered separate from observed live hooks", async () => {
  const test = await fixture(); await test.integration.install();
  const tested = await test.integration.test();
  expect(tested.lastTestAt).toBeDefined(); expect(tested.lastLiveEventAt).toBeUndefined();
  test.integration.observe(test.events[0]); expect((await test.integration.status()).lastLiveEventAt).toBeUndefined();
  test.integration.observe(normalizeCodexEvent({ ...payload, hook_event_name: "UserPromptSubmit" }, new Date(Date.now() + 1000).toISOString()));
  expect((await test.integration.status()).lastLiveEventAt).toBeDefined();
});

it("keeps pre-tool and post-tool lifecycle events distinct so work resumes after a permission request", () => {
  const before = normalizeCodexEvent({ ...payload, hook_event_name: "PreToolUse", tool_use_id: "same-tool" });
  const after = normalizeCodexEvent({ ...payload, hook_event_name: "PostToolUse", tool_use_id: "same-tool" });
  expect(before.dedupeKey).not.toBe(after.dedupeKey);
});
it("refuses malformed hook JSON without altering existing files", async () => {
  const test = await fixture(); const original = '{"hooks":{"Stop":"custom-invalid"}}';
  await writeFile(join(test.configDirectory, "hooks.json"), original);
  await expect(test.integration.install()).rejects.toThrow("原文件已保留");
  expect(await readFile(join(test.configDirectory, "hooks.json"), "utf8")).toBe(original);
  expect(await readFile(join(test.configDirectory, "config.toml"), "utf8")).toBe(test.config);
});

it("preserves unrelated commands that merely mention the managed marker", async () => {
  const test = await fixture();
  const custom = { hooks: [{ type: "command", command: "echo --petlord-codex-lifecycle" }] };
  const config = { hooks: { Stop: [custom] } };
  await writeFile(join(test.configDirectory, "hooks.json"), JSON.stringify(config));
  await test.integration.install();
  const installed = JSON.parse(await readFile(join(test.configDirectory, "hooks.json"), "utf8"));
  expect(installed.hooks.Stop[0]).toEqual(custom);
});

it("extracts only the short heading from a structured public reasoning summary", () => {
  const record = { type: "response_item", payload: { type: "reasoning", summary: [{ type: "summary_text", text: "**检查动画回程**\n\n摘要正文不会展示。" }], content: [{ type: "reasoning_text", text: "PRIVATE_RAW_REASONING" }], encrypted_content: "PRIVATE_ENCRYPTED" } };
  expect(extractVisibleHeading(JSON.stringify(record))).toBe("检查动画回程");
  expect(extractVisibleHeading(JSON.stringify({ method: "item/completed", params: { threadId: "session-a", turnId: "turn-a", item: { id: "reasoning-a", type: "reasoning", summary: ["## Verifying state bindings\nSummary body omitted."], content: ["PRIVATE_RAW"] } } }), "turn-a")).toBe("Verifying state bindings");
  expect(extractVisibleHeading(JSON.stringify({ ...record, turn_id: "other-turn" }), "turn-a")).toBeUndefined();
});
it("rejects unlabelled reasoning text, summary prose, oversized titles and incomplete headings", () => {
  for (const text of ["Plain summary prose\n**A later heading**", "**Unfinished", `**${"x".repeat(97)}**`, "**Title** plus body on this line"]) {
    expect(extractVisibleHeading(JSON.stringify({ type: "response_item", payload: { type: "reasoning", summary: [{ type: "summary_text", text }] } }))).toBeUndefined();
  }
  for (const payload of [
    { type: "reasoning", summary: [{ type: "text", text: "**Not an explicit summary**" }], content: [{ type: "reasoning_text", text: "**PRIVATE_RAW**" }] },
    { type: "reasoning", summary: [], encrypted_content: "**PRIVATE_ENCRYPTED**" },
    { type: "message", role: "assistant", channel: "analysis", content: [{ type: "output_text", text: "**PRIVATE_ANALYSIS**" }] },
  ]) expect(extractVisibleHeading(JSON.stringify({ type: "response_item", payload }))).toBeUndefined();
  expect(extractVisibleHeading(JSON.stringify({ type: "event_msg", payload: { type: "agent_reasoning", text: "**Unknown visibility**" } }))).toBeUndefined();
});
it("accepts the local app-server MessagePhase commentary field and keeps it as the fallback", () => {
  const visible = JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "正在检查动画绑定。" }] } });
  const noHeading = JSON.stringify({ type: "response_item", payload: { type: "reasoning", summary: [{ type: "summary_text", text: "Summary prose without a title." }] } });
  expect(extractVisibleHeading(`${visible}\n${noHeading}`)).toBe("正在检查动画绑定。");
});
