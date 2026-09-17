#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const maxJsonBytes = 64 * 1024 * 1024;
const maxImageBytes = 48 * 1024 * 1024;

function parseArguments(argv) {
  let connectionPath;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--connection" || !argv[index + 1]) throw new Error("PetLord MCP accepts only --connection <path>.");
    connectionPath = resolve(argv[index + 1]);
    index += 1;
  }
  return connectionPath;
}

function descriptorPath(explicit, environment) {
  if (explicit) return explicit;
  if (environment.PETLORD_DESIGN_CONNECTION_FILE) return resolve(environment.PETLORD_DESIGN_CONNECTION_FILE);
  const dataDirectory = environment.PETLORD_USER_DATA_DIR ? resolve(environment.PETLORD_USER_DATA_DIR) : join(homedir(), ".petlord");
  return join(dataDirectory, "design-connection.json");
}

async function readConnection(path) {
  let descriptor;
  try {
    descriptor = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") throw Object.assign(new Error("PetLord is not running."), { code: "PETLORD_NOT_RUNNING" });
    throw Object.assign(new Error("The PetLord connection descriptor is unavailable or invalid."), { code: "INVALID_CONNECTION" });
  }
  const baseUrl = new URL(descriptor?.baseUrl);
  if (descriptor?.protocolVersion !== 1
    || baseUrl.protocol !== "http:"
    || !["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname)
    || baseUrl.username
    || baseUrl.password
    || typeof descriptor?.token !== "string"
    || descriptor.token.length < 16) {
    throw Object.assign(new Error("The PetLord connection descriptor is invalid."), { code: "INVALID_CONNECTION" });
  }
  return { baseUrl: baseUrl.origin, token: descriptor.token };
}

async function apiClient(path) {
  const connection = await readConnection(path);

  async function response(uri, body, timeoutMs = 30_000) {
    const url = new URL(uri, connection.baseUrl);
    if (url.origin !== connection.baseUrl) throw Object.assign(new Error("Only the current PetLord service origin is allowed."), { code: "EXTERNAL_MEDIA_REJECTED" });
    return fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${connection.token}`,
        Origin: connection.baseUrl,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    });
  }

  async function json(uri, body, timeoutMs) {
    const result = await response(uri, body, timeoutMs);
    const declared = Number(result.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxJsonBytes) throw Object.assign(new Error("PetLord returned an oversized JSON result."), { code: "RESULT_TOO_LARGE" });
    const text = await result.text();
    if (Buffer.byteLength(text) > maxJsonBytes) throw Object.assign(new Error("PetLord returned an oversized JSON result."), { code: "RESULT_TOO_LARGE" });
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw Object.assign(new Error(`PetLord returned HTTP ${result.status} without JSON.`), { code: "INVALID_RESPONSE" });
    }
    if (!result.ok && !payload?.error) throw Object.assign(new Error(`PetLord returned HTTP ${result.status}.`), { code: "HTTP_ERROR" });
    return payload;
  }

  return { baseUrl: connection.baseUrl, json, response };
}

function textResult(value, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function failure(code, message, details) {
  return textResult({ error: { code, message, ...(details === undefined ? {} : { details }) } }, true);
}

function caught(error) {
  const code = typeof error?.code === "string" ? error.code : error?.name === "TimeoutError" ? "REQUEST_TIMEOUT" : "PETLORD_UNAVAILABLE";
  const message = code === "PETLORD_NOT_RUNNING"
    ? "PetLord is not running. Start the desktop app and retry."
    : error instanceof Error ? error.message : "PetLord could not complete the request.";
  return failure(code, message);
}

function payloadResult(payload) {
  return textResult(payload, Boolean(payload?.error));
}

async function catalog(client) {
  const value = await client.json("/api/design/v1/commands");
  if (!Array.isArray(value?.commands)) throw Object.assign(new Error("PetLord command catalog is invalid."), { code: "INVALID_RESPONSE" });
  return value;
}

function commandDefinition(value, name) {
  const definition = value.commands.find((candidate) => candidate?.name === name);
  if (!definition) throw Object.assign(new Error(`PetLord command ${name} was not found.`), { code: "COMMAND_NOT_FOUND" });
  return definition;
}

function createServer(connectionPath, environment) {
  const server = new McpServer({ name: "petlord-design", version: "1.0.0" }, {
    instructions: "Read the command catalog and current project before editing. Reuse requestId only for an identical edit retry. Pass the latest revision for revision-protected commands. PetLord is local-only; this server never exposes its private token.",
  });

  server.registerTool("petlord_status", {
    title: "PetLord status",
    description: "Check whether the local PetLord design service is running.",
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    try {
      const client = await apiClient(descriptorPath(connectionPath, environment));
      const health = await client.json("/api/health");
      return textResult({ running: health?.status === "ready", protocolVersion: health?.protocolVersion ?? 1 });
    } catch (error) {
      const code = typeof error?.code === "string" ? error.code : "PETLORD_UNAVAILABLE";
      return textResult({ running: false, code, message: code === "PETLORD_NOT_RUNNING" ? "Start PetLord and retry." : "PetLord is unavailable." });
    }
  });

  server.registerTool("petlord_describe", {
    title: "Describe PetLord commands",
    description: "List PetLord design commands and their input JSON schemas, or inspect one command.",
    inputSchema: { command: z.string().min(1).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ command }) => {
    try {
      const client = await apiClient(descriptorPath(connectionPath, environment));
      const value = await catalog(client);
      return textResult(command ? commandDefinition(value, command) : value);
    } catch (error) {
      return caught(error);
    }
  });

  server.registerTool("petlord_read", {
    title: "Read PetLord data",
    description: "Execute one catalog command only when it is declared read-only. Mutating commands are rejected.",
    inputSchema: {
      command: z.string().min(1),
      projectId: z.string().min(1).optional(),
      input: z.record(z.string(), z.unknown()).default({}),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ command, projectId, input }) => {
    try {
      const client = await apiClient(descriptorPath(connectionPath, environment));
      const definition = commandDefinition(await catalog(client), command);
      if (definition.mutating) return failure("MUTATING_COMMAND_REJECTED", `Command ${command} changes data. Use petlord_edit.`);
      if (definition.requiresProject && !projectId) return failure("PROJECT_REQUIRED", `Command ${command} requires projectId.`);
      const request = { requestId: randomUUID(), command, ...(projectId ? { projectId } : {}), input };
      return payloadResult(await client.json("/api/design/v1/execute", request));
    } catch (error) {
      return caught(error);
    }
  });

  server.registerTool("petlord_edit", {
    title: "Edit PetLord design",
    description: "Execute one mutating PetLord command with an explicit retry-safe requestId and optional project revision.",
    inputSchema: {
      command: z.string().min(1),
      requestId: z.string().min(1),
      projectId: z.string().min(1).optional(),
      expectedRevision: z.number().int().nonnegative().optional(),
      input: z.record(z.string(), z.unknown()).default({}),
      responseMode: z.enum(["summary", "full"]).default("summary"),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ command, requestId, projectId, expectedRevision, input, responseMode }) => {
    try {
      const client = await apiClient(descriptorPath(connectionPath, environment));
      const definition = commandDefinition(await catalog(client), command);
      if (!definition.mutating) return failure("READ_COMMAND_REJECTED", `Command ${command} is read-only. Use petlord_read.`);
      if (definition.requiresProject && !projectId) return failure("PROJECT_REQUIRED", `Command ${command} requires projectId.`);
      if (definition.requiresRevision && expectedRevision === undefined) return failure("REVISION_REQUIRED", `Command ${command} requires expectedRevision.`);
      const request = {
        command,
        requestId,
        ...(projectId ? { projectId } : {}),
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
        responseMode,
        input,
      };
      return payloadResult(await client.json("/api/design/v1/execute", request));
    } catch (error) {
      return caught(error);
    }
  });

  server.registerTool("petlord_image", {
    title: "Read PetLord image",
    description: "Read a PNG, JPEG, or WebP image from the current local PetLord service and return an MCP image block.",
    inputSchema: { uri: z.string().min(1) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ uri }) => {
    try {
      const client = await apiClient(descriptorPath(connectionPath, environment));
      const response = await client.response(uri);
      if (!response.ok) return failure("IMAGE_READ_FAILED", `PetLord returned HTTP ${response.status} for the image.`);
      const mimeType = String(response.headers.get("content-type") ?? "").split(";", 1)[0].toLowerCase();
      if (!new Set(["image/png", "image/jpeg", "image/webp"]).has(mimeType)) return failure("UNSUPPORTED_IMAGE", "PetLord media is not PNG, JPEG, or WebP.");
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > maxImageBytes) return failure("IMAGE_TOO_LARGE", "PetLord image exceeds 48 MB.");
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength === 0 || bytes.byteLength > maxImageBytes) return failure("IMAGE_TOO_LARGE", "PetLord image size is invalid.");
      return { content: [{ type: "image", data: bytes.toString("base64"), mimeType }] };
    } catch (error) {
      return caught(error);
    }
  });

  server.registerTool("petlord_job_wait", {
    title: "Wait for PetLord job",
    description: "Wait up to 30 seconds by default (maximum 45 seconds). If still running, call again with the same jobId; this never resubmits generation. The connection descriptor is reloaded between polls.",
    inputSchema: {
      jobId: z.string().min(1),
      timeoutMs: z.number().int().min(1).max(45_000).default(30_000),
      intervalMs: z.number().int().min(1).max(30_000).default(1000),
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ jobId, timeoutMs, intervalMs }) => {
    const deadline = Date.now() + timeoutMs;
    let last;
    const timeoutResult = () => textResult({ error: { code: "WAIT_TIMEOUT", retryable: true, message: "The job is still running. Call petlord_job_wait again with the same jobId to continue waiting; do not resubmit generation." }, job: last }, true);
    try {
      do {
        const client = await apiClient(descriptorPath(connectionPath, environment));
        const payload = await client.json("/api/design/v1/execute", {
          requestId: randomUUID(),
          command: "job.get",
          input: { jobId },
        }, Math.min(30_000, Math.max(1, deadline - Date.now())));
        if (payload?.error) return payloadResult(payload);
        last = payload?.result?.job;
        if (!last) return failure("INVALID_RESPONSE", "PetLord job response is missing its job record.");
        if (last.status === "succeeded") return textResult(payload);
        if (last.status === "failed") return textResult(payload, true);
        const delay = Math.min(intervalMs, Math.max(0, deadline - Date.now()));
        if (delay > 0) await new Promise((resolveWait) => setTimeout(resolveWait, delay));
      } while (Date.now() < deadline);
      return timeoutResult();
    } catch (error) {
      if (["TimeoutError", "AbortError"].includes(error?.name) && Date.now() >= deadline) return timeoutResult();
      return caught(error);
    }
  });

  return server;
}

export async function runDesignMcp(argv = process.argv.slice(2), io = {}) {
  const connectionPath = parseArguments(argv);
  const environment = io.environment ?? process.env;
  const server = createServer(connectionPath, environment);
  const transport = new StdioServerTransport(io.stdin, io.stdout, { maxBufferSize: 10 * 1024 * 1024 });
  await server.connect(transport);
  return { server, transport };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runDesignMcp().catch(() => {
    process.stderr.write("PetLord MCP could not start.\n");
    process.exitCode = 1;
  });
}
