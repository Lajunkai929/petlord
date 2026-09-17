import { z } from "zod";
import { configuredModels } from "./catalog";
import type { ProviderImageResult, StoredGenerationProviderConfiguration } from "./types";

export function configuredModelSchema(configuration: StoredGenerationProviderConfiguration) {
  const ids = new Set(configuredModels(configuration).map(model => model.id));
  return z.string().refine(model => ids.has(model), "Model is not configured for this provider.");
}
export function imageRequestSchema(configuration: StoredGenerationProviderConfiguration) {
  return z.object({
    model: configuredModelSchema(configuration),
    prompt: z.string().min(1).max(20_000),
    referenceImages: z.array(z.string().min(1)).max(10),
    resolution: z.enum(["1K", "2K"]),
    candidateCount: z.number().int().min(1).max(5),
  });
}
export function redactProviderError(message: string, apiKey: string) {
  return apiKey ? message.split(apiKey).join("[REDACTED]") : message;
}
export function providerRequester(configuration: StoredGenerationProviderConfiguration, signal?: AbortSignal) {
  return async (path: string, init?: RequestInit): Promise<unknown> => {
    try {
      const response = await fetch(`${configuration.baseUrl.replace(/\/+$/, "")}${path}`, {
        ...init,
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180_000)]) : AbortSignal.timeout(180_000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${configuration.apiKey}`, ...init?.headers },
      });
      const text = await response.text();
      let payload: unknown;
      try { payload = JSON.parse(text); } catch {
        throw new Error(`Provider returned an invalid or empty response (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        const error = payload as { error?: { message?: unknown }; message?: unknown } | null;
        const message = typeof payload === "string" ? payload : error?.error?.message ?? error?.message;
        throw new Error(typeof message === "string" ? message : `Provider request failed (HTTP ${response.status}).`);
      }
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Provider returned an invalid response.");
      if ((payload as { error?: unknown }).error) {
        const error = (payload as { error: { message?: unknown } }).error;
        throw new Error(typeof error.message === "string" ? error.message : "Provider returned an error response.");
      }
      return payload;
    } catch (error) {
      throw new Error(redactProviderError(error instanceof Error ? error.message : "Provider request failed.", configuration.apiKey));
    }
  };
}
export function parseImageResult(items: unknown, model: string): ProviderImageResult {
  if (!Array.isArray(items) || !items.length) throw new Error("Provider did not return any images.");
  const images = items.map(item => {
    if (item && typeof item === "object") {
      if (typeof item.b64_json === "string" && item.b64_json.trim()) return { dataUrl: `data:image/png;base64,${item.b64_json}` };
      if (typeof item.url === "string" && item.url.trim()) return { url: item.url };
    }
    throw new Error("Provider returned an invalid image result.");
  });
  return { model, images };
}
