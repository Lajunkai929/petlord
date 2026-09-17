// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioController, type StudioController } from "./useStudioController";
import { createBlankIdentityProfile, createBlankProject } from "../projectTemplate";
import { useStateGenerationDialog } from "./useStateGenerationDialog";
import { resolveProjectGenerationContext } from "../generationContext";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; localStorage.clear(); vi.unstubAllGlobals(); });
async function mount(importFails = false, linkedWithStaleReferences = false) {
  localStorage.clear();
  const project = createBlankProject({ characterName: "独立宠物", customerName: "", contact: "", quotedPriceCny: 0, depositCny: 0, revisionLimit: 0, notes: "" });
  const unrelated = createBlankIdentityProfile("无关角色");
  unrelated.referenceArtifacts = [{ id: "unrelated", kind: "identity-reference", uri: "data:image/png;base64,Qg==", mimeType: "image/png", createdAt: project.updatedAt }];
  const chosen = createBlankIdentityProfile("选择角色"); chosen.referenceArtifacts = [{ ...unrelated.referenceArtifacts[0], id: "chosen", uri: "data:image/png;base64,Qw==" }];
  if (linkedWithStaleReferences) {
    const stale = { ...unrelated.referenceArtifacts[0], id: "old-local", uri: "data:image/png;base64,T0xE" };
    project.identityProfileId = chosen.id; project.referenceArtifactIds = [stale.id]; project.artifacts.push(stale);
  }
  const otherProject = { ...structuredClone(project), id: `project-${crypto.randomUUID()}`, name: "另一个项目" };
  let storedOtherProject = otherProject;
  let failProjectWrites = false;
  let projectWriteAttempts = 0;
  let storedProject = project; let revision = 1; const submissions: Array<{ trigger: { projectId: string }; [key: string]: unknown }> = []; const imports: Array<{ dataUrl: string }> = [];
  let nextProjectWrite: (() => Promise<boolean>) | undefined;
  function pauseNextProjectWrite(fail: boolean) {
    let release!: () => void; let started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const began = new Promise<void>(resolve => { started = resolve; });
    nextProjectWrite = async () => { started(); await pending; return fail; };
    return { started: began, release };
  }
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), "http://petlord.test").pathname;
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (path === "/api/providers") return json({ serviceAvailable: true, providers: [{ id: "fixture", type: "volcengine-ark", capability: "image", enabled: true, models: [{ id: project.generationSettings.imageModel, estimatedCostCny: 0.2 }] }], defaults: { image: "fixture" }, catalog: [] });
    if (path === "/api/media/import") { imports.push(JSON.parse(String(init?.body))); if (importFails) return json({ error: { message: "媒体保存失败" } }, 500); return json({ uri: "data:image/png;base64,QQ==", mimeType: "image/png" }); }
    if (path === "/api/jobs") {
      if (init?.method === "POST") { const body = JSON.parse(String(init.body)); submissions.push(body); return json({ ...body, id: body.jobId, status: "queued", createdAt: project.updatedAt }); }
      return json([]);
    }
    if (path === "/api/workspace/entities/project" && !init?.method) return json([{ data: storedProject, revision }, { data: storedOtherProject, revision }]);
    if (path === "/api/workspace/entities/identity" && !init?.method) return json([unrelated, chosen].map(data => ({ data, revision: 1 })));
    if (path.startsWith("/api/workspace/entities/") && init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      if (path.includes("/project/")) {
        if (body.data.id === project.id) {
          projectWriteAttempts++;
          const fails = failProjectWrites;
          const intercept = nextProjectWrite; nextProjectWrite = undefined;
          if ((intercept && await intercept()) || fails) return json({ error: { code: "SAVE_FAILED", message: "项目保存失败" } }, 500);
          storedProject = body.data;
        } else storedOtherProject = body.data;
      }
      return json({ data: body.data, revision: ++revision });
    }
    if (path.startsWith("/api/workspace/entities/")) return json([]);
    if (path === "/api/workspace/state/workspace-registry" && !init?.method) return json({ data: { activeProjectId: project.id, activeIdentityId: unrelated.id, projectIds: [project.id, otherProject.id] } });
    if (path.startsWith("/api/workspace/state/")) return json({ saved: true });
    throw new Error(`Unexpected request ${init?.method ?? "GET"} ${path}`);
  });
  let studio!: StudioController; let references: string[] = [];
  function Harness() {
    studio = useStudioController();
    const dialog = useStateGenerationDialog({ project: studio.project, state: studio.project.logicalStates[0], profiles: studio.styleLibrary.profiles, onGenerate: studio.generateStateImage });
    references = dialog.references.map(artifact => artifact.uri); return null;
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
  expect(studio.project.id).toBe(project.id);
  return { get studio() { return studio; }, get references() { return references; }, get storedProject() { return storedProject; }, get projectWriteAttempts() { return projectWriteAttempts; }, submissions, imports, chosen, unrelated, otherProject, pauseNextProjectWrite, failProjectWrites: (fails: boolean) => { failProjectWrites = fails; } };
}
it("uploads project-owned references then submits the actual generation HTTP payload in the same independent project", async () => {
  const test = await mount(); const id = test.studio.project.id;
  expect(test.studio.project.identityProfileId).toBeUndefined(); expect(test.references).toEqual([]);
  await act(async () => test.studio.saveProjectReferences({ kind: "upload", files: [new File(["A"], "pet.png", { type: "image/png" })] }));
  expect(test.imports[0].dataUrl).toBe("data:image/png;base64,QQ==");
  expect(test.studio.project.identityProfileId).toBeUndefined(); expect(test.references).toEqual(["data:image/png;base64,QQ=="]);
  await act(async () => test.studio.generateStateImage(test.studio.project.logicalStates[0].id, { throwOnFailure: true }));
  expect(test.submissions).toHaveLength(1);
  expect(test.submissions[0].trigger.projectId).toBe(id);
  expect(JSON.stringify(test.submissions[0])).toContain("data:image/png;base64,QQ==");
  expect(JSON.stringify(test.submissions[0])).not.toContain(test.unrelated.referenceArtifacts[0].uri);
  expect(resolveProjectGenerationContext(test.studio.exportSourceProject, [], []).identityReferences.map(a => a.uri)).toEqual(test.references);
});
it("links the explicitly chosen identity and supplies its live references to prompt preview and export", async () => {
  const test = await mount();
  await act(async () => test.studio.saveProjectReferences({ kind: "identity", identityId: test.chosen.id }));
  expect(test.studio.project.identityProfileId).toBe(test.chosen.id);
  expect(test.references).toEqual(test.chosen.referenceArtifacts.map(a => a.uri));
  expect(resolveProjectGenerationContext(test.studio.exportSourceProject, [], []).identityReferences.map(a => a.uri)).toEqual(test.references);
});
it("does not copy stale project snapshots back into a live identity during hydration", async () => {
  const test = await mount(false, true);
  expect(test.studio.identities.find(identity => identity.id === test.chosen.id)?.referenceArtifacts).toEqual(test.chosen.referenceArtifacts);
  expect(test.references).toEqual(["data:image/png;base64,Qw=="]);
  expect(test.studio.project.artifacts.some(artifact => artifact.id === "old-local")).toBe(true);
});

