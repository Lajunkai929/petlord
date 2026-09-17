import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const helperPath = fileURLToPath(new URL("../electron/agent-notify.cjs", import.meta.url));
const directories: string[] = [];
// Child-process assertions must exercise warning-enabled production behavior.
const warningEnabledEnv = { ...process.env };
delete warningEnabledEnv.NODE_NO_WARNINGS;
delete warningEnabledEnv.NODE_OPTIONS;
const notifyNode = process.env.PETLORD_NOTIFY_TEST_NODE ?? process.execPath;


afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe("agent notify process", () => {
  it("spools a Codex completion into SQLite when the desktop socket is offline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petlord-agent-notify-"));
    directories.push(directory);
    const databasePath = join(directory, "petlord-client.sqlite");
    const tokenPath = join(directory, "token");
    await writeFile(tokenPath, "test-token", "utf8");
    const payload = JSON.stringify({
      type: "agent-turn-complete",
      "thread-id": "thread-process-test",
      "turn-id": "turn-process-test",
      "last-assistant-message": "Process test completed.",
    });

    const result = await execFileAsync(notifyNode, [
      helperPath,
      "codex",
      "--socket",
      join(directory, "offline.sock"),
      "--token-file",
      tokenPath,
      "--database",
      databasePath,
      payload,
    ], { env: warningEnabledEnv });
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");

    const database = new DatabaseSync(databasePath);
    const row = database.prepare("SELECT source, payload_json FROM agent_event_spool").get() as { source: string; payload_json: string };
    expect(row.source).toBe("codex");
    expect(JSON.parse(row.payload_json)).toEqual(expect.objectContaining({ "thread-id": "thread-process-test" }));
    database.close();
  });

  it("never blocks Codex on malformed notification JSON", async () => {
    const result = await execFileAsync(notifyNode, [helperPath, "codex", "not-json"], { env: warningEnabledEnv });
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});


it("accepts Codex lifecycle JSON on stdin and spools only visible progress without private tool data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-agent-hook-")); directories.push(directory);
  const transcript = join(directory, "transcript.jsonl");
  await writeFile(transcript, [
    JSON.stringify({ type: "response_item", payload: { type: "message", role: "assistant", channel: "commentary", content: [{ type: "output_text", text: "检查状态图连通性" }] } }),
    JSON.stringify({ type: "response_item", payload: { type: "reasoning", content: [{ type: "text", text: "PRIVATE_REASONING" }] } }),
  ].join("\n"));
  const databasePath = join(directory, "spool.sqlite");
  const child = spawn(notifyNode, [helperPath, "codex-hook", "--database", databasePath], { env: warningEnabledEnv, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; child.stdout.on("data", chunk => { output += chunk; });
  child.stdin.end(JSON.stringify({ hook_event_name: "PreToolUse", session_id: "working-session", turn_id: "working-turn", transcript_path: transcript, tool_name: "exec_command", tool_input: { cmd: "SECRET_COMMAND" } }));
  const code = await new Promise(resolve => child.on("close", resolve));
  expect(code).toBe(0); expect(output).toBe("");
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT source, payload_json FROM agent_event_spool").get() as { source: string; payload_json: string };
  expect(row.source).toBe("codex");
  expect(JSON.parse(row.payload_json)).toMatchObject({ hook_event_name: "PreToolUse", public_heading: "检查状态图连通性", session_id: "working-session" });
  expect(row.payload_json).not.toContain("PRIVATE"); expect(row.payload_json).not.toContain("SECRET"); expect(row.payload_json).not.toContain(transcript);
  database.close();
});

it("continues forwarding legacy Codex argv notifications to the prior notifier", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-forward-notify-")); directories.push(directory);
  const forwardFile = join(directory, "forward.json"); const outputFile = join(directory, "received.json"); const script = join(directory, "prior.cjs");
  await writeFile(script, 'require("node:fs").writeFileSync(process.argv[2], process.argv[3]);');
  await writeFile(forwardFile, JSON.stringify([process.execPath, script, outputFile]));
  const payload = JSON.stringify({ type: "agent-turn-complete", "thread-id": "legacy-thread", "turn-id": "legacy-turn" });
  await execFileAsync(notifyNode, [helperPath, "codex", "--forward-file", forwardFile, payload], { env: warningEnabledEnv });
  const { readFile } = await import("node:fs/promises");
  let received = "";
  for (let attempt = 0; attempt < 30 && !received; attempt++) { received = await readFile(outputFile, "utf8").catch(() => ""); if (!received) await new Promise(resolve => setTimeout(resolve, 20)); }
  expect(received).toBe(payload);
});

