import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { startPetLordServer } from "./appServer";

it("reserves uncertain failed costs, checks both retry entry points and replays one paid retry", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-retry-budget-"));
  let requests = 0;
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume request */ }
    requests++; response.writeHead(500, {"Content-Type":"application/json"}); response.end(JSON.stringify({ error: { message: "uncertain fixture failure" } }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const api = await startPetLordServer({ port: 0, runtimeDataDirectory: directory });
  let number = 0;
  async function call(command: string, input: unknown = {}, options: object = {}) {
    return (await fetch(api.url + "/api/design/v1/execute", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ command, input, requestId: `budget-${++number}`, ...options }) })).json() as Promise<any>;
  }
  async function failedJob(jobId: string) {
    for (let i = 0; i < 100; i++) { const job = (await call("job.get", {jobId})).result.job; if (job.status === "failed") return job; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error("Job did not fail within fixture deadline.");
  }
  try {
    const p = (await call("provider.create", { type: "volcengine-ark", capability: "image", name: "fixture", apiKey: "fixture-token", baseUrl: `http://127.0.0.1:${(provider.address() as {port:number}).port}` })).result;
    let current = (await call("project.create", { id: "p", name: "p", characterName: "p" })).result;
    current = (await call("state.create", {id:"sit", label:"Sit"}, {projectId:"p",expectedRevision:current.revision})).result;
    const submitted = (await call("state.generate", {stateId:"sit", settings:{imageProviderId:p.id,imageModel:"doubao-seedream-4-5-251128"}}, {projectId:"p",expectedRevision:current.revision})).result.job;
    const job = await failedJob(submitted.id), estimate = job.cost.estimatedMaxCny;
    current = (await call("project.get", {}, {projectId:"p"})).result;
    current = (await call("project.update", {patch:{generationBudgetCny:estimate * 1.5}}, {projectId:"p",expectedRevision:current.revision})).result;
    expect((await call("job.retry", {jobId:job.id})).error.code).toBe("BUDGET_EXCEEDED");
    const legacy = await fetch(`${api.url}/api/jobs/${job.id}/retry`, {method:"POST"});
    expect((await legacy.json() as any).error.code).toBe("BUDGET_EXCEEDED");
    expect(requests).toBe(1);
    current = (await call("project.update", {patch:{generationBudgetCny:estimate * 4}}, {projectId:"p",expectedRevision:current.revision})).result;
    const retry = await call("job.retry", {jobId:job.id}, {requestId:"one-retry"});
    expect(retry.error).toBeUndefined();
    const retried = await failedJob(job.id);
    expect(retried.cost.priorAttemptsReservedCny).toBe(estimate);
    expect(await call("job.retry", {jobId:job.id}, {requestId:"one-retry"})).toEqual(retry);
    expect(requests).toBe(2);
  } finally { await api.close(); provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); await rm(directory,{recursive:true,force:true}); }
});
