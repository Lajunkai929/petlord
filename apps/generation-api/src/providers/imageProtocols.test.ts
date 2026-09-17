import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, expect, it } from "vitest";
import { GenerationProviderRegistry } from "./registry";
import type { GenerationProviderConfigurationStore, StoredGenerationProviderConfiguration } from "./types";

let baseUrl = "", status = 200, payload: unknown, wire: Array<{ path: string; method: string; body: any; authorization: string }>;
let server: ReturnType<typeof createServer>, png: string;
beforeEach(async () => {
  png = (await readFile("apps/studio/public/demo/pip/state-sitting.png")).toString("base64");
  status = 200; payload = { data: [{ b64_json: png }] }; wire = [];
  server = createServer(async (request, response) => {
    let text = ""; for await (const chunk of request) text += chunk;
    wire.push({ path: request.url!, method: request.method!, body: text ? JSON.parse(text) : undefined, authorization: request.headers.authorization! });
    response.writeHead(status, { "Content-Type": "application/json" }); response.end(typeof payload === "string" ? payload : JSON.stringify(payload));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
});
afterEach(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
function runtime(type: "openai-compatible" | "siliconflow" | "volcengine-ark", model = "custom/image-v2", capability: "image" | "video" = "image") {
  const values = new Map<string, StoredGenerationProviderConfiguration>();
  const store: GenerationProviderConfigurationStore = { listGenerationProviders: () => [...values.values()], getGenerationProvider: id => values.get(id), upsertGenerationProvider: value => { values.set(value.id, value); }, deleteGenerationProvider: id => { values.delete(id); } };
  const registry = new GenerationProviderRegistry(store);
  const saved = registry.create({ type, capability, name: "Fixture", apiKey: "fixture-secret-key", baseUrl, models: [{ id: model, label: model, description: "" }] });
  return registry.resolve(capability, saved.id);
}
const request = (referenceImages: string[] = [], model = "custom/image-v2") => ({ model, prompt: "A pet", referenceImages, resolution: "1K", candidateCount: 1 });

it("uses OpenAI JSON generations without references and image edits with every reference", async () => {
  const provider = runtime("openai-compatible"); if (provider.capability !== "image") throw new Error("image expected");
  expect((await provider.generate(request())).images).toEqual([{ dataUrl: `data:image/png;base64,${png}` }]);
  const refs = [`data:image/png;base64,${png}`, "https://example.com/reference.png"];
  await provider.generate(request(refs));
  expect(wire.map(value => value.path)).toEqual(["/v1/images/generations", "/v1/images/edits"]);
  expect(wire[0].body).toEqual({ model: "custom/image-v2", prompt: "A pet", n: 1, size: "1024x1024" });
  expect(wire[1].body).toEqual({ ...wire[0].body, images: refs.map(image_url => ({ image_url })) });
  expect(wire.every(value => value.authorization === "Bearer fixture-secret-key")).toBe(true);
});
it("uses SiliconFlow named reference fields and explicit size without losing custom IDs", async () => {
  payload = { images: [{ url: "https://example.com/generated.png" }] };
  const provider = runtime("siliconflow"); if (provider.capability !== "image") throw new Error("image expected");
  const refs = [`data:image/png;base64,${png}`, "https://example.com/two.png", "https://example.com/three.png"];
  expect((await provider.generate(request(refs))).images).toEqual([{ url: "https://example.com/generated.png" }]);
  expect(wire[0].body).toEqual({ model: "custom/image-v2", prompt: "A pet", image_size: "1024x1024", image: refs[0], image2: refs[1], image3: refs[2] });
  await expect(provider.generate(request([...refs, refs[0]]))).rejects.toThrow(/3|three/i);
});
it("omits unsupported size for the documented Qwen edit models and repeats requests for candidates", async () => {
  payload = { images: [{ url: "https://example.com/generated.png" }] };
  const provider = runtime("siliconflow", "Qwen/Qwen-Image-Edit-2509"); if (provider.capability !== "image") throw new Error("image expected");
  const result = await provider.generate({ ...request([`data:image/png;base64,${png}`], "Qwen/Qwen-Image-Edit-2509"), candidateCount: 2 });
  expect(wire).toHaveLength(2); expect(wire[0].body).not.toHaveProperty("image_size"); expect(wire[0].body).not.toHaveProperty("batch_size"); expect(result.images).toHaveLength(2);
});
it.each(["openai-compatible", "siliconflow", "volcengine-ark"] as const)("%s rejects malformed/empty responses and redacts echoed credentials", async type => {
  const provider = runtime(type); if (provider.capability !== "image") throw new Error("image expected");
  payload = { data: [], images: [] }; await expect(provider.generate(request())).rejects.toThrow(/image/i);
  payload = ""; await expect(provider.testConnection()).rejects.toThrow(/response/i);
  payload = { error: { message: "Wrong token fixture-secret-key" } }; status = 401;
  await expect(provider.testConnection()).rejects.toThrow(/Wrong token \[REDACTED\]/);
  expect(wire.at(-1)).toMatchObject({ method: "GET", path: "/v1/models" });
});
it("passes explicitly configured Ark custom image and video models through", async () => {
  const provider = runtime("volcengine-ark"); if (provider.capability !== "image") throw new Error("image expected");
  await provider.generate(request([`data:image/png;base64,${png}`])); expect(wire[0].body.model).toBe("custom/image-v2");
  payload = { id: "task-custom" };
  const video = runtime("volcengine-ark", "ep-custom-video", "video"); if (video.capability !== "video") throw new Error("video expected");
  await expect(video.submit({ model: "ep-custom-video", prompt: "pet", firstFrame: "https://example.com/first.png", lastFrame: "https://example.com/last.png", identityReferences: ["https://example.com/identity.png"], resolution: "480p", ratio: "1:1" })).resolves.toBe("task-custom");
  expect(wire[1].body.model).toBe("ep-custom-video"); expect(wire[1].body.content).toHaveLength(4);
});
