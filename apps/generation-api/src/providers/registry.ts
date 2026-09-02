import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  imageModelOptions,
  videoModelOptions,
  type GenerationProviderCapability,
  type GenerationProviderCatalogEntry,
  type GenerationProviderConfiguration,
  type GenerationProvidersSnapshot,
  type SaveGenerationProviderInput,
} from "@petlord/generation";
import { createVolcengineArkProvider } from "./volcengineArk";
import {
  credentialHint,
  type GenerationProviderConfigurationStore,
  type GenerationProviderRuntime,
  type StoredGenerationProviderConfiguration,
} from "./types";

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

export const generationProviderCatalog: GenerationProviderCatalogEntry[] = [{
  type: "volcengine-ark",
  label: "Volcengine Ark",
  description: "Seedream image generation and Seedance video generation.",
  defaultBaseUrl: DEFAULT_ARK_BASE_URL,
  capabilities: ["image", "video"],
  models: {
    image: imageModelOptions.map(({ id, label, description }) => ({ id, label, description })),
    video: videoModelOptions.map(({ id, label, description }) => ({ id, label, description })),
  },
}];

const capabilitySchema = z.enum(["image", "video"]);
const providerTypeSchema = z.literal("volcengine-ark");
const baseUrlSchema = z.string().url().refine((value) => {
  const parsed = new URL(value);
  return parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname));
}, "Provider URL must use HTTPS (HTTP is allowed only for localhost)." );

export const createProviderSchema = z.object({
  type: providerTypeSchema,
  capability: capabilitySchema,
  name: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(8).max(4096),
  baseUrl: baseUrlSchema,
  enabled: z.boolean().default(true),
});

export const updateProviderSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  apiKey: z.string().trim().min(8).max(4096).optional(),
  baseUrl: baseUrlSchema.optional(),
  enabled: z.boolean().optional(),
});

function catalogFor(type: StoredGenerationProviderConfiguration["type"]) {
  const entry = generationProviderCatalog.find((candidate) => candidate.type === type);
  if (!entry) throw new Error(`Unsupported provider type: ${type}`);
  return entry;
}

function publicConfiguration(configuration: StoredGenerationProviderConfiguration): GenerationProviderConfiguration {
  const catalog = catalogFor(configuration.type);
  return {
    id: configuration.id,
    type: configuration.type,
    capability: configuration.capability,
    name: configuration.name,
    baseUrl: configuration.baseUrl,
    enabled: configuration.enabled,
    credentialHint: credentialHint(configuration.apiKey),
    models: catalog.models[configuration.capability],
    createdAt: configuration.createdAt,
    updatedAt: configuration.updatedAt,
  };
}

export class GenerationProviderRegistry {
  constructor(private readonly store: GenerationProviderConfigurationStore) {}

  snapshot(): GenerationProvidersSnapshot {
    const providers = this.store.listGenerationProviders().map(publicConfiguration);
    const defaults: GenerationProvidersSnapshot["defaults"] = {};
    for (const capability of ["image", "video"] as const) {
      defaults[capability] = providers.find((provider) => provider.capability === capability && provider.enabled)?.id;
    }
    return { serviceAvailable: true, providers, catalog: generationProviderCatalog, defaults };
  }

  create(input: SaveGenerationProviderInput & { apiKey: string }) {
    const parsed = createProviderSchema.parse(input);
    const timestamp = new Date().toISOString();
    const configuration: StoredGenerationProviderConfiguration = {
      id: randomUUID(),
      ...parsed,
      baseUrl: parsed.baseUrl.replace(/\/+$/, ""),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.upsertGenerationProvider(configuration);
    return publicConfiguration(configuration);
  }

  update(id: string, input: Partial<SaveGenerationProviderInput>) {
    const current = this.store.getGenerationProvider(id);
    if (!current) return undefined;
    const patch = updateProviderSchema.parse(input);
    const next: StoredGenerationProviderConfiguration = {
      ...current,
      ...patch,
      baseUrl: (patch.baseUrl ?? current.baseUrl).replace(/\/+$/, ""),
      updatedAt: new Date().toISOString(),
    };
    this.store.upsertGenerationProvider(next);
    return publicConfiguration(next);
  }

  delete(id: string) {
    const current = this.store.getGenerationProvider(id);
    if (!current) return false;
    this.store.deleteGenerationProvider(id);
    return true;
  }

  getPublic(id: string) {
    const configuration = this.store.getGenerationProvider(id);
    return configuration ? publicConfiguration(configuration) : undefined;
  }

  resolve(capability: GenerationProviderCapability, requestedId?: string): GenerationProviderRuntime {
    const configurations = this.store.listGenerationProviders();
    const configuration = requestedId
      ? configurations.find((candidate) => candidate.id === requestedId)
      : configurations.find((candidate) => candidate.capability === capability && candidate.enabled);
    if (!configuration) {
      throw new Error(`No ${capability} provider is configured. Open Generation settings to add one.`);
    }
    if (configuration.capability !== capability) {
      throw new Error(`Provider “${configuration.name}” cannot handle ${capability} generation.`);
    }
    if (!configuration.enabled) throw new Error(`Provider “${configuration.name}” is disabled.`);
    return createVolcengineArkProvider(configuration);
  }

  runtime(id: string) {
    const configuration = this.store.getGenerationProvider(id);
    if (!configuration) throw new Error("The provider saved with this job no longer exists.");
    if (!configuration.enabled) throw new Error(`Provider “${configuration.name}” is disabled.`);
    return createVolcengineArkProvider(configuration);
  }

  async test(id: string) {
    const runtime = this.runtime(id);
    await runtime.testConnection();
    return { ok: true as const, message: "Provider connection verified." };
  }
}
