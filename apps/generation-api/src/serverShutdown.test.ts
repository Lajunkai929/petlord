import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { it, expect } from "vitest";
import { startPetLordServer } from "./appServer";

it("cancels an active provider poll and resumes the recorded task after restart without resubmitting", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-shutdown-"));
  let submits = 0, polls = 0;
  let onPoll!: () => void;
  const polled = new Promise<void>(resolve => { onPoll = resolve; });
  const provider = createServer(async (request, response) => {
    for await (const _bytes of request) { /* consume request */ }
    response.setHeader("Content-Type", "application/json");
    if (request.method === "POST") { submits++; response.end(JSON.stringify({ id: "recorded-task" })); }
    else { polls++; if (polls === 1) onPoll(); else response.end(JSON.stringify({ id: "recorded-task", status: "failed", error: { message: "fixture complete" } })); }
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${(provider.address() as {port:number}).port}`;
  let api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory });
  try {
    const configured = await (await fetch(api.url + "/api/providers", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ type: "volcengine-ark", capability: "video", name: "fixture", apiKey: "fixture-token", baseUrl: origin, enabled: true, models: [{ id: "doubao-seedance-1-5-pro-251215", label: "Shutdown fixture video", description: "Isolated poll recovery fixture", estimatedUnitCostCny: 0.1 }] }) })).json() as any;
    const providerId = configured.provider?.id ?? configured.id;
    const posted = await fetch(api.url + "/api/jobs", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ id: "99999999-9999-4999-a999-999999999999", kind: "transition-video", model: "doubao-seedance-1-5-pro-251215", capability: "video", providerId, trigger: { projectId: "fixture", entityType: "transition", entityId: "t", label: "Fixture" }, request: { model: "doubao-seedance-1-5-pro-251215", prompt: "test", firstFrame: "data:image/png;base64,fixture", lastFrame: "data:image/png;base64,fixture", identityReferences: [], resolution: "480p", ratio: "1:1", durationSeconds: 4 } }) });
    expect(posted.status, await posted.text()).toBe(202);
    await polled;
    const start = Date.now();
    await api.close();
    expect(Date.now() - start).toBeLessThan(1500);
    api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory });
    const until = Date.now() + 1500;
    while (polls < 2 && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 10));
    expect(submits).toBe(1);
    expect(polls).toBe(2);
    const jobs = await (await fetch(api.url + "/api/jobs")).json() as any;
    expect(JSON.stringify(jobs)).toContain("recorded-task");
  } finally {
    await api.close();
    provider.closeAllConnections();
    await new Promise<void>(resolve => provider.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}, 10000);
