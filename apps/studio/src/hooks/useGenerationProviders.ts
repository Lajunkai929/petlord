import { useCallback, useEffect, useState } from "react";
import {
  createGenerationProvider,
  deleteGenerationProvider,
  listGenerationProviders,
  testGenerationProvider,
  updateGenerationProvider,
  type GenerationProviderConfiguration,
  type GenerationProvidersSnapshot,
  type SaveGenerationProviderInput,
} from "@petlord/generation";

export type ProviderServiceStatus = "loading" | "online" | "offline";

export function useGenerationProviders() {
  const [snapshot, setSnapshot] = useState<GenerationProvidersSnapshot | null>(null);
  const [status, setStatus] = useState<ProviderServiceStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      const next = await listGenerationProviders();
      setSnapshot(next);
      setStatus("online");
      return next;
    } catch (error) {
      setStatus("offline");
      throw error;
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
  }, [refresh]);

  const create = useCallback(async (input: SaveGenerationProviderInput & { apiKey: string }) => {
    const provider = await createGenerationProvider(input);
    await refresh();
    return provider;
  }, [refresh]);

  const update = useCallback(async (id: string, input: Partial<SaveGenerationProviderInput>) => {
    const provider = await updateGenerationProvider(id, input);
    await refresh();
    return provider;
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await deleteGenerationProvider(id);
    return refresh();
  }, [refresh]);

  const test = useCallback(async (id: string) => testGenerationProvider(id), []);

  const providers = snapshot?.providers ?? [];
  const byCapability = useCallback((capability: GenerationProviderConfiguration["capability"]) => (
    providers.filter((provider) => provider.capability === capability)
  ), [providers]);

  return { snapshot, status, refresh, create, update, remove, test, byCapability };
}

export type GenerationProvidersController = ReturnType<typeof useGenerationProviders>;
