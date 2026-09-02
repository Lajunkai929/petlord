import { afterEach, describe, expect, it, vi } from "vitest";
import { createVolcengineArkProvider } from "./volcengineArk";
import type { StoredGenerationProviderConfiguration } from "./types";

function configuration(capability: "image" | "video"): StoredGenerationProviderConfiguration {
  return {
    id: `provider-${capability}`,
    type: "volcengine-ark",
    capability,
    name: `Ark ${capability}`,
    apiKey: "secret-key",
    baseUrl: "https://ark.example.com/api/v3",
    enabled: true,
    createdAt: "2026-09-03T00:00:00.000Z",
    updatedAt: "2026-09-03T00:00:00.000Z",
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("Volcengine Ark Provider adapters", () => {
  it("maps the provider-neutral image contract to Seedream", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({
      model: "doubao-seedream-5-0-260128",
      data: [{ url: "https://cdn.example.com/image.png" }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createVolcengineArkProvider(configuration("image"));
    if (provider.capability !== "image") throw new Error("Expected image Provider");
    const result = await provider.generate({
      model: "doubao-seedream-5-0-260128",
      prompt: "A small dog",
      referenceImages: ["data:image/png;base64,AA=="],
      resolution: "2K",
      candidateCount: 3,
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      size: "2k",
      image: ["data:image/png;base64,AA=="],
      sequential_image_generation: "auto",
      sequential_image_generation_options: { max_images: 3 },
      watermark: false,
    });
    expect(result.images[0]?.url).toBe("https://cdn.example.com/image.png");
  });

  it("maps the provider-neutral video contract to Seedance unified references", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ id: "cgt-test" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createVolcengineArkProvider(configuration("video"));
    if (provider.capability !== "video") throw new Error("Expected video Provider");
    await expect(provider.submit({
      model: "doubao-seedance-2-0-mini-260615",
      prompt: "The pet lies down",
      firstFrame: "data:image/png;base64,FIRST",
      lastFrame: "data:image/png;base64,LAST",
      identityReferences: ["data:image/png;base64,IDENTITY"],
      resolution: "480p",
      ratio: "1:1",
    })).resolves.toBe("cgt-test");
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({ return_last_frame: true, generate_audio: false, resolution: "480p", ratio: "1:1", watermark: false });
    expect(request).not.toHaveProperty("duration");
    expect(request.content[0]).toEqual({ type: "text", text: "The pet lies down" });
    expect(request.content.slice(1).every((item: { role: string }) => item.role === "reference_image")).toBe(true);
  });
});