it("spools only a public summary heading and discards the summary body, raw reasoning and encrypted fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-public-summary-")); directories.push(directory);
  const transcript = join(directory, "transcript.jsonl"); const databasePath = join(directory, "spool.sqlite");
  await writeFile(transcript, JSON.stringify({ type: "response_item", payload: { type: "reasoning", summary: [{ type: "summary_text", text: "**验证回程动画**\n\nPUBLIC_BODY_NOT_FOR_BUBBLE" }], content: [{ type: "reasoning_text", text: "PRIVATE_RAW" }], encrypted_content: "PRIVATE_ENCRYPTED" } }));
  const child = spawn(notifyNode, [helperPath, "codex-hook", "--database", databasePath], { env: warningEnabledEnv, stdio: ["pipe", "pipe", "pipe"] });
  child.stdin.end(JSON.stringify({ hook_event_name: "PreToolUse", session_id: "summary-session", turn_id: "summary-turn", transcript_path: transcript, tool_name: "exec_command" }));
  expect(await new Promise(resolve => child.on("close", resolve))).toBe(0);
  const database = new DatabaseSync(databasePath);
  const row = database.prepare("SELECT payload_json FROM agent_event_spool").get() as { payload_json: string };
  expect(JSON.parse(row.payload_json).public_heading).toBe("验证回程动画");
  expect(row.payload_json).not.toContain("PUBLIC_BODY"); expect(row.payload_json).not.toContain("PRIVATE");
  database.close();
});

it("does not load SQLite or echo private malformed notifications", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-quiet-hook-")); directories.push(directory);
  const guard = join(directory, "sqlite-guard.cjs");
  await writeFile(guard, `const Module = require("node:module"); const original = Module._load; Module._load = function(id, ...args) { if (id === "node:sqlite") { process.stderr.write("UNEXPECTED_SQLITE_LOAD"); throw new Error("blocked fixture load"); } return original.call(this, id, ...args); };`);
  const privateMarker = "PRIVATE_MALFORMED_CONTENT";
  for (const payload of [privateMarker, JSON.stringify(privateMarker), "null", "[]", JSON.stringify({ type: "unsupported", "thread-id": privateMarker })]) {
    const result = await execFileAsync(notifyNode, ["--require", guard, helperPath, "codex", "--database", join(directory, "spool.sqlite"), payload], { env: warningEnabledEnv });
    expect(result.stdout).toBe(""); expect(result.stderr).toBe("");
  }
});

it("filters only SQLite's builtin warning during lazy load and restores warning delivery", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-warning-hook-")); directories.push(directory);
  const probe = join(directory, "sqlite-warning-probe.cjs");
  await writeFile(probe, `
const Module = require("node:module"); const originalLoad = Module._load;
const originalWarning = process.emitWarning;
Module._load = function(id, ...args) {
  if (id !== "node:sqlite") return originalLoad.call(this, id, ...args);
  process.emitWarning("SQLite is an experimental feature and might change at any time", "ExperimentalWarning");
  process.emitWarning("other experimental fixture", "ExperimentalWarning");
  process.emitWarning("SQLite is an experimental feature and might change at any time", "UserWarning");
  process.emitWarning("standard runtime fixture", { type: "DeprecationWarning", code: "FIXTURE_DEPRECATION" });
  process.nextTick(() => {
    if (process.emitWarning !== originalWarning) process.stderr.write("WARNING_HANDLER_NOT_RESTORED");
    process.emitWarning("SQLite is an experimental feature and might change at any time", "ExperimentalWarning");
  });
  return originalLoad.call(this, id, ...args);
};`);
  const result = await execFileAsync(notifyNode, ["--require", probe, helperPath, "codex", "--database", join(directory, "spool.sqlite"), JSON.stringify({ type: "agent-turn-complete", "thread-id": "warning-fixture", "turn-id": "fixture-turn" })], { env: warningEnabledEnv });
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("other experimental fixture");
  expect(result.stderr).toContain("UserWarning: SQLite");
  expect(result.stderr).toContain("FIXTURE_DEPRECATION");
  expect(result.stderr).not.toContain("WARNING_HANDLER_NOT_RESTORED");
  expect(result.stderr.match(/ExperimentalWarning: SQLite/g)).toHaveLength(1);
});

it("keeps the installed standalone legacy helper able to spool completions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-standalone-hook-")); directories.push(directory);
  const { copyFile } = await import("node:fs/promises");
  const helper = join(directory, "agent-notify.cjs");
  await copyFile(helperPath, helper);
  const databasePath = join(directory, "spool.sqlite");
  const result = await execFileAsync(notifyNode, [helper, "codex", "--database", databasePath, JSON.stringify({ type: "agent-turn-complete", "thread-id": "standalone-fixture" })], { env: warningEnabledEnv });
  expect(result.stdout).toBe(""); expect(result.stderr).toBe("");
  const database = new DatabaseSync(databasePath);
  try { expect(database.prepare("SELECT source FROM agent_event_spool").get()).toMatchObject({ source: "codex" }); }
  finally { database.close(); }
});

it("keeps malformed private notifications quiet when a prior notifier no longer exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-missing-notifier-")); directories.push(directory);
  const forwardFile = join(directory, "forward.json");
  await writeFile(forwardFile, JSON.stringify([join(directory, "missing-notifier")]));
  const result = await execFileAsync(notifyNode, [helperPath, "codex", "--forward-file", forwardFile, "PRIVATE_MALFORMED_PAYLOAD"], { env: warningEnabledEnv })
    .then(value => ({ ...value, code: 0 }), error => ({ stdout: error.stdout, stderr: error.stderr, code: error.code }));
  expect(result.code).toBe(0);
  expect(result.stdout).toBe(""); expect(result.stderr).toBe("");
});
