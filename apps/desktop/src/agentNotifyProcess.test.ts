import { execFile } from "node:child_process";
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

    const result = await execFileAsync(process.execPath, [
      helperPath,
      "codex",
      "--socket",
      join(directory, "offline.sock"),
      "--token-file",
      tokenPath,
      "--database",
      databasePath,
      payload,
    ]);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");

    const database = new DatabaseSync(databasePath);
    const row = database.prepare("SELECT source, payload_json FROM agent_event_spool").get() as { source: string; payload_json: string };
    expect(row.source).toBe("codex");
    expect(JSON.parse(row.payload_json)).toEqual(expect.objectContaining({ "thread-id": "thread-process-test" }));
    database.close();
  });

  it("never blocks Codex on malformed notification JSON", async () => {
    const result = await execFileAsync(process.execPath, [helperPath, "codex", "not-json"]);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
