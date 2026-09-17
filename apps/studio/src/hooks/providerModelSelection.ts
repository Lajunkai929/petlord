import type { GenerationProviderCapability, GenerationProvidersSnapshot } from "@petlord/generation";

export function providerModelSelection(snapshot: GenerationProvidersSnapshot | null | undefined, capability: GenerationProviderCapability, requestedProviderId?: string) {
  const id = requestedProviderId ?? snapshot?.defaults[capability];
  return snapshot?.providers.find(provider => provider.id === id && provider.enabled && provider.capability === capability)?.models;
}
