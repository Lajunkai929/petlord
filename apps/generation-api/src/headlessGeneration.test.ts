import { createServer } from "node:http";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { startPetLordServer } from "./appServer";
import { nativeMediaFixtureOptions } from "../test/nativeMediaFixture";

it("finishes provider generation and persists usable candidates while no Studio is open", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-headless-generation-"));
  const image = await readFile(resolve("apps/studio/public/demo/pip/state-sitting.png"));
  const providerRequests: any[] = [];
  const provider = createServer(async (request, response) => {
    let body = ""; for await (const bytes of request) body += bytes;
    providerRequests.push(JSON.parse(body));
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [{ b64_json: image.toString("base64") }] }));
  });
  await new Promise<void>(done => provider.listen(0, "127.0.0.1", done));
  const address = provider.address() as { port: number };
  const api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory, ...nativeMediaFixtureOptions() });
  let index = 0;
  async function call(command: string, input: unknown, extra: object = {}) {
    const response = await fetch(api.url + "/api/design/v1/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: `job-test-${++index}`, command, input, ...extra }) });
    const body = await response.json() as any;
    if (body.error) throw new Error(JSON.stringify(body.error));
    return body.result;
  }
  try {
    const configured = await call("provider.create", { type: "volcengine-ark", capability: "image", name: "Local test provider", apiKey: "fixture-credential", baseUrl: `http://127.0.0.1:${address.port}`, enabled: true });
    let project = await call("project.create", { id: "p", name: "Lottery", characterName: "Lottery" });
    project = await call("state.create", { id: "sit", label: "坐着", description: "front paws together" }, { projectId: "p", expectedRevision: project.revision });
    const submission = await call("state.generate", { stateId: "sit", settings: { imageProviderId: configured.id, imageModel: "doubao-seedream-4-5-251128", imageResolution: "1K" } }, { projectId: "p", expectedRevision: project.revision, requestId: "one-generation" });
    let job = submission.job;
    const deadline = Date.now() + 15000;
    while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 25));
      job = (await call("job.get", { jobId: job.id })).job;
    }
    expect(job.error).toBeUndefined();
    expect(job.status).toBe("succeeded");
    // The suite supplies a real prebuilt helper; jobs must not cold-compile per server.
    await expect(stat(join(directory, "native"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(providerRequests).toHaveLength(1);
    expect(providerRequests[0].sequential_image_generation).toBe("disabled");
    expect(providerRequests[0].prompt).toContain("front paws together");
    const candidates = await call("state.candidates", { stateId: "sit" }, { projectId: "p" });
    expect(candidates.artifacts).toHaveLength(1);
    expect(candidates.artifacts[0]).toMatchObject({ sourceJobId: job.id, targetStateId: "sit", pixelWidth: 1024, pixelHeight: 1024, hasAlpha: true });
    const latest = await call("project.get", {}, { projectId: "p" });
    const approved = await call("state.approve", { stateId: "sit", artifactId: candidates.artifacts[0].id }, { projectId: "p", expectedRevision: latest.revision });
    expect(approved.project.initialVariantId).toBeTruthy();
    const replay = await call("state.generate", { stateId: "sit", settings: { imageProviderId: configured.id, imageModel: "doubao-seedream-4-5-251128", imageResolution: "1K" } }, { projectId: "p", expectedRevision: project.revision, requestId: "one-generation" });
    expect(replay.job.id).toBe(job.id);
    expect(providerRequests).toHaveLength(1);
  } finally {
    await api.close();
    await new Promise<void>(done => provider.close(() => done()));
    await rm(directory, { recursive: true, force: true });
  }
}, 20000);
