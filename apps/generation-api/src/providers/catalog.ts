import { z } from "zod";
import { imageModelOptions, videoModelOptions, type GenerationProviderCatalogEntry, type GenerationProviderProtocol } from "@petlord/generation";
import type { StoredGenerationProviderConfiguration } from "./types";

export const generationProviderProtocols: GenerationProviderProtocol[] = [
  { id: "volcengine-ark", label: "Volcengine Ark", description: "Ark Images and asynchronous video tasks.", capabilities: ["image", "video"] },
  { id: "openai-compatible", label: "OpenAI Images", description: "JSON Images generations and edits with image_url references.", capabilities: ["image"] },
  { id: "siliconflow", label: "SiliconFlow Images", description: "JSON Images generations with image, image2 and image3 references (up to three).", capabilities: ["image"] },
];
export const generationProviderCatalog: GenerationProviderCatalogEntry[] = [
  { id: "volcengine-ark", type: "volcengine-ark", label: "Volcengine Ark", description: "Seedream images and Seedance videos.", defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3", capabilities: ["image", "video"], models: {
    image: imageModelOptions.map(({ id, label, description }) => ({ id, label, description })),
    video: videoModelOptions.map(({ id, label, description }) => ({ id, label, description })),
  } },
  { id: "openai", type: "openai-compatible", label: "OpenAI", description: "GPT Image generation and editing.", defaultBaseUrl: "https://api.openai.com/v1", capabilities: ["image"], models: { image: [
    { id: "gpt-image-2.5-sunburst", label: "GPT Image 2.5 Sunburst", description: "Image generation and editing" },
    { id: "gpt-image-2.5-flare", label: "GPT Image 2.5 Flare", description: "Image generation and editing" },
    { id: "gpt-image-2", label: "GPT Image 2", description: "Image generation and editing" },
  ], video: [] } },
  { id: "siliconflow", type: "siliconflow", label: "SiliconFlow", description: "Image generation and Qwen image editing (up to three references).", defaultBaseUrl: "https://api.siliconflow.cn/v1", capabilities: ["image"], models: { image: [
    { id: "Qwen/Qwen-Image-Edit-2509", label: "Qwen Image Edit 2509", description: "Up to three references; output size follows model" },
    { id: "Qwen/Qwen-Image", label: "Qwen Image", description: "Text-to-image generation" },
    { id: "Kwai-Kolors/Kolors", label: "Kolors", description: "Image generation with a single reference" },
  ], video: [] } },
];
export function configuredModels(configuration: Pick<StoredGenerationProviderConfiguration, "type" | "capability" | "models">) {
  return configuration.models ?? generationProviderCatalog.find(entry => entry.type === configuration.type)?.models[configuration.capability] ?? [];
}
export function validateProtocolCapability(configuration: Pick<StoredGenerationProviderConfiguration, "type" | "capability">) {
  if (!generationProviderProtocols.find(protocol => protocol.id === configuration.type)?.capabilities.includes(configuration.capability)) {
    throw new z.ZodError([{ code: "custom", path: ["type"], message: `Protocol ${configuration.type} does not support ${configuration.capability} capability.` }]);
  }
}
