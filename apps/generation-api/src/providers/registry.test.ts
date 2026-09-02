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
