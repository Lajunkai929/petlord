import { expect, it } from "vitest";
import type { GenerationProviderConfiguration, GenerationProvidersSnapshot } from "@petlord/generation";
import { providerModelSelection } from "./providerModelSelection";
const provider = (id: string, cost: number): GenerationProviderConfiguration => ({ id, type: "openai-compatible", capability: "image", name: id, baseUrl: "https://example.com/v1", enabled: true, credentialHint: "saved", createdAt: "now", updatedAt: "now", models: [{ id: "custom", label: "Custom", description: "", estimatedUnitCostCny: cost }] });
it("uses the explicitly selected provider or default without borrowing another provider's price", () => {
  const snapshot: GenerationProvidersSnapshot = { serviceAvailable: true, catalog: [], defaults: { image: "default" }, providers: [provider("default", 0.4), provider("chosen", 0.8), { ...provider("disabled", 0.1), enabled: false }] };
  expect(providerModelSelection(snapshot, "image")?.[0].estimatedUnitCostCny).toBe(0.4);
  expect(providerModelSelection(snapshot, "image", "chosen")?.[0].estimatedUnitCostCny).toBe(0.8);
  expect(providerModelSelection(snapshot, "image", "missing")).toBeUndefined();
  expect(providerModelSelection(snapshot, "image", "disabled")).toBeUndefined();
  expect(providerModelSelection(snapshot, "video", "chosen")).toBeUndefined();
});
