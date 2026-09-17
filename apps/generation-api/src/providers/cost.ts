import { estimateImageGenerationCost, estimateVideoGenerationCost, toPersistentJobCost, type GenerationProviderConfiguration } from "@petlord/generation";

/** Called only after the selected adapter validates the neutral request. */
export function estimateProviderRequestCost(configuration: GenerationProviderConfiguration, request: unknown) {
  const body = request as { model: string; candidateCount: number; resolution: "480p" | "720p" | "1080p"; durationSeconds?: number };
  return toPersistentJobCost(configuration.capability === "image"
    ? estimateImageGenerationCost(body.model, body.candidateCount, configuration.models)
    : estimateVideoGenerationCost({ model: body.model, models: configuration.models, resolution: body.resolution, durationMode: body.durationSeconds === undefined ? "smart" : "fixed", durationSeconds: body.durationSeconds }));
}
