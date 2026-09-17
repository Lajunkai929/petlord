// @vitest-environment happy-dom
import { afterEach, it, expect } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { NewOrderDialog } from "../components/NewOrderDialog";
import { projectTemplates, createBlankIdentityProfile } from "../projectTemplate";
import { normalizeStyleProfile, type StyleProfile } from "../styleLibrary";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; });
async function fill(input: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function mount(withIdentity = false, styles: StyleProfile[] = [], rejectCreation = false) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const created: any[] = [];
  await act(async () => root.render(createElement(NewOrderDialog, { identities: withIdentity ? [createBlankIdentityProfile("现有宠物")] : [], styles, templates: [...projectTemplates], onCreate: input => { created.push(input); if (rejectCreation) return false; } })));
  await act(async () => host.querySelector("button")!.click());
  return created;
}
it("creates one ordinary project without an identity or production-route choice", async () => {
  const created = await mount();
  expect(document.querySelector('[aria-label="新项目制作路线"]')).toBeNull();
  await fill(document.querySelector('input[placeholder="例如 Lottery · 手绘治愈版"]')!, "我的宠物项目");
  await fill(document.querySelector('input[aria-label="宠物名称"]')!, "豆豆");
  const submit = document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  expect(submit.disabled).toBe(false);
  await act(async () => submit.click());
  expect(created[0]).toMatchObject({ projectName: "我的宠物项目", characterName: "豆豆" });
  expect(created[0]).not.toHaveProperty("productionRoute");
  expect(created[0].identityProfileId).toBeUndefined();
});
it("lets a new pet opt out of the previously selected reusable identity", async () => {
  const created = await mount(true);
  await selectIdentity("new");
  await fill(document.querySelector('input[aria-label="宠物名称"]')!, "独立的新宠物");
  await fill(document.querySelector('input[placeholder="例如 Lottery · 手绘治愈版"]')!, "独立项目");
  await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  expect(created[0]).toMatchObject({ characterName: "独立的新宠物" });
  expect(created[0].identityProfileId).toBeUndefined();
});
it("retargets inherited prompts when naming a new pet and detaching its style preset", async () => {
  const created = await mount(true, [normalizeStyleProfile({ id: "style", name: "描画", imagePrompt: "绘制 {{characterName}}，保留独特花纹。", videoPrompt: "{{characterName}} 慢慢转头。" })]);
  await selectIdentity("new");
  await fill(document.querySelector('input[aria-label="宠物名称"]')!, "新名字");
  await fill(document.querySelector('input[placeholder="例如 Lottery · 手绘治愈版"]')!, "新项目");
  const select = document.querySelector<HTMLSelectElement>('[data-field="style"] select')!;
  await act(async () => { select.value = "custom"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  expect(created[0].styleProfileId).toBeUndefined();
  expect(created[0].imageStylePrompt).toBe("绘制 新名字，保留独特花纹。");
  expect(created[0].videoStylePrompt).toBe("新名字 慢慢转头。");
});

async function selectIdentity(value: string) {
  const select = document.querySelector<HTMLSelectElement>('[data-field="identity"] select')!;
  expect(select).not.toBeNull();
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("exposes labeled native template radios and submits the selected template", async () => {
  const created = await mount(true);
  const radios = [...document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  expect(radios.length).toBe(projectTemplates.length);
  expect(new Set(radios.map(radio => radio.name)).size).toBe(1);
  const target = radios.find(radio => !radio.checked)!;
  await act(async () => target.click());
  expect(target.checked).toBe(true);
  await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  expect(created[0].projectTemplateId).toBe(target.value);
});
it("keeps entered values after a rejected creation and cancels without another creation", async () => {
  const created = await mount(true, [], true);
  expect(document.querySelector<HTMLInputElement>('input[aria-label="宠物名称"]')!.disabled).toBe(true);
  await fill(document.querySelector('input[placeholder="例如 Lottery · 手绘治愈版"]')!, "保留的项目");
  await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')!.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector<HTMLInputElement>('input[placeholder="例如 Lottery · 手绘治愈版"]')!.value).toBe("保留的项目");
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.replace(/\s/g, "") === "取消")!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(created).toHaveLength(1);
});
