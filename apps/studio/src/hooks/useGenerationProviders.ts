import { useCallback, useEffect, useRef, useState } from "react";
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
  const refreshVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const next = await listGenerationProviders();
      if (version === refreshVersion.current) { setSnapshot(next); setStatus("online"); }
      return next;
    } catch (error) {
      if (version === refreshVersion.current) setStatus("offline");
      throw error;
    }
  }, []);

  useEffect(() => {
    void refresh().catch(() => undefined);
    const notify = () => { if (!document.hidden) void refresh().catch(() => undefined); };
    const timer = window.setInterval(notify, 5000);
    window.addEventListener("focus", notify);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", notify); };
  }, [refresh]);

  const retainMutation = useCallback((change: (current: GenerationProviderConfiguration[]) => GenerationProviderConfiguration[]) => {
    // A successful write is authoritative even if the following GET fails.
    // Invalidate older reads so they cannot erase the acknowledged result.
    ++refreshVersion.current;
    setSnapshot(current => {
      const providers = change(current?.providers ?? []);
      return { ...(current ?? { serviceAvailable: true, catalog: [] }), providers, defaults: {
        image: providers.find(provider => provider.enabled && provider.capability === "image")?.id,
        video: providers.find(provider => provider.enabled && provider.capability === "video")?.id,
      } };
    });
    setStatus("online");
    void refresh().catch(() => undefined);
  }, [refresh]);

  const create = useCallback(async (input: SaveGenerationProviderInput & { apiKey: string }) => {
    const provider = await createGenerationProvider(input);
    retainMutation(current => [...current.filter(item => item.id !== provider.id), provider]);
    return provider;
  }, [retainMutation]);

  const update = useCallback(async (id: string, input: Partial<SaveGenerationProviderInput>) => {
    const provider = await updateGenerationProvider(id, input);
    retainMutation(current => current.some(item => item.id === id) ? current.map(item => item.id === id ? provider : item) : [...current, provider]);
    return provider;
  }, [retainMutation]);

  const remove = useCallback(async (id: string) => {
    const result = await deleteGenerationProvider(id);
    retainMutation(current => current.filter(item => item.id !== id));
    return result;
  }, [retainMutation]);

  const test = useCallback(async (id: string) => testGenerationProvider(id), []);

  const providers = snapshot?.providers ?? [];
  const byCapability = useCallback((capability: GenerationProviderConfiguration["capability"]) => (
    providers.filter((provider) => provider.capability === capability)
  ), [providers]);

  return { snapshot, status, refresh, create, update, remove, test, byCapability };
}

export type GenerationProvidersController = ReturnType<typeof useGenerationProviders>;
