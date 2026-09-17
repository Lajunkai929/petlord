import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationProviderRegistry } from "./registry";
import type { GenerationProviderConfigurationStore, StoredGenerationProviderConfiguration } from "./types";

class MemoryProviderStore implements GenerationProviderConfigurationStore {
  readonly values = new Map<string, StoredGenerationProviderConfiguration>();

  listGenerationProviders() {
    return [...this.values.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  getGenerationProvider(id: string) {
    return this.values.get(id);
  }

  upsertGenerationProvider(configuration: StoredGenerationProviderConfiguration) {
    this.values.set(configuration.id, configuration);
  }

  deleteGenerationProvider(id: string) {
    this.values.delete(id);
  }
}

describe("generation Provider registry", () => {
  let store: MemoryProviderStore;
  let registry: GenerationProviderRegistry;

  beforeEach(() => {
    store = new MemoryProviderStore();
    registry = new GenerationProviderRegistry(store);
  });

  it("stores image and video Providers separately and never exposes API keys", () => {
    const image = registry.create({
      type: "volcengine-ark",
      capability: "image",
      name: "Primary images",
      apiKey: "image-secret-key",
      baseUrl: "https://ark.example.com/api/v3/",
      enabled: true,
    });
    const video = registry.create({
      type: "volcengine-ark",
      capability: "video",
      name: "Primary video",
      apiKey: "video-secret-key",
      baseUrl: "https://ark.example.com/api/v3",
      enabled: true,
    });

    const snapshot = registry.snapshot();
    expect(snapshot.defaults).toEqual({ image: image.id, video: video.id });
    expect(snapshot.providers).toEqual([
      expect.objectContaining({ id: image.id, capability: "image", credentialHint: "•••• -key" }),
      expect.objectContaining({ id: video.id, capability: "video", credentialHint: "•••• -key" }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("image-secret-key");
    expect(JSON.stringify(snapshot)).not.toContain("video-secret-key");
    expect(store.getGenerationProvider(image.id)?.baseUrl).toBe("https://ark.example.com/api/v3");
  });

  it("keeps the existing credential when an edit omits apiKey", () => {
    const created = registry.create({
      type: "volcengine-ark",
      capability: "image",
      name: "Images",
      apiKey: "original-secret",
      baseUrl: "https://ark.example.com/api/v3",
      enabled: true,
    });
    registry.update(created.id, { name: "Renamed images" });
    expect(store.getGenerationProvider(created.id)).toMatchObject({ name: "Renamed images", apiKey: "original-secret" });
  });

  it("validates a saved credential through the Provider runtime", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const created = registry.create({
      type: "volcengine-ark",
      capability: "video",
      name: "Video",
      apiKey: "connection-secret",
      baseUrl: "https://ark.example.com/api/v3",
      enabled: true,
    });

    await expect(registry.test(created.id)).resolves.toEqual({ ok: true, message: "Provider connection verified." });
    expect(fetchMock).toHaveBeenCalledWith("https://ark.example.com/api/v3/models", expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer connection-secret" }),
    }));
    vi.unstubAllGlobals();
  });
});

it("persists a vendor identity, custom models and protocol edits while blank keys preserve the secret", () => {
  const store = new MemoryProviderStore(), registry = new GenerationProviderRegistry(store);
  const models = [{ id: "team/custom-v2", label: "My model", description: "Private endpoint" }];
  const saved = registry.create({ type: "openai-compatible", presetId: "other", capability: "image", name: "Custom", baseUrl: "https://example.com/v1", apiKey: "original-secret", models });
  expect(saved).toMatchObject({ presetId: "other", models });
  const updated = registry.update(saved.id, { type: "siliconflow", apiKey: "   ", models: [{ ...models[0], id: "team/next" }] });
  expect(updated).toMatchObject({ type: "siliconflow", models: [{ id: "team/next" }] });
  expect(store.getGenerationProvider(saved.id)?.apiKey).toBe("original-secret");
  expect(new GenerationProviderRegistry(store).snapshot().providers[0]).toEqual(updated);
  expect(() => registry.resolve("image", saved.id).validateRequest({ model: "team/custom-v2", prompt: "pet", referenceImages: [], resolution: "1K", candidateCount: 1 })).toThrow(/model/i);
  expect(() => registry.resolve("image", saved.id).validateRequest({ model: "team/next", prompt: "pet", referenceImages: [], resolution: "1K", candidateCount: 1 })).not.toThrow();
});

it("keeps legacy Ark metadata and credentials untouched and exposes only real protocol capabilities", () => {
  const store = new MemoryProviderStore();
  const legacy: StoredGenerationProviderConfiguration = { id: "old", type: "volcengine-ark", capability: "video", name: "Existing", baseUrl: "https://existing.example/v3/", apiKey: "existing-secret", enabled: true, createdAt: "2026-01-01", updatedAt: "2026-01-01" };
  store.upsertGenerationProvider(legacy);
  const registry = new GenerationProviderRegistry(store);
  expect(registry.snapshot().providers[0].models.length).toBeGreaterThan(0);
  expect(store.getGenerationProvider("old")).toEqual(legacy);
  expect(registry.snapshot().protocols).toEqual(expect.arrayContaining([expect.objectContaining({ id: "openai-compatible", capabilities: ["image"] }), expect.objectContaining({ id: "siliconflow", capabilities: ["image"] })]));
  expect(() => registry.update("old", { type: "openai-compatible" })).toThrow(/capability|video/i);
  expect(store.getGenerationProvider("old")).toEqual(legacy);
});

it("rejects unsafe URLs and invalid model edits atomically", () => {
  const registry = new GenerationProviderRegistry(new MemoryProviderStore());
  const input = { type: "volcengine-ark" as const, capability: "image" as const, name: "Images", apiKey: "original-secret", baseUrl: "https://example.com/v1" };
  for (const baseUrl of ["https://user:password@example.com/v1", "https://example.com/v1#secret", "https://example.com/v1?key=secret", "http://example.com/v1"]) expect(() => registry.create({ ...input, baseUrl })).toThrow();
  const saved = registry.create(input);
  expect(() => registry.update(saved.id, { name: "Changed", models: [] })).toThrow();
  expect(() => registry.update(saved.id, { models: [{ id: "a", label: "A", description: "" }, { id: "a", label: "A", description: "" }] })).toThrow();
  expect(registry.getPublic(saved.id)?.name).toBe("Images");
});

it("preserves the configured models when changing protocols without replacing the model list", () => {
  const store = new MemoryProviderStore(), registry = new GenerationProviderRegistry(store);
  const models = [{ id: "private/endpoint", label: "Private", description: "" }];
  const saved = registry.create({ type: "volcengine-ark", capability: "image", name: "Original", baseUrl: "https://example.com/v1", apiKey: "fixture-secret", models });
  const next = registry.update(saved.id, { type: "openai-compatible" });
  expect(next?.models).toEqual(models);
});

it("does not change a legacy endpoint during a name-only edit or a failed key replacement", () => {
  const store = new MemoryProviderStore(), registry = new GenerationProviderRegistry(store);
  const saved = registry.create({ type: "volcengine-ark", capability: "image", name: "Original", baseUrl: "https://example.com/v1", apiKey: "fixture-secret" });
  const legacy = { ...store.getGenerationProvider(saved.id)!, baseUrl: "https://example.com/v1/", models: undefined };
  store.upsertGenerationProvider(legacy);
  expect(() => registry.update(saved.id, { apiKey: "short", name: "Invalid" })).toThrow();
  expect(store.getGenerationProvider(saved.id)).toEqual(legacy);
  registry.update(saved.id, { name: "Renamed" });
  expect(store.getGenerationProvider(saved.id)?.baseUrl).toBe(legacy.baseUrl);
  expect(store.getGenerationProvider(saved.id)?.apiKey).toBe(legacy.apiKey);
});
