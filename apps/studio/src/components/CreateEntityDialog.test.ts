// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CreateEntityDialog } from "./CreateEntityDialog";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; });
const button = (name: string) => [...document.querySelectorAll("button")].find(item => item.textContent?.replace(/\s/g, "") === name)!;
async function mount(create: (name: string) => unknown) {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(h(CreateEntityDialog, { label: "新增形象", title: "新增形象", description: "给这个形象起一个名字。", fieldLabel: "形象名称", onCreate: create })));
}
async function name(value: string) {
  const input = document.querySelector<HTMLInputElement>('input[aria-label="形象名称"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
it("keeps creation out of the page and discards a cancelled name without creating an entity", async () => {
  const create = vi.fn(); await mount(create);
  expect(document.querySelector("form")).toBeNull();
  await act(async () => button("新增形象").click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await name("草稿形象");
  await act(async () => button("取消").click());
  expect(create).not.toHaveBeenCalled();
  await act(async () => button("新增形象").click());
  expect(document.querySelector<HTMLInputElement>("input")!.value).toBe("");
});
it("keeps errors in the dialog and closes only after a successful creation", async () => {
  const create = vi.fn().mockRejectedValueOnce(new Error("保存失败，请重试")).mockResolvedValueOnce("identity-id");
  await mount(create); await act(async () => button("新增形象").click());
  await name("  彩票  ");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(create).toHaveBeenCalledWith("彩票");
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("保存失败");
  expect(document.querySelector<HTMLInputElement>("input")!.value).toBe("  彩票  ");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
