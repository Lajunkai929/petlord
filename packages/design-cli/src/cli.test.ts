import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
async function server() {
  const requests: any[] = [];
  const s = createServer(async (req, res) => {
    if (req.headers.authorization !== "Bearer private-token") { res.writeHead(401).end(); return; }
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/design/v1/commands") { res.end(JSON.stringify({ protocolVersion: 1, commands: [{ name: "state.create", inputSchema: { type: "object" } }] })); return; }
    if (req.url === "/api/media/frame.png") { res.setHeader("Content-Type", "image/png"); res.end(Buffer.from([137,80,78,71])); return; }
    let body = ""; for await (const chunk of req) body += chunk;
    const input = JSON.parse(body); requests.push(input);
    if (input.command === "job.get") res.end(JSON.stringify({ protocolVersion: 1, requestId: input.requestId, result: { job: { id: input.input.jobId, status: "running", progress: 20 } } }));
    else res.end(JSON.stringify({ protocolVersion: 1, requestId: input.requestId, result: { accepted: input } }));
  });
  await new Promise<void>(r => s.listen(0, "127.0.0.1", r));
  cleanup.push(() => new Promise<void>(r => s.close(() => r())));
  const address = s.address() as { port: number };
  const dir = await mkdtemp(join(tmpdir(), "petlord-cli-"));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  const connection = join(dir, "design-connection.json");
  await writeFile(connection, JSON.stringify({ protocolVersion: 1, baseUrl: `http://127.0.0.1:${address.port}`, token: "private-token", pid: process.pid }));
  return { connection, requests, dir };
}
function run(args: string[], input = "") {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolveRun, reject) => {
    const child = spawn(process.execPath, [resolve("scripts/design-cli.mjs"), ...args], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", b => stdout += b); child.stderr.on("data", b => stderr += b);
    child.on("error", reject); child.on("exit", code => resolveRun({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

describe("bundled agent design CLI", () => {
  it("discovers commands using a private connection descriptor without printing its token", async () => {
    const api = await server();
    const result = await run(["describe", "--connection", api.connection]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).commands[0].name).toBe("state.create");
    expect(result.stdout + result.stderr).not.toContain("private-token");
  });
  it("executes a JSON command from stdin with an explicit revision and request id", async () => {
    const api = await server();
    const result = await run(["call", "state.create", "--project", "p", "--revision", "7", "--request-id", "same-request", "--input", "-", "--connection", api.connection], '{"id":"sit","label":"坐着"}');
    expect(result.code).toBe(0);
    expect(api.requests[0]).toEqual({ requestId: "same-request", command: "state.create", projectId: "p", expectedRevision: 7, input: { id: "sit", label: "坐着" } });
  });
  it("bounds job waits and returns the last known progress on timeout", async () => {
    const api = await server();
    // Leave time for the first HTTP response under a fully parallel workspace test run.
    const result = await run(["job", "wait", "j", "--timeout-ms", "1000", "--interval-ms", "20", "--connection", api.connection]);
    expect(result.code).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "WAIT_TIMEOUT" }, job: { id: "j", status: "running" } });
  });
  it("downloads actual media bytes to the requested output path", async () => {
    const api = await server(), destination = join(api.dir, "frame.png");
    const result = await run(["media", "get", "/api/media/frame.png", "--out", destination, "--connection", api.connection]);
    expect(result.code).toBe(0);
    expect(await readFile(destination)).toEqual(Buffer.from([137,80,78,71]));
  });
});
