#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const HELP = {
  name: "petlord-design", protocolVersion: 1,
  usage: [
    "petlord-design describe [command]",
    "petlord-design call <command> --project <id> --revision <n> --input <file|->",
    "petlord-design execute --input <request.json|->",
    "petlord-design project list|get|inspect [id]",
    "petlord-design job get|wait <id> --timeout-ms 120000",
    "petlord-design export <project-id> --out <pet.petlord>",
    "petlord-design install <project-id> --revision <n>",
    "petlord-design media get </api/media/file.png> --out <file.png>",
    "petlord-design example lottery --project <new-id>",
  ],
  options: {
    "--connection": "Path to design-connection.json; defaults to PETLORD_DESIGN_CONNECTION_FILE or ~/.petlord/design-connection.json",
    "--endpoint": "Explicit loopback HTTP API origin (developer default http://127.0.0.1:4312)",
    "--token": "Explicit API token; prefer descriptor or PETLORD_DESIGN_TOKEN so secrets do not appear in shell history",
    "--input": "JSON file, or - to read JSON from stdin", "--json": "Inline JSON input",
    "--project": "Project identifier", "--revision": "Previously read project/entity revision",
    "--request-id": "Stable idempotency key; reuse it only for identical input",
    "--response-mode": "full (default) or summary; summary omits full project artwork from mutation responses",
    "--timeout-ms": "Total job wait deadline in milliseconds", "--interval-ms": "Job polling interval",
    "--request-timeout-ms": "HTTP request timeout; default 30000 ms", "--out": "Download destination",
  },
};

