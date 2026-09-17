import { createServer, type Server } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

type ApiFixture = {
  server: Server;
  url: string;
  token: string;
  requests: Array<{ headers: Record<string, unknown>; body?: Record<string, unknown> }>;
};

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function apiFixture(token: string, jobAlwaysRunning = false): Promise<ApiFixture> {
  const requests: ApiFixture["requests"] = [];
  let jobReads = 0;
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { code: "UNAUTHORIZED", message: "Unauthorized" } }));
      return;
    }
    requests.push({ headers: request.headers as Record<string, unknown> });
    if (request.url === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ready", protocolVersion: 1 }));
      return;
    }
    if (request.url === "/api/design/v1/commands") {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        protocolVersion: 1,
        commands: [
          { name: "project.get", description: "Read a project", mutating: false, requiresProject: true, requiresRevision: false, inputSchema: { type: "object" } },
          { name: "state.update", description: "Update a state", mutating: true, requiresProject: true, requiresRevision: true, inputSchema: { type: "object" } },
          { name: "job.get", description: "Read a job", mutating: false, requiresProject: false, requiresRevision: false, inputSchema: { type: "object" } },
        ],
      }));
      return;
    }
    if (request.url === "/api/media/frame.png") {
      response.writeHead(200, { "Content-Type": "image/png" }).end(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    const parsed = JSON.parse(body) as Record<string, any>;
    requests.at(-1)!.body = parsed;
    if (parsed.command === "job.get") {
      jobReads += 1;
      const status = jobAlwaysRunning || jobReads === 1 ? "running" : "succeeded";
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
        protocolVersion: 1,
        requestId: parsed.requestId,
        result: { job: { id: parsed.input.jobId, status, progress: status === "running" ? 40 : 100 } },
      }));
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({
      protocolVersion: 1,
      requestId: parsed.requestId,
      result: { accepted: parsed },
    }));
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  cleanup.push(() => new Promise<void>((resolveClose) => server.close(() => resolveClose())));
  const address = server.address() as { port: number };
  return { server, url: `http://127.0.0.1:${address.port}`, token, requests };
}

async function client(connectionPath: string) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("scripts/design-mcp.mjs"), "--connection", connectionPath],
    stderr: "pipe",
  });
  const client = new Client({ name: "petlord-mcp-test", version: "1.0.0" });
  await client.connect(transport);
  cleanup.push(() => client.close());
  return client;
}

function jsonText(result: Awaited<ReturnType<Client["callTool"]>>) {
  const block = result.content.find((item) => item.type === "text");
  if (!block || block.type !== "text") throw new Error("Expected text tool content");
  return JSON.parse(block.text);
}

