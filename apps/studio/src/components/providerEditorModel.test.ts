import { expect, it } from "vitest";
import { buildProviderInput, editProviderDraft, newProviderDraft, providerDraftErrors } from "./providerEditorModel";
import type { GenerationProviderConfiguration, GenerationProvidersSnapshot } from "@petlord/generation";
const snapshot = { serviceAvailable: true, providers: [], defaults: {}, catalog: [{ id: "openai", type: "openai-compatible", label: "OpenAI", description: "Images", defaultBaseUrl: "https://api.openai.com/v1", capabilities: ["image"], models: { image: [{ id: "gpt-image-2", label: "GPT Image 2", description: "" }], video: [] } }], protocols: [{ id: "openai-compatible", label: "OpenAI Images", description: "", capabilities: ["image"] }, { id: "volcengine-ark", label: "Ark", description: "", capabilities: ["image", "video"] }] } as GenerationProvidersSnapshot;
it("seeds a vendor preset but leaves Other fully editable with an empty model list", () => {
  expect(newProviderDraft(snapshot, "openai")).toMatchObject({ presetId: "openai", type: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "", modelIds: ["gpt-image-2"] });
  expect(newProviderDraft(snapshot, "other")).toMatchObject({ presetId: "other", name: "", baseUrl: "", modelIds: [] });
});
it("preserves a saved key on edit and passes custom model IDs through without replacing metadata", () => {
  const saved = { id: "provider", type: "openai-compatible", capability: "image", name: "My proxy", baseUrl: "https://proxy.example/v1", credentialHint: "•••• 1234", enabled: true, models: [{ id: "custom/image-v9", label: "我的模型", description: "代理部署" }], createdAt: "", updatedAt: "" } as GenerationProviderConfiguration;
  const draft = editProviderDraft(saved);
  expect(draft.apiKey).toBe("");
  const input = buildProviderInput({ ...draft, modelIds: [" custom/image-v9 ", "new-model"] }, saved);
  expect(input).not.toHaveProperty("apiKey");
  expect(input.models).toEqual([saved.models[0], { id: "new-model", label: "new-model", description: "" }]);
  expect(buildProviderInput({ ...draft, apiKey: " replacement-key " }, saved).apiKey).toBe("replacement-key");
});
it("validates blank fields, wrong protocol capability and unsafe URL credentials before submission", () => {
  const draft = newProviderDraft(snapshot, "other");
  expect(Object.keys(providerDraftErrors(draft, snapshot)).sort()).toEqual(["apiKey", "baseUrl", "modelIds", "name"]);
  expect(providerDraftErrors({ ...draft, name: "Provider", apiKey: "secret-key", baseUrl: "https://user:pass@example.com/v1", modelIds: ["custom"], capability: "video", type: "openai-compatible" }, snapshot)).toHaveProperty("type");
  expect(providerDraftErrors({ ...draft, baseUrl: "https://user:pass@example.com/v1" }, snapshot)).toHaveProperty("baseUrl");
});

it("keeps the price entered against a padded tag when saving the trimmed model ID", () => {
  const draft = { ...newProviderDraft(snapshot, "other"), name: "Custom", apiKey: "fixture-secret", baseUrl: "https://example.com/v1", modelIds: [" custom-v1 "], modelPrices: { " custom-v1 ": 0.25 } };
  expect(providerDraftErrors(draft, snapshot)).toEqual({});
  expect(buildProviderInput(draft).models).toEqual([{ id: "custom-v1", label: "custom-v1", description: "", estimatedUnitCostCny: 0.25 }]);
});
it("rejects duplicate normalized model IDs instead of silently choosing one price", () => {
  const draft = { ...newProviderDraft(snapshot, "other"), name: "Custom", apiKey: "fixture-secret", baseUrl: "https://example.com/v1", modelIds: ["custom-v1", " custom-v1 "], modelPrices: { "custom-v1": 0.25, " custom-v1 ": 0.75 } };
  expect(providerDraftErrors(draft, snapshot).modelIds).toContain("重复");
  expect(() => buildProviderInput(draft)).toThrow(/重复/);
});
it("uses the normalized existing price for a padded tag and validates that same price", () => {
  const draft = { ...newProviderDraft(snapshot, "other"), name: "Custom", apiKey: "fixture-secret", baseUrl: "https://example.com/v1", modelIds: [" custom-v1 "], modelPrices: { "custom-v1": 0.5 } };
  expect(buildProviderInput(draft).models?.[0].estimatedUnitCostCny).toBe(0.5);
  expect(providerDraftErrors({ ...draft, modelPrices: { "custom-v1": -1 } }, snapshot).modelIds).toContain("预估费用");
});
