// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ConfigProvider } from "@petlord/ui";
import { petLordAntdTheme } from "@petlord/ui";
import type { GenerationProviderConfiguration, GenerationProvidersSnapshot } from "@petlord/generation";
import { ProviderEditorDialog } from "./ProviderEditorDialog";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; });
const snapshot: GenerationProvidersSnapshot = { serviceAvailable: true, providers: [], defaults: {}, catalog: [{ id: "openai", type: "openai-compatible", label: "OpenAI", description: "图片生成", defaultBaseUrl: "https://api.openai.com/v1", capabilities: ["image"], models: { image: [{ id: "gpt-image-2", label: "GPT Image 2", description: "" }], video: [] } }], protocols: [{ id: "openai-compatible", label: "OpenAI Images", description: "图片协议", capabilities: ["image"] }] };
const existing: GenerationProviderConfiguration = { id: "saved", presetId: "other", type: "openai-compatible", capability: "image", name: "自定义服务", baseUrl: "https://proxy.example/v1", enabled: true, credentialHint: "•••• 1234", models: [{ id: "custom-pet-v2", label: "custom-pet-v2", description: "", estimatedUnitCostCny: .25 }], createdAt: "", updatedAt: "" };
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.replace(/\s/g, "") === name)!;
const input = (label: string) => document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
async function fill(label: string, value: string) { await act(async () => { const field = input(label); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function mount(provider?: GenerationProviderConfiguration) {
  const create = vi.fn().mockResolvedValue(existing), update = vi.fn().mockResolvedValue(existing), close = vi.fn();
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(h(ConfigProvider, { theme: { ...petLordAntdTheme("light"), token: { motion: false } } }, h(ProviderEditorDialog, { provider, snapshot, providers: { create, update }, onClose: close }))));
  return { create, update, close };
}
it("chooses a vendor before showing a form and cancels without saving", async () => {
  const result = await mount();
  expect(document.querySelector("form")).toBeNull();
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>(".provider-preset-option")].find(item => item.textContent?.includes("OpenAI"))!.click());
  expect(input("Base URL").value).toBe("https://api.openai.com/v1");
  expect(document.body.textContent).toContain("gpt-image-2");
  await fill("API Key", "temporary-private-key");
  await act(async () => button("取消").click());
  expect(result.create).not.toHaveBeenCalled(); expect(result.update).not.toHaveBeenCalled(); expect(result.close).toHaveBeenCalledWith();
});
it("keeps a failed edit open, retains the secret when blank and uses the custom model list", async () => {
  const result = await mount(existing);
  result.update.mockRejectedValueOnce(new Error("无法保存，请重试"));
  await fill("服务名称", "新的服务名称");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(result.close).not.toHaveBeenCalled(); expect(document.querySelector('[role="alert"]')?.textContent).toContain("无法保存");
  const payload = result.update.mock.calls[0][1];
  expect(payload).not.toHaveProperty("apiKey"); expect(payload).not.toHaveProperty("capability");
  expect(payload).toMatchObject({ name: "新的服务名称", models: existing.models });
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(result.close).toHaveBeenCalledWith(true);
});
it("keeps custom-provider validation errors next to the form and submits nothing", async () => {
  const result = await mount();
  await act(async () => document.querySelector<HTMLButtonElement>(".provider-preset-option.is-custom")!.click());
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(result.create).not.toHaveBeenCalled(); expect(document.querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(4);
  expect(input("服务名称").getAttribute("aria-invalid")).toBe("true");
});