it("keeps existing project references intact when image import fails", async () => {
  const test = await mount(true);
  await act(async () => test.studio.saveProjectReferences({ kind: "identity", identityId: test.chosen.id }));
  const before = structuredClone(test.studio.project);
  await act(async () => { await expect(test.studio.saveProjectReferences({ kind: "upload", files: [new File(["A"], "pet.png", { type: "image/png" })] })).rejects.toThrow("媒体保存失败"); });
  expect(test.studio.project.identityProfileId).toBe(before.identityProfileId);
  expect(test.studio.project.referenceArtifactIds).toEqual(before.referenceArtifactIds);
  expect(test.studio.project.artifacts).toEqual(before.artifacts);
  expect(test.studio.busy).toBe(false);
});
it("reuses an uploaded approved state as a project reference while retaining state bindings", async () => {
  const test = await mount(); const stateId = test.studio.project.logicalStates[0].id;
  await act(async () => test.studio.uploadStateImage(stateId, new File(["A"], "state.png", { type: "image/png" })));
  const state = test.studio.project.logicalStates[0]; const variants = structuredClone(test.studio.project.variants);
  await act(async () => test.studio.saveProjectReferences({ kind: "state", stateId }));
  expect(test.studio.project.identityProfileId).toBeUndefined();
  expect(test.studio.project.referenceArtifactIds).toContain(state.referenceArtifactId);
  expect(test.studio.project.variants).toEqual(variants);
  expect(test.references).toEqual(["data:image/png;base64,QQ=="]);
});


