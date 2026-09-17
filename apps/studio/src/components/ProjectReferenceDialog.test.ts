// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { act, createElement as h, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ProjectReferenceDialog } from "./ProjectReferenceDialog";
import { applyProjectReferenceChange } from "../projectReferences";
import { activateAuthorityReference, createBlankIdentityProfile, createBlankProject } from "../projectTemplate";
import type { CharacterProject } from "@petlord/schema";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root; let saved: CharacterProject;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; });
const button = (name: string) => [...document.querySelectorAll("button")].find(item => item.textContent?.replace(/\s/g, "") === name)!;
const reference = { id: "image", kind: "state-actual" as const, uri: "data:image/png;base64,AAAA", mimeType: "image/png", createdAt: "2026-09-10T00:00:00Z" };
const chosen = createBlankIdentityProfile("可复用角色"); chosen.referenceArtifacts = [{ ...reference, id: "chosen-photo", label: "角色照片" }];
async function mount(fail = false) {
  let initial = createBlankProject({ characterName: "自己的宠物", customerName: "", contact: "", quotedPriceCny: 0, depositCny: 0, revisionLimit: 0, notes: "" });
  initial.artifacts.push(reference); initial = activateAuthorityReference(initial, initial.logicalStates[0].id, reference.id); saved = initial;
  function Harness() {
    const [project, setProject] = useState(initial);
    return h(ProjectReferenceDialog, { project, identities: [chosen], selection: { kind: "state", id: project.logicalStates[0].id }, onSave: async request => {
      if (fail) throw new Error("项目保存失败");
      if (request.kind === "upload") throw new Error("本用例未选择文件");
      saved = applyProjectReferenceChange(project, [chosen], request); setProject(saved);
    }});
  }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(h(Harness)));
}
async function choose(value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[type="radio"][value="${value}"]`)!;
  await act(async () => input.click());
}
async function submit() { await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
it("cancels without touching reference selection and saves a selected approved state in the same project", async () => {
  await mount(); const id = saved.id; const states = saved.logicalStates;
  await act(async () => button("配置参考图").click()); await choose("state");
  expect(document.querySelector('img[alt="当前状态参考图"]')?.getAttribute("src")).toBe(reference.uri);
  await act(async () => button("取消").click()); expect(saved.referenceArtifactIds).toEqual([]);
  await act(async () => button("配置参考图").click()); await choose("state"); await submit();
  expect(saved.id).toBe(id); expect(saved.logicalStates).toEqual(states); expect(saved.referenceArtifactIds).toEqual([reference.id]);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("requires explicit identity selection and previews its photos before linking", async () => {
  await mount(); await act(async () => button("配置参考图").click()); await choose("identity"); await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("请选择"); expect(saved.identityProfileId).toBeUndefined();
  await act(async () => document.querySelector(".ant-select")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  await act(async () => [...document.querySelectorAll<HTMLElement>(".ant-select-item-option")].find(item => item.textContent === chosen.name)!.click());
  expect(document.querySelector('img[alt="角色照片"]')?.getAttribute("src")).toBe(chosen.referenceArtifacts[0].uri);
  await submit(); expect(saved.identityProfileId).toBe(chosen.id);
});
it("keeps failed changes editable and supports Escape dismissal", async () => {
  await mount(true); await act(async () => button("配置参考图").click()); await choose("state"); await submit();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("项目保存失败");
  expect(saved.referenceArtifactIds).toEqual([]);
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