describe("PetLord design MCP stdio server", () => {
  it("initializes and describes tools while PetLord is stopped", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-mcp-stopped-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const mcp = await client(join(root, "missing-connection.json"));

    await expect(mcp.ping()).resolves.toBeDefined();
    const tools = await mcp.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "petlord_status",
      "petlord_describe",
      "petlord_read",
      "petlord_edit",
      "petlord_image",
      "petlord_job_wait",
    ]);
    expect(tools.tools.find((tool) => tool.name === "petlord_read")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.tools.find((tool) => tool.name === "petlord_edit")?.inputSchema.required).toContain("requestId");
    const status = await mcp.callTool({ name: "petlord_status", arguments: {} });
    expect(status.isError).not.toBe(true);
    expect(jsonText(status)).toMatchObject({ running: false, code: "PETLORD_NOT_RUNNING" });
  });

  it("enforces read/edit separation, returns images, and reloads a restarted app descriptor", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-mcp-live-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const connectionPath = join(root, "design-connection.json");
    const first = await apiFixture("first-private-token");
    await writeFile(connectionPath, JSON.stringify({ protocolVersion: 1, baseUrl: first.url, token: first.token, pid: process.pid }));
    const mcp = await client(connectionPath);

    const read = await mcp.callTool({ name: "petlord_read", arguments: { command: "project.get", projectId: "p", input: {} } });
    expect(read.isError).not.toBe(true);
    expect(first.requests.at(-1)?.body).toMatchObject({ command: "project.get", projectId: "p", input: {} });
    const denied = await mcp.callTool({ name: "petlord_read", arguments: { command: "state.update", projectId: "p", input: {} } });
    expect(denied.isError).toBe(true);
    expect(jsonText(denied)).toMatchObject({ error: { code: "MUTATING_COMMAND_REJECTED" } });

    const edit = await mcp.callTool({
      name: "petlord_edit",
      arguments: { command: "state.update", requestId: "stable-request", projectId: "p", expectedRevision: 7, input: { stateId: "s", patch: { label: "Sit" } } },
    });
    expect(edit.isError).not.toBe(true);
    expect(first.requests.at(-1)?.body).toEqual({
      command: "state.update",
      requestId: "stable-request",
      projectId: "p",
      expectedRevision: 7,
      responseMode: "summary",
      input: { stateId: "s", patch: { label: "Sit" } },
    });

    const image = await mcp.callTool({ name: "petlord_image", arguments: { uri: "/api/media/frame.png" } });
    expect(image.content).toContainEqual({ type: "image", data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString("base64"), mimeType: "image/png" });
    const external = await mcp.callTool({ name: "petlord_image", arguments: { uri: "https://example.com/frame.png" } });
    expect(external.isError).toBe(true);

    await new Promise<void>((resolveClose) => first.server.close(() => resolveClose()));
    const second = await apiFixture("second-private-token");
    await writeFile(connectionPath, JSON.stringify({ protocolVersion: 1, baseUrl: second.url, token: second.token, pid: process.pid }));
    const afterRestart = await mcp.callTool({ name: "petlord_read", arguments: { command: "project.get", projectId: "new", input: {} } });
    expect(afterRestart.isError).not.toBe(true);
    expect(second.requests.at(-1)?.body).toMatchObject({ command: "project.get", projectId: "new" });
    expect(JSON.stringify(afterRestart)).not.toContain("second-private-token");
  });

  it("waits for terminal jobs and bounds non-terminal waits", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-mcp-job-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const connectionPath = join(root, "design-connection.json");
    const terminal = await apiFixture("job-private-token-1234");
    await writeFile(connectionPath, JSON.stringify({ protocolVersion: 1, baseUrl: terminal.url, token: terminal.token, pid: process.pid }));
    const mcp = await client(connectionPath);

    const completed = await mcp.callTool({ name: "petlord_job_wait", arguments: { jobId: "j", timeoutMs: 1000, intervalMs: 10 } });
    expect(jsonText(completed)).toMatchObject({ result: { job: { id: "j", status: "succeeded" } } });
    expect(completed.isError).not.toBe(true);

    await new Promise<void>((resolveClose) => terminal.server.close(() => resolveClose()));
    const running = await apiFixture("running-private-token", true);
    await writeFile(connectionPath, JSON.stringify({ protocolVersion: 1, baseUrl: running.url, token: running.token, pid: process.pid }));
    const started = Date.now();
    const timeout = await mcp.callTool({ name: "petlord_job_wait", arguments: { jobId: "j2", timeoutMs: 80, intervalMs: 10 } });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(timeout.isError).toBe(true);
    expect(jsonText(timeout)).toMatchObject({ error: { code: "WAIT_TIMEOUT" }, job: { id: "j2", status: "running" } });
  });

  it("returns resumable progress with default arguments before the normal MCP client deadline", async () => {
    const root = await mkdtemp(join(tmpdir(), "petlord-mcp-default-wait-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    const connectionPath = join(root, "design-connection.json");
    const running = await apiFixture("default-wait-fixture-token", true);
    await writeFile(connectionPath, JSON.stringify({ protocolVersion: 1, baseUrl: running.url, token: running.token, pid: process.pid }));
    const mcp = await client(connectionPath);
    const started = Date.now();
    const result = await mcp.callTool({ name: "petlord_job_wait", arguments: { jobId: "long-job" } });
    expect(Date.now() - started).toBeLessThan(45_000);
    expect(jsonText(result)).toMatchObject({ error: { code: "WAIT_TIMEOUT", retryable: true }, job: { id: "long-job", status: "running", progress: 40 } });
    expect(jsonText(result).error.message).toContain("Call petlord_job_wait again");
    expect(running.requests.every(request => request.body?.command === "job.get")).toBe(true);
  }, 65_000);
});