it.each(["identity", "upload"] as const)("does not apply %s reference changes when project persistence fails", async kind => {
  const test = await mount();
  const before = structuredClone(test.studio.project);
  const gate = test.pauseNextProjectWrite(true);
  let saving!: Promise<void>;
  let failure!: Promise<void>;
  await act(async () => {
    saving = test.studio.saveProjectReferences(kind === "identity" ? { kind, identityId: test.chosen.id } : { kind, files: [new File(["A"], "pet.png", { type: "image/png" })] });
    failure = expect(saving).rejects.toThrow("项目保存失败");
    await gate.started;
  });
  // The proposed references must remain a dialog draft until the PUT succeeds.
  const during = { identity: test.studio.project.identityProfileId, references: test.references.slice() };
  await act(async () => test.studio.updateProject(current => ({ ...current, name: "保存期间的新名称" })));
  await act(async () => { gate.release(); await failure; });
  expect(during).toEqual({ identity: before.identityProfileId, references: [] });
  expect(test.studio.project.identityProfileId).toBe(before.identityProfileId);
  expect(test.studio.project.referenceArtifactIds).toEqual(before.referenceArtifactIds);
  expect(test.studio.project.artifacts).toEqual(before.artifacts);
  expect(test.studio.project.name).toBe("保存期间的新名称");
  expect(test.storedProject.identityProfileId).toBe(before.identityProfileId);
  expect(test.storedProject.referenceArtifactIds).toEqual(before.referenceArtifactIds);
  expect(test.studio.busy).toBe(false);
});

it("commits confirmed references while retaining edits made during the project PUT", async () => {
  const test = await mount(); const gate = test.pauseNextProjectWrite(false);
  let saving!: Promise<void>;
  await act(async () => { saving = test.studio.saveProjectReferences({ kind: "identity", identityId: test.chosen.id }); await gate.started; });
  const during = test.studio.project.identityProfileId;
  await act(async () => test.studio.updateProject(current => ({ ...current, name: "并发编辑保留" })));
  await act(async () => { gate.release(); await saving; });
  expect(during).toBeUndefined();
  expect(test.studio.project.identityProfileId).toBe(test.chosen.id);
  expect(test.studio.project.name).toBe("并发编辑保留");
  expect(test.storedProject.identityProfileId).toBe(test.chosen.id);
  expect(test.storedProject.name).toBe("并发编辑保留");
});


it("persists concurrent changes to the transaction project after switching to another project", async () => {
  const test = await mount(); const gate = test.pauseNextProjectWrite(false);
  let saving!: Promise<void>;
  await act(async () => { saving = test.studio.saveProjectReferences({ kind: "identity", identityId: test.chosen.id }); await gate.started; });
  await act(async () => test.studio.updateProject(current => ({ ...current, name: "A 项目的并发名称" })));
  await act(async () => test.studio.activateCustomerProject(test.otherProject.id));
  await act(async () => { gate.release(); await saving; });
  expect(test.studio.project.id).toBe(test.otherProject.id);
  expect(test.studio.project.identityProfileId).toBeUndefined();
  expect(test.storedProject.name).toBe("A 项目的并发名称");
  expect(test.storedProject.identityProfileId).toBe(test.chosen.id);
});

it("retains a failed follow-up project save and explicitly retries the original project from another project", async () => {
  const test = await mount(); const gate = test.pauseNextProjectWrite(false);
  let saving!: Promise<void>; let failure!: Promise<void>;
  await act(async () => {
    saving = test.studio.saveProjectReferences({ kind: "identity", identityId: test.chosen.id });
    failure = expect(saving).rejects.toThrow("项目保存失败");
    await gate.started;
  });
  await act(async () => test.studio.updateProject(current => ({ ...current, name: "A 待重试名称" })));
  await act(async () => test.studio.activateCustomerProject(test.otherProject.id));
  test.failProjectWrites(true);
  await act(async () => { gate.release(); await failure; });
  expect(test.studio.pendingProjectChangeError).toContain("A 待重试名称");
  expect(test.studio.workspaceStorageError).toContain("A 待重试名称");
  expect(test.studio.projects.find(project => project.id === test.storedProject.id)?.name).toBe("A 待重试名称");
  expect(test.storedProject.name).not.toBe("A 待重试名称");
  expect(test.storedProject.identityProfileId).toBe(test.chosen.id);
  await act(async () => test.studio.updateProject(current => ({ ...current, name: "B 项目继续编辑" })));
  expect(test.studio.pendingProjectChangeError).toContain("A 待重试名称");
  const failedAttempts = test.projectWriteAttempts;
  await act(async () => test.studio.retryPendingProjectChanges());
  expect(test.projectWriteAttempts).toBe(failedAttempts + 1);
  expect(test.studio.pendingProjectChangeError).toContain("A 待重试名称");
  test.failProjectWrites(false);
  await act(async () => test.studio.retryPendingProjectChanges());
  expect(test.storedProject.name).toBe("A 待重试名称");
  expect(test.storedProject.identityProfileId).toBe(test.chosen.id);
  expect(test.studio.project.id).toBe(test.otherProject.id);
  expect(test.studio.project.name).toBe("B 项目继续编辑");
  expect(test.studio.pendingProjectChangeError).toBeUndefined();
});
