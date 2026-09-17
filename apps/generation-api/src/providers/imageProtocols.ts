import { imageRequestSchema, parseImageResult, providerRequester } from "./requests";
import type { ImageGenerationProviderRuntime, ProviderImageResult, StoredGenerationProviderConfiguration } from "./types";

export function createImageProtocolProvider(configuration: StoredGenerationProviderConfiguration, signal?: AbortSignal): ImageGenerationProviderRuntime {
  if (configuration.capability !== "image" || !["openai-compatible", "siliconflow"].includes(configuration.type)) throw new Error("This protocol supports image generation only.");
  const request = providerRequester(configuration, signal);
  const schema = imageRequestSchema(configuration).superRefine((body, context) => {
    if (configuration.type !== "siliconflow") return;
    const singleReferenceModels = ["Kwai-Kolors/Kolors", "Qwen/Qwen-Image-Edit"];
    const maxReferences = body.model === "Qwen/Qwen-Image" ? 0 : singleReferenceModels.includes(body.model) ? 1 : 3;
    if (body.referenceImages.length > maxReferences) context.addIssue({ code: "custom", path: ["referenceImages"], message: `SiliconFlow model ${body.model} supports at most ${maxReferences} reference images. Choose a suitable model or reduce the references.` });
  });
  return {
    id: configuration.id, type: configuration.type, capability: "image",
    validateRequest: body => schema.parse(body),
    testConnection: async () => { await request("/models"); },
    async generate(input): Promise<ProviderImageResult> {
      const body = schema.parse(input);
      const size = body.resolution === "2K" ? "2048x2048" : "1024x1024";
      if (configuration.type === "openai-compatible") {
        const payload = await request(body.referenceImages.length ? "/images/edits" : "/images/generations", {
          method: "POST", body: JSON.stringify({ model: body.model, prompt: body.prompt, n: body.candidateCount, size,
            ...(body.referenceImages.length ? { images: body.referenceImages.map(image_url => ({ image_url })) } : {}),
          }),
        }) as { model?: string; data?: unknown };
        return parseImageResult(payload.data, payload.model ?? body.model);
      }
      // SiliconFlow only documents batch_size for Kolors. One request per candidate
      // works for both its native models and manually configured compatible models.
      const images: ProviderImageResult["images"] = [];
      for (let candidate = 0; candidate < body.candidateCount; candidate++) {
        const qwenEdit = ["Qwen/Qwen-Image-Edit", "Qwen/Qwen-Image-Edit-2509"].includes(body.model);
        const payload = await request("/images/generations", { method: "POST", body: JSON.stringify({
          model: body.model, prompt: body.prompt,
          ...(!qwenEdit ? { image_size: body.model === "Qwen/Qwen-Image" ? "1328x1328" : size } : {}),
          ...Object.fromEntries(body.referenceImages.map((image, index) => [index === 0 ? "image" : `image${index + 1}`, image])),
        }) }) as { images?: unknown };
        images.push(...parseImageResult(payload.images, body.model).images);
      }
      return { model: body.model, images };
    },
  };
}
