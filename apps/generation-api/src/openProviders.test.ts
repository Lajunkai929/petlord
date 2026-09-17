import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it, vi } from "vitest";
import { startPetLordServer } from "./appServer";
import { nativeMediaFixtureOptions } from "../test/nativeMediaFixture";

it.each(["openai-compatible", "siliconflow", "volcengine-ark"] as const)("generates a headless %s custom model with imported references and preserves metadata across restart", async type => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-open-providers-"));
  const png = (await readFile("apps/studio/public/demo/pip/state-sitting.png")).toString("base64");
  const references = [`data:image/png;base64,${png}`];
  let release: () => void = () => {}, received: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const requested = new Promise<void>(resolve => { received = resolve; });
  const wires: { path: string; body: any; key: string }[] = [];
  const provider = createServer(async (request, response) => {
    if (request.url === "/result.png") { response.writeHead(200, { "Content-Type": "image/png" }); response.end(Buffer.from(png, "base64")); return; }
    let body = ""; for await (const bytes of request) body += bytes;
    wires.push({ path: request.url!, body: JSON.parse(body), key: request.headers.authorization! }); received();
    await gate;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify(type === "siliconflow" ? { images: [{ url: "https://provider-fixture.invalid/result.png" }] } : { data: [{ b64_json: png }] }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const realFetch = globalThis.fetch;
  const transport = vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => realFetch(typeof url === "string" && url.startsWith("https://provider-fixture.invalid/") ? `http://127.0.0.1:${(provider.address() as { port: number }).port}${new URL(url).pathname}` : url, options));
  let api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory, ...nativeMediaFixtureOptions() });
  let index = 0;
  async function raw(command: string, input: unknown, extra = {}) {
    return (await fetch(api.url + "/api/design/v1/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: `open-${++index}`, command, input, ...extra }) })).json() as Promise<any>;
  }
  async function call(command: string, input: unknown, extra = {}) { const body = await raw(command, input, extra); if (body.error) throw new Error(JSON.stringify(body.error)); return body.result; }
  try {
    const models = [{ id: "team/private-image-v9", label: "Private", description: "Custom version", estimatedUnitCostCny: 0.4 }];
    const saved = await call("provider.create", { type, presetId: "other", models, capability: "image", name: "Local fixture", apiKey: "fixture-credential", baseUrl: `http://127.0.0.1:${(provider.address() as { port: number }).port}/v1` });
    let project = await call("project.create", { id: "p", name: "Pet", characterName: "Pet" });
    project = await call("state.create", { id: "sit", label: "Sitting" }, { projectId: "p", expectedRevision: project.revision });
    project = await call("media.import", { dataUrl: references[0], kind: "identity-reference" }, { projectId: "p", expectedRevision: project.revision });
    const submission = await call("state.generate", { stateId: "sit", settings: { imageProviderId: saved.id, imageModel: models[0].id, imageResolution: "1K", imageCandidateCount: 1 } }, { projectId: "p", expectedRevision: project.revision });
    await requested;
    // Both public entry points must refuse protocol/model edits while a job is active.
    const changedType = type === "openai-compatible" ? "siliconflow" : "openai-compatible";
    const edited = await fetch(`${api.url}/api/providers/${saved.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: changedType }) });
    expect(edited.status).toBe(409);
    expect((await raw("provider.update", { providerId: saved.id, patch: { models: [{ ...models[0], id: "replacement" }] } })).error?.code).toBe("REFERENCED");
    release();
    let job = submission.job;
    for (let attempt = 0; attempt < 400 && !["succeeded", "failed"].includes(job.status); attempt++) { await new Promise(resolve => setTimeout(resolve, 20)); job = (await call("job.get", { jobId: job.id })).job; }
    expect(job.error).toBeUndefined(); expect(job.status).toBe("succeeded"); expect(job.cost).toMatchObject({ status: "estimated", estimatedMinCny: 0.4, estimatedMaxCny: 0.4 });
    expect(wires).toHaveLength(1); expect(wires[0].body.model).toBe(models[0].id); expect(wires[0].key).toBe("Bearer fixture-credential");
    if (type === "openai-compatible") { expect(wires[0].path).toBe("/v1/images/edits"); expect(wires[0].body.images).toEqual(references.map(image_url => ({ image_url }))); }
    else if (type === "siliconflow") expect(wires[0].body.image).toBe(references[0]);
    else expect(wires[0].body.image).toEqual(references);
    const candidates = await call("state.candidates", { stateId: "sit" }, { projectId: "p" });
    expect(candidates.artifacts).toHaveLength(1); expect(candidates.artifacts[0]).toMatchObject({ pixelWidth: 1024, pixelHeight: 1024, hasAlpha: true, transparencyMethod: "apple-vision-foreground-mask" });
    expect(candidates.artifacts[0].alphaCoverage.transparentRatio).toBeGreaterThanOrEqual(0.02);
    const media = await fetch(new URL(candidates.artifacts[0].uri, api.url));
    expect(media.status).toBe(200); expect((await media.arrayBuffer()).byteLength).toBeGreaterThan(0);
    const nextModels = [...models, { id: "second-model", label: "Second", description: "" }];
    const updated = await call("provider.update", { providerId: saved.id, patch: { apiKey: "", models: nextModels, name: "Renamed" } });
    await api.close(); api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory, ...nativeMediaFixtureOptions() });
    const snapshot = await call("provider.list", {});
    expect(snapshot.providers).toEqual([updated]); expect(snapshot.providers[0]).toMatchObject({ type, presetId: "other", models: nextModels, credentialHint: "•••• tial" });
    expect(JSON.stringify(snapshot)).not.toContain("fixture-credential");
  } finally { release(); await api.close(); transport.mockRestore(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
}, 30000);

it("rejects edits through HTTP and Design API while the saved provider has an active job", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-provider-guard-"));
  let received: () => void = () => {}, release: () => void = () => {};
  const started = new Promise<void>(resolve => { received = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const provider = createServer(async (request, response) => { for await (const _chunk of request) { /* consume */ } received(); await gate; response.writeHead(500, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message: "fixture stopped" } })); });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory, ...nativeMediaFixtureOptions() });
  try {
    const saved = await (await fetch(api.url + "/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "volcengine-ark", capability: "image", name: "Fixture", apiKey: "fixture-secret", baseUrl: `http://127.0.0.1:${(provider.address() as { port: number }).port}` }) })).json() as any;
    const submitted = await fetch(api.url + "/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "3df39020-cafe-4407-995a-2a7e2cf7c014", kind: "state-image", providerId: saved.id, capability: "image", model: saved.models[0].id, trigger: { projectId: "fixture", entityType: "state", entityId: "s", label: "S" }, request: { model: saved.models[0].id, prompt: "Pet", referenceImages: [], resolution: "1K", candidateCount: 1 } }) });
    expect(submitted.status).toBe(202);
    await started;
    const http = await fetch(api.url + `/api/providers/${saved.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "openai-compatible" }) });
    const design = await (await fetch(api.url + "/api/design/v1/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: "guard", command: "provider.update", input: { providerId: saved.id, patch: { models: [{ id: "changed", label: "Changed", description: "" }] } } }) })).json() as any;
    expect(http.status).toBe(409); expect(design.error?.code).toBe("REFERENCED");
    const preserved = await (await fetch(api.url + "/api/providers")).json() as any;
    expect(preserved.providers[0]).toEqual(saved);
  } finally { release(); await api.close(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
}, 10000);

it("enforces saved model estimates for HTTP jobs and rejects unpriced models before any provider call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-provider-pricing-"));
  let providerCalls = 0;
  const provider = createServer(async (request, response) => { for await (const _chunk of request) { /* consume */ } providerCalls++; response.writeHead(500, { "Content-Type": "application/json" }); response.end(JSON.stringify({ error: { message: "fixture failure" } })); });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory, ...nativeMediaFixtureOptions() });
  let index = 0;
  async function call(command: string, input: unknown, extra = {}) { return (await fetch(api.url + "/api/design/v1/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: `price-${++index}`, command, input, ...extra }) })).json() as Promise<any>; }
  try {
    const incompatible = await fetch(api.url + "/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "openai-compatible", capability: "video", name: "Invalid", apiKey: "fixture-secret", baseUrl: "https://example.com/v1" }) });
    expect(incompatible.status).toBe(400);
    const saved = (await call("provider.create", { type: "openai-compatible", capability: "image", name: "Fixture", apiKey: "fixture-secret", baseUrl: `http://127.0.0.1:${(provider.address() as { port: number }).port}`, models: [{ id: "costly", label: "Costly", description: "", estimatedUnitCostCny: 2 }, { id: "unknown", label: "Unknown", description: "" }, { id: "cheap", label: "Cheap", description: "", estimatedUnitCostCny: 0.4 }] })).result;
    let project = (await call("project.create", { id: "pricing", name: "Pricing", characterName: "Pet", generationBudgetCny: 1 })).result;
    project = (await call("state.create", { id: "s", label: "S" }, { projectId: "pricing", expectedRevision: project.revision })).result;
    for (const model of ["costly", "unknown"]) {
      const response = await fetch(api.url + "/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), kind: "state-image", providerId: saved.id, capability: "image", model, trigger: { projectId: "pricing", entityType: "state", entityId: "s", label: "S" }, request: { model, prompt: "Pet", referenceImages: [], resolution: "1K", candidateCount: 1 }, cost: { status: "estimated", source: "estimate", estimatedMinCny: 0, estimatedMaxCny: 0, basis: "forged free generation" } }) });
      expect((await response.json() as any).error?.code).toBe(model === "costly" ? "BUDGET_EXCEEDED" : "PRICE_UNAVAILABLE");
      const design = await call("state.generate", { stateId: "s", settings: { imageProviderId: saved.id, imageModel: model, imageCandidateCount: 1 } }, { projectId: "pricing", expectedRevision: project.revision });
      expect(design.error?.code).toBe(model === "costly" ? "BUDGET_EXCEEDED" : "PRICE_UNAVAILABLE");
      if (model === "unknown") expect(design.error?.message).toContain("模型服务中补充此模型的预估费用");
    }
    for (const model of ["toString", "constructor", "__proto__"]) {
      await call("provider.update", { providerId: saved.id, patch: { models: [...saved.models, { id: model, label: model, description: "" }] } });
      const prototype = await fetch(api.url + "/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), kind: "state-image", providerId: saved.id, capability: "image", model, trigger: { projectId: "pricing", entityType: "state", entityId: "s", label: "S" }, request: { model, prompt: "Pet", referenceImages: [], resolution: "1K", candidateCount: 1 } }) });
      expect((await prototype.json() as any).error?.code).toBe("PRICE_UNAVAILABLE");
    }
    const detached = await fetch(api.url + "/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), kind: "state-image", providerId: saved.id, capability: "image", model: "unknown", trigger: { projectId: "missing", entityType: "state", entityId: "s", label: "S" }, request: { model: "unknown", prompt: "Pet", referenceImages: [], resolution: "1K", candidateCount: 1 } }) });
    expect((await detached.json() as any).error?.code).toBe("PRICE_UNAVAILABLE");
    const mismatched = await fetch(api.url + "/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: crypto.randomUUID(), kind: "state-image", providerId: saved.id, capability: "image", model: "costly", trigger: { projectId: "pricing", entityType: "state", entityId: "s", label: "S" }, request: { model: "cheap", prompt: "Pet", referenceImages: [], resolution: "1K", candidateCount: 1 } }) });
    expect((await mismatched.json() as any).error?.code).toBe("INVALID_INPUT");
    expect(providerCalls).toBe(0);
    const submitted = (await call("state.generate", { stateId: "s", settings: { imageProviderId: saved.id, imageModel: "cheap", imageCandidateCount: 1 } }, { projectId: "pricing", expectedRevision: project.revision })).result.job;
    let failed = submitted;
    for (let attempt = 0; attempt < 100 && failed.status !== "failed"; attempt++) { await new Promise(resolve => setTimeout(resolve, 10)); failed = (await call("job.get", { jobId: submitted.id })).result.job; }
    expect(failed.status).toBe("failed"); expect(providerCalls).toBe(1);
    await call("provider.update", { providerId: saved.id, patch: { models: [{ id: "cheap", label: "Cheap", description: "", estimatedUnitCostCny: 2 }] } });
    expect((await call("job.retry", { jobId: failed.id })).error?.code).toBe("BUDGET_EXCEEDED");
    const retry = await fetch(api.url + `/api/jobs/${failed.id}/retry`, { method: "POST" });
    expect((await retry.json() as any).error?.code).toBe("BUDGET_EXCEEDED");
    expect(providerCalls).toBe(1);

  } finally { await api.close(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); await rm(directory, { recursive: true, force: true }); }
});
