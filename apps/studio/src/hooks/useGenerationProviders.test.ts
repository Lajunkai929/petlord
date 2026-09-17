// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GenerationProviderConfiguration, GenerationProvidersSnapshot } from "@petlord/generation";
import { useGenerationProviders, type GenerationProvidersController } from "./useGenerationProviders";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const provider = (id: string): GenerationProviderConfiguration => ({ id, type: "openai-compatible", capability: "image", name: id, baseUrl: "https://example.com/v1", enabled: true, credentialHint: "•••• test", createdAt: "", updatedAt: "", models: [{ id: "custom", label: "Custom", description: "" }] });

it.each(["create", "update", "remove"] as const)("retains a successful %s when the subsequent list refresh fails", async operation => {
  const existing = provider("existing");
  let saved = operation === "create" ? [] : [existing];
  let failRefresh = false;
  let writes = 0;
  vi.stubGlobal("fetch", vi.fn(async (_url: string, request?: RequestInit) => {
    if (!request?.method) {
      if (failRefresh) throw new Error("list unavailable");
      const snapshot: GenerationProvidersSnapshot = { serviceAvailable: true, providers: saved, defaults: saved.length ? { image: saved[0].id } : {}, catalog: [] };
      return new Response(JSON.stringify(snapshot));
    }
    writes++;
    if (request.method === "DELETE") { saved = []; return new Response(JSON.stringify({ deleted: true })); }
    const result = request.method === "POST" ? provider("created") : { ...existing, name: "Renamed", enabled: false };
    saved = [result]; return new Response(JSON.stringify(result));
  }));
  let controller!: GenerationProvidersController;
  function Harness() { controller = useGenerationProviders(); return null; }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(createElement(Harness)));
  expect(controller.status).toBe("online");
  failRefresh = true;
  await act(async () => {
    const result = operation === "create" ? controller.create({ ...provider("created"), apiKey: "fixture" })
      : operation === "update" ? controller.update(existing.id, { name: "Renamed", enabled: false })
      : controller.remove(existing.id);
    await result;
  });
  expect(writes).toBe(1);
  expect(controller.snapshot?.providers).toEqual(saved);
  expect(controller.snapshot?.defaults.image).toBe(saved.find(item => item.enabled)?.id);
  expect(controller.status).toBe("offline");
});