function parseArguments(argv) {
  const positional = [], options = {};
  const allowed = new Set(Object.keys(HELP.options).map(s => s.slice(2)));
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") { options.help = true; continue; }
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const key = arg.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option --${key}. Use --help.`);
    if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new Error(`Option --${key} requires a value.`);
    options[key] = argv[++i];
  }
  if (options.input && options.json) throw new Error("Use either --input or --json.");
  return { positional, options };
}
function positiveInteger(value, fallback, name, zero = false) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(n) || n < (zero ? 0 : 1)) throw new Error(`${name} must be ${zero ? "a nonnegative" : "a positive"} integer.`);
  return n;
}
async function inputJson(options, stdin) {
  let text;
  if (options.json !== undefined) text = options.json;
  else if (options.input === "-") {
    text = "";
    for await (const chunk of stdin) {
      text += chunk;
      if (Buffer.byteLength(text) > 224 * 1024 * 1024) throw new Error("Input exceeds 224 MB.");
    }
  } else if (options.input) text = await readFile(resolve(options.input), "utf8");
  else return {};
  try { return JSON.parse(text); } catch { throw new Error("Input must contain valid JSON."); }
}
async function connection(options, environment) {
  const dataDirectory = environment.PETLORD_USER_DATA_DIR ? resolve(environment.PETLORD_USER_DATA_DIR) : join(homedir(), ".petlord");
  const file = options.connection ?? environment.PETLORD_DESIGN_CONNECTION_FILE ?? join(dataDirectory, "design-connection.json");
  let descriptor;
  if (!options.endpoint && !environment.PETLORD_DESIGN_URL) {
    try { descriptor = JSON.parse(await readFile(file, "utf8")); }
    catch (error) {
      if (options.connection || environment.PETLORD_DESIGN_CONNECTION_FILE || error.code !== "ENOENT") throw new Error("Unable to read the design connection descriptor. Start PetLord or supply --endpoint.");
    }
  }
  const baseUrl = new URL(options.endpoint ?? environment.PETLORD_DESIGN_URL ?? descriptor?.baseUrl ?? "http://127.0.0.1:4312");
  if (baseUrl.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname) || baseUrl.username || baseUrl.password) throw new Error("Design endpoint must be a loopback HTTP URL without embedded credentials.");
  return { baseUrl: baseUrl.origin, token: options.token ?? environment.PETLORD_DESIGN_TOKEN ?? descriptor?.token };
}

export async function runDesignCli(argv = process.argv.slice(2), io = {}) {
  const stdout = io.stdout ?? process.stdout, stderr = io.stderr ?? process.stderr;
  const print = value => stdout.write(JSON.stringify(value, null, 2) + "\n");
  try {
    const { positional: args, options } = parseArguments(argv);
    if (options.help || !args.length || args[0] === "help") { print(HELP); return 0; }
    const target = await connection(options, io.environment ?? process.env);
    const headers = target.token ? { Authorization: `Bearer ${target.token}` } : {};
    const httpTimeout = positiveInteger(options["request-timeout-ms"], 30000, "Request timeout");
    async function http(path, body, timeoutMs = httpTimeout) {
      const url = new URL(path, target.baseUrl);
      if (url.origin !== target.baseUrl) throw new Error("Only media served by this local design endpoint may receive its credential.");
      return fetch(url, { method: body === undefined ? "GET" : "POST", headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(Math.max(1, timeoutMs)) });
    }
    async function json(path, body, timeoutMs) {
      const response = await http(path, body, timeoutMs);
      let payload;
      try { payload = await response.json(); } catch { throw new Error(`Local API returned HTTP ${response.status} without a JSON result.`); }
      if (!response.ok && !payload.error) throw new Error(`Local API returned HTTP ${response.status}.`);
      return payload;
    }
    function envelope(command, input = {}, overrides = {}) {
      return { requestId: options["request-id"] ?? randomUUID(), command, ...(options.project ? { projectId: options.project } : {}), ...(options["response-mode"] ? { responseMode: options["response-mode"] } : {}), ...(options.revision !== undefined ? { expectedRevision: positiveInteger(options.revision, 0, "Revision", true) } : {}), input, ...overrides };
    }
    const invoke = (command, input, overrides, timeoutMs) => json("/api/design/v1/execute", envelope(command, input, overrides), timeoutMs);
    async function download(uri, output) {
      if (!output) throw new Error("A download destination is required: --out <file>.");
      const response = await http(uri);
      if (!response.ok) throw new Error(`Media download failed (HTTP ${response.status}).`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const path = resolve(output); await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes);
      return { path, bytes: bytes.byteLength, mimeType: response.headers.get("Content-Type") };
    }
    let result;
    if (args[0] === "describe") {
      result = await json("/api/design/v1/commands");
      if (args[1] && !result.error) {
        result = result.commands?.find(c => c.name === args[1]);
        if (!result) throw new Error(`Command ${args[1]} was not found.`);
      }
    } else if (args[0] === "execute") {
      const input = await inputJson(options, io.stdin ?? process.stdin);
      if (!input || typeof input !== "object" || Array.isArray(input) || !input.command) throw new Error("execute requires a JSON object containing command and input.");
      result = await json("/api/design/v1/execute", { requestId: randomUUID(), ...input });
    } else if (args[0] === "example" && args[1] === "lottery") {
      result = await invoke("pixel.example.create", options.project ? { id: options.project } : {}, { responseMode: "full" });
      if (!result.error) result = { ...result, result: { projectId: result.result.project.id, revision: result.result.revision, states: result.result.project.logicalStates.length, transitions: result.result.project.transitions.length, generationCostCny: 0 } };
    } else if (args[0] === "call") {
      if (!args[1]) throw new Error("call requires a command name.");
      result = await invoke(args[1], await inputJson(options, io.stdin ?? process.stdin));
    } else if (args[0] === "project" && ["list", "get", "inspect"].includes(args[1])) {
      if (args[1] !== "list" && !args[2] && !options.project) throw new Error("Project id is required.");
      result = await invoke(`project.${args[1]}`, {}, args[2] ? { projectId: args[2] } : {});
    } else if (args[0] === "job" && ["get", "wait"].includes(args[1])) {
      if (!args[2]) throw new Error("Job id is required.");
      if (args[1] === "get") result = await invoke("job.get", { jobId: args[2] });
      else {
        const timeout = positiveInteger(options["timeout-ms"], 120000, "Wait timeout");
        const interval = positiveInteger(options["interval-ms"], 1000, "Poll interval");
        const deadline = Date.now() + timeout;
        let last;
        while (Date.now() < deadline) {
          let response;
          try { response = await invoke("job.get", { jobId: args[2] }, { requestId: randomUUID() }, Math.min(httpTimeout, deadline - Date.now())); }
          catch (error) { if (Date.now() < deadline && !["TimeoutError", "AbortError"].includes(error.name)) throw error; break; }
          if (response.error) { print(response); return 1; }
          last = response.result?.job;
          if (!last) throw new Error("Job response is missing its job record.");
          if (["succeeded", "failed"].includes(last.status)) { print(response); return last.status === "succeeded" ? 0 : 1; }
          const delay = Math.min(interval, deadline - Date.now());
          if (delay > 0) await new Promise(resolveWait => setTimeout(resolveWait, delay));
        }
        print({ error: { code: "WAIT_TIMEOUT", message: "The job is still non-terminal or could not be observed before the wait deadline." }, job: last });
        return 2;
      }
    } else if (["export", "install"].includes(args[0])) {
      const projectId = args[1] ?? options.project;
      if (!projectId) throw new Error("Project id is required.");
      result = await invoke(`package.${args[0]}`, {}, { projectId });
      if (!result.error && args[0] === "export") result = { ...result, download: await download(result.result.downloadPath, options.out) };
    } else if (args[0] === "media" && args[1] === "get" && args[2]) result = await download(args[2], options.out);
    else throw new Error("Unknown CLI command. Use --help or describe.");
    print(result);
    return result?.error ? 1 : 0;
  } catch (error) {
    const message = error?.message === "fetch failed" ? "Cannot reach the local design service. Start PetLord or check --connection/--endpoint." : error instanceof Error ? error.message : "CLI operation failed.";
    print({ error: { code: "CLI_ERROR", message } });
    stderr.write(message + "\n");
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  runDesignCli().then(code => { process.exitCode = code; });
}
