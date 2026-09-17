#!/usr/bin/env node
"use strict";

const { readFileSync } = require("node:fs");
const { request } = require("node:http");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { spawn } = require("node:child_process");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
      if (Buffer.byteLength(input) > 1024 * 1024) { input = ""; process.stdin.destroy(); resolve(""); }
    });
    process.stdin.on("end", () => resolve(input));
    if (process.stdin.isTTY) resolve("");
  });
}

function payloadArgument() {
  const knownOptions = new Set(["--socket", "--token-file", "--database", "--forward-file"]);
  const positional = [];
  for (let index = 3; index < process.argv.length; index += 1) {
    if (knownOptions.has(process.argv[index])) { index += 1; continue; }
    positional.push(process.argv[index]);
  }
  return positional.at(-1);
}

function deliver(socketPath, token, input) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(input);
    const outgoing = request({
      socketPath,
      path: "/v1/events",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 180,
    }, (response) => {
      response.resume();
      response.on("end", () => response.statusCode === 201 ? resolve() : reject(new Error(`Unexpected status ${response.statusCode}`)));
    });
    outgoing.on("timeout", () => outgoing.destroy(new Error("Agent socket timeout")));
    outgoing.on("error", reject);
    outgoing.end(body);
  });
}

function spool(databasePath, source, payload, receivedAt) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_event_spool (
      spool_id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      received_at TEXT NOT NULL
    )
  `);
  database.prepare("INSERT INTO agent_event_spool(spool_id, source, payload_json, received_at) VALUES (?, ?, ?, ?)")
    .run(randomUUID(), source, JSON.stringify(payload), receivedAt);
  database.close();
}

function forward(rawPayload) {
  const forwardFile = option("--forward-file");
  if (!forwardFile) return;
  try {
    const command = JSON.parse(readFileSync(forwardFile, "utf8"));
    if (!Array.isArray(command) || !command.every((item) => typeof item === "string") || command.length === 0) return;
    const child = spawn(command[0], [...command.slice(1), rawPayload], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // Existing notifiers are best-effort; PetLord must never block the agent.
  }
}

async function main() {
  const mode = process.argv[2];
  if (!["claude", "codex", "codex-hook"].includes(mode)) return;
  const source = mode === "codex-hook" ? "codex" : mode;
  const rawPayload = mode === "codex" ? payloadArgument() ?? "" : await readStdin();
  let payload;
  try {
    if (Buffer.byteLength(rawPayload) > 1024 * 1024) return;
    payload = JSON.parse(rawPayload);
  } catch {
    return;
  } finally {
    if (mode === "codex") forward(rawPayload);
  }
  if (mode === "codex-hook") payload = await require("./codex-notifications.cjs").enrichCodexHookPayload(payload);
  const socketPath = option("--socket");
  const tokenFile = option("--token-file");
  const databasePath = option("--database");
  const receivedAt = new Date().toISOString();
  try {
    if (!socketPath || !tokenFile) throw new Error("Connector is not configured");
    const token = readFileSync(tokenFile, "utf8").trim();
    await deliver(socketPath, token, { source, payload, receivedAt });
  } catch {
    try {
      if (databasePath) spool(databasePath, source, payload, receivedAt);
    } catch {
      // Hooks are notifications, never control flow. Exit successfully on every failure path.
    }
  }
}

void main().catch(() => undefined).finally(() => { process.exitCode = 0; });
