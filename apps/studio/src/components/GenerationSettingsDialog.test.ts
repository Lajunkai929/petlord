// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "@petlord/ui";
import { petLordAntdTheme } from "@petlord/ui";
import type { GenerationProviderConfiguration, GenerationProvidersSnapshot } from "@petlord/generation";
import { seedProject } from "../seed";
import type { GenerationProvidersController } from "../hooks/useGenerationProviders";
import { GenerationSettingsDialog } from "./GenerationSettingsDialog";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; });
const provider = (id: string, enabled = true): GenerationProviderConfiguration => ({ id, type: "openai-compatible", capability: "image", name: `${id}服务`, baseUrl: "https://example.com/v1", enabled, credentialHint: "saved", createdAt: "", updatedAt: "", models: [{ id: `${id}-model`, label: `${id}模型`, description: "" }] });
async function mount(saved: GenerationProviderConfiguration[], model = "A-model") {
  const snapshot: GenerationProvidersSnapshot = { serviceAvailable: true, providers: saved, catalog: [], defaults: { image: "B" } };
  const onChange = vi.fn();
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(h(ConfigProvider, { theme: { ...petLordAntdTheme("light"), token: { motion: false } } }, h(GenerationSettingsDialog, { settings: { ...seedProject.generationSettings, imageResolution: "1K", imageProviderId: "A", imageModel: model }, providers: { snapshot, status: "online" } as GenerationProvidersController, onChange, onManageProviders: vi.fn() }))));
  await act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === "生成设置")!.click());
  return onChange;
}
const control = (id: string) => document.getElementById(id)!.closest(".pl-select-control")!;
it("keeps a deleted explicit connection visibly missing and lets the sole remaining provider be selected", async () => {
  const onChange = await mount([provider("B")]);
  const field = control("project-image-provider");
  expect(field.querySelector("select")?.value).toBe("A");
  expect(field.textContent).toContain("服务已删除");
  expect(control("image-model").querySelector("input")?.disabled).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => field.querySelector(".ant-select")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  const option = [...document.querySelectorAll<HTMLElement>(".ant-select-item-option")].find(item => item.textContent === "B服务");
  expect(option).toBeDefined();
  await act(async () => option!.click());
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageProviderId: "B", imageModel: "B-model" }));
});
it("shows an explicitly disabled connection and disables its model editor without silently switching", async () => {
  const onChange = await mount([provider("A", false), provider("B")]);
  expect(control("project-image-provider").querySelector("select")?.value).toBe("A");
  expect(control("project-image-provider").textContent).toContain("已停用");
  expect(control("image-model").querySelector("input")?.disabled).toBe(true);
  expect(onChange).not.toHaveBeenCalled();
});
it.each([
  ["Qwen/Qwen-Image", "1328 × 1328"],
  ["Qwen/Qwen-Image-Edit", "由模型决定"],
  ["Qwen/Qwen-Image-Edit-2509", "由模型决定"],
])("shows the effective SiliconFlow size for %s without offering ignored resolution settings", async (model, label) => {
  const onChange = await mount([{ ...provider("A"), type: "siliconflow", models: [{ id: model, label: model, description: "" }] }], model);
  const resolution = control("image-resolution");
  expect(resolution.querySelector("input")?.disabled).toBe(true);
  expect(resolution.textContent).toContain(label);
  expect(resolution.closest(".field-block")?.textContent).not.toContain("固定正方形 1:1");
  expect(onChange).not.toHaveBeenCalled();
});
it("uses the supported minimum resolution when choosing a Seedream 5 connection from a 1K project", async () => {
  const model = "doubao-seedream-5-0-260128";
  const onChange = await mount([{ ...provider("B"), type: "volcengine-ark", models: [{ id: model, label: model, description: "" }] }]);
  await act(async () => control("project-image-provider").querySelector(".ant-select")!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })));
  await act(async () => [...document.querySelectorAll<HTMLElement>(".ant-select-item-option")].find(item => item.textContent === "B服务")!.click());
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageProviderId: "B", imageModel: model, imageResolution: "2K" }));
});
