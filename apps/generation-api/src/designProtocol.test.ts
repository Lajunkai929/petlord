import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startPetLordServer } from "./appServer";
import { decodeInstalledPackage } from "./installedPackages";

const close: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of close.splice(0).reverse()) await fn(); });
async function setup(installPackage?: (contents: Uint8Array) => Promise<unknown>) {
  const dir = await mkdtemp(join(tmpdir(), "petlord-protocol-"));
  close.push(() => rm(dir, { recursive: true, force: true }));
  const server = await startPetLordServer({ port: 0, runtimeDataDirectory: dir, authToken: "test-protocol-token-123456789", installPackage });
  close.push(() => server.close());
  const headers = { Authorization: "Bearer test-protocol-token-123456789", "Content-Type": "application/json" };
  let sequence = 0;
  const invoke = async (command: string, input: unknown = {}, extra: object = {}) => {
    const response = await fetch(server.url + "/api/design/v1/execute", { method: "POST", headers, body: JSON.stringify({ requestId: `request-${++sequence}`, command, input, ...extra }) });
    return { status: response.status, body: await response.json() as any };
  };
  return { ...server, headers, invoke };
}

describe("agent design HTTP protocol", () => {
  it("freezes shared identity references and style into both exported and installed source packages", async () => {
    let installed: Uint8Array | undefined;
    const api = await setup(async bytes => { installed = bytes; return {key:"test.petlord"}; });
    let current = (await api.invoke("pixel.example.create",{id:"portable"})).body.result;
    const photo = current.project.artifacts[0];
    expect((await api.invoke("identity.create",{id:"shared-identity",name:"Shared Lottery",identityPrompt:"Specific markings",referenceArtifacts:[photo]})).status).toBe(200);
    expect((await api.invoke("style.create",{id:"shared-style",name:"Warm",imagePrompt:"Fixed image palette",videoPrompt:"Stable animation palette"})).status).toBe(200);
    current = (await api.invoke("project.update",{patch:{identityProfileId:"shared-identity",styleProfileId:"shared-style"}},{projectId:"portable",expectedRevision:current.revision})).body.result;
    const exported = await api.invoke("package.export",{},{projectId:"portable"});
    expect(exported.status,JSON.stringify(exported.body)).toBe(200);
    const downloaded = new Uint8Array(await (await fetch(api.url+exported.body.result.downloadPath,{headers:api.headers})).arrayBuffer());
    const result = await api.invoke("package.install",{},{projectId:"portable",expectedRevision:current.revision});
    expect(result.status,JSON.stringify(result.body)).toBe(200);
    for (const bytes of [downloaded,installed!]) {
      const source = decodeInstalledPackage(bytes).sourceProject!;
      expect(source).toMatchObject({characterName:"Shared Lottery",identityPrompt:"Specific markings",imageStylePrompt:"Fixed image palette",videoStylePrompt:"Stable animation palette"});
      expect(source.identityProfileId).toBeUndefined();
      expect(source.styleProfileId).toBeUndefined();
      expect(source.referenceArtifactIds).toEqual([photo.id]);
      expect(source.artifacts.find(a=>a.id===photo.id)?.uri).toMatch(/^asset:\/\//);
    }
  });
  it("creates an offline Lottery example and saves/reuses its state template and shared style", async () => {
    const api = await setup();
    const made = await api.invoke("pixel.example.create", { id: "offline" });
    expect(made.status, JSON.stringify(made.body.error)).toBe(200);
    expect(made.body.result.project).not.toHaveProperty("productionRoute");
    expect(made.body.result.project.logicalStates).toHaveLength(4);
    expect(made.body.result.project.transitions).toHaveLength(6);
    expect((await api.invoke("project.inspect", {}, { projectId: "offline" })).body.result.exportable).toBe(true);
    const saved = await api.invoke("template.save", { name: "My pet behaviors" }, { projectId: "offline" });
    expect(saved.status, JSON.stringify(saved.body.error)).toBe(200);
    const copy = await api.invoke("project.create", { name: "Another dog", characterName: "Dog", templateId: saved.body.result.data.id });
    expect(copy.body.result.project.logicalStates).toHaveLength(4);
    expect(copy.body.result.project.artifacts).toHaveLength(0);
    const style = await api.invoke("style.create", { id: "s", name: "Earth", imagePrompt: "warm palette", videoPrompt: "steady animation" });
    expect(style.status).toBe(200);
    const updated = await api.invoke("style.update", { styleId: "s", patch: { name: "Warm" } }, { expectedRevision: style.body.result.revision });
    expect(updated.body.result.data).toMatchObject({ name: "Warm", imagePrompt: "warm palette", videoPrompt: "steady animation", experimentBudgetCny: 30 });
    expect((await api.invoke("style.delete", { styleId: "s" }, { expectedRevision: style.body.result.revision })).status).toBe(409);
    expect((await api.invoke("style.delete", { styleId: "s" }, { expectedRevision: updated.body.result.revision })).status).toBe(200);
  });
  it("discovers typed commands and creates a project without UI initialization", async () => {
    const api = await setup();
    const response = await fetch(api.url + "/api/design/v1/commands", { headers: api.headers });
    expect(response.status).toBe(200);
    const catalog = await response.json() as any;
    expect(catalog).toMatchObject({ protocolVersion: 1 });
    expect(catalog.commands.map((c: any) => c.name)).toEqual(expect.arrayContaining(["project.create", "state.create", "state.generate", "transition.generate", "job.get", "package.export"]));
    const created = await api.invoke("project.create", { id: "lottery", name: "彩票", characterName: "彩票" });
    expect(created.status).toBe(200);
    expect(created.body.result).toMatchObject({ project: { id: "lottery", logicalStates: [] } });
    expect(created.body.result.revision).toBeGreaterThan(0);
    const read = await api.invoke("project.get", {}, { projectId: "lottery" });
    expect(read.body.result).toEqual(created.body.result);
  });

  it("replays a successful mutation and reports reused IDs and stale edits explicitly", async () => {
    const api = await setup();
    const create = { id: "p", name: "pet", characterName: "pet" };
    const first = await api.invoke("project.create", create, { requestId: "same" });
    const replay = await api.invoke("project.create", create, { requestId: "same" });
    expect(replay.body).toEqual(first.body);
    const reused = await api.invoke("project.create", { ...create, name: "changed" }, { requestId: "same" });
    expect(reused).toMatchObject({ status: 409, body: { error: { code: "REQUEST_ID_REUSED" } } });
    const revision = first.body.result.revision;
    const edit = await api.invoke("state.create", { id: "sit", label: "坐着" }, { projectId: "p", expectedRevision: revision });
    expect(edit.body.result.project.logicalStates).toHaveLength(1);
    const stale = await api.invoke("state.create", { id: "rest", label: "趴着" }, { projectId: "p", expectedRevision: revision });
    expect(stale).toMatchObject({ status: 409, body: { error: { code: "REVISION_CONFLICT" } } });
    const noRevision = await api.invoke("state.create", { label: "unknown" }, { projectId: "p" });
    expect(noRevision).toMatchObject({ status: 409, body: { error: { code: "REVISION_REQUIRED" } } });
  });

  it("imports a candidate, approves its state and exports a portable pet using commands only", async () => {
    const api = await setup();
    let current = (await api.invoke("project.create", { id: "p", name: "Lottery", characterName: "Lottery" })).body.result;
    current = (await api.invoke("state.create", { id: "sit", label: "坐着" }, { projectId: "p", expectedRevision: current.revision })).body.result;
    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG3kAAAAASUVORK5CYII=";
    const imported = await api.invoke("media.import", { dataUrl: png, stateId: "sit", label: "sit candidate" }, { projectId: "p", expectedRevision: current.revision });
    expect(imported.status).toBe(200);
    current = imported.body.result;
    const candidate = current.value.artifact;
    expect(candidate).toMatchObject({ kind: "state-draft", targetStateId: "sit", mimeType: "image/png" });
    current = (await api.invoke("state.approve", { stateId: "sit", artifactId: candidate.id }, { projectId: "p", expectedRevision: current.revision })).body.result;
    expect(current.project.initialVariantId).toBeTruthy();
    const exported = await api.invoke("package.export", {}, { projectId: "p" });
    expect(exported.status).toBe(200);
    const download = await fetch(new URL(exported.body.result.downloadPath, api.url), { headers: api.headers });
    expect(download.status).toBe(200);
    expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });

  it("returns actionable input errors instead of silently stripping unknown settings", async () => {
    const api = await setup();
    const made = await api.invoke("project.create", { id: "p", name: "pet", characterName: "pet" });
    const bad = await api.invoke("project.update", { patch: { generationBugetCny: 10 } }, { projectId: "p", expectedRevision: made.body.result.revision });
    expect(bad).toMatchObject({ status: 400, body: { error: { code: "INVALID_INPUT", details: expect.any(Array) } } });
    expect((await api.invoke("unknown.command"))).toMatchObject({ status: 400, body: { error: { code: "UNKNOWN_COMMAND" } } });
  });
});
