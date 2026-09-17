import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  type GenerationProviderCapability,
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

export { generationProviderCatalog } from "./catalog";
import { generationProviderCatalog, generationProviderProtocols, configuredModels, validateProtocolCapability } from "./catalog";
import { createImageProtocolProvider } from "./imageProtocols";

const capabilitySchema = z.enum(["image", "video"]);
const providerTypeSchema = z.enum(["volcengine-ark", "openai-compatible", "siliconflow"]);
const baseUrlSchema = z.string().url().refine((value) => {
  const parsed = new URL(value);
  return !parsed.username && !parsed.password && !parsed.hash && !parsed.search && (parsed.protocol === "https:" || (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)));
}, "Provider URL must use HTTPS (HTTP is allowed only for localhost), without credentials, query or fragment." );

const modelsSchema = z.array(z.object({
  id: z.string().trim().min(1).max(256).regex(/^\S+$/, "Model IDs cannot contain whitespace."),
  label: z.string().trim().min(1).max(256),
  description: z.string().max(2000),
  estimatedUnitCostCny: z.number().positive().optional(),
})).min(1).max(100).refine(models => new Set(models.map(model => model.id)).size === models.length, "Model IDs must be unique.");
const presetIdSchema = z.string().trim().min(1).max(80);

export const createProviderSchema = z.object({
  type: providerTypeSchema,
  presetId: presetIdSchema.optional(),
  models: modelsSchema.optional(),
  capability: capabilitySchema,
  name: z.string().trim().min(1).max(80),
  apiKey: z.string().trim().min(8).max(4096),
  baseUrl: baseUrlSchema,
  enabled: z.boolean().default(true),
});

export const updateProviderSchema = z.object({
  type: providerTypeSchema.optional(),
  presetId: presetIdSchema.optional(),
  models: modelsSchema.optional(),
  name: z.string().trim().min(1).max(80).optional(),
  apiKey: z.string().trim().refine(key => !key || key.length >= 8, "API key must be at least 8 characters.").max(4096).optional(),
  baseUrl: baseUrlSchema.optional(),
  enabled: z.boolean().optional(),
});

function publicConfiguration(configuration: StoredGenerationProviderConfiguration): GenerationProviderConfiguration {
  return {
    id: configuration.id,
    type: configuration.type,
    presetId: configuration.presetId,
    capability: configuration.capability,
    name: configuration.name,
    baseUrl: configuration.baseUrl,
    enabled: configuration.enabled,
    credentialHint: credentialHint(configuration.apiKey),
    models: configuredModels(configuration),
    createdAt: configuration.createdAt,
    updatedAt: configuration.updatedAt,
  };
}

export class GenerationProviderRegistry {
  constructor(private readonly store: GenerationProviderConfigurationStore, private readonly signal?: AbortSignal) {}

  snapshot(): GenerationProvidersSnapshot {
    const providers = this.store.listGenerationProviders().map(publicConfiguration);
    const defaults: GenerationProvidersSnapshot["defaults"] = {};
    for (const capability of ["image", "video"] as const) {
      defaults[capability] = providers.find((provider) => provider.capability === capability && provider.enabled)?.id;
    }
    return { serviceAvailable: true, providers, catalog: generationProviderCatalog, protocols: generationProviderProtocols, defaults };
  }

  create(input: SaveGenerationProviderInput & { apiKey: string }) {
    const parsed = createProviderSchema.parse(input);
    validateProtocolCapability(parsed);
    const timestamp = new Date().toISOString();
    const configuration: StoredGenerationProviderConfiguration = {
      id: randomUUID(),
      ...parsed,
      models: configuredModels(parsed),
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
    if (!patch.apiKey) delete patch.apiKey;
    validateProtocolCapability({ ...current, ...patch });
    const next: StoredGenerationProviderConfiguration = {
      ...current,
      ...patch,
      models: patch.models ?? configuredModels(current),
      baseUrl: patch.baseUrl?.replace(/\/+$/, "") ?? current.baseUrl,
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
    return this.createRuntime(configuration);
  }

  runtime(id: string) {
    const configuration = this.store.getGenerationProvider(id);
    if (!configuration) throw new Error("The provider saved with this job no longer exists.");
    if (!configuration.enabled) throw new Error(`Provider “${configuration.name}” is disabled.`);
    return this.createRuntime(configuration);
  }

  private createRuntime(configuration: StoredGenerationProviderConfiguration): GenerationProviderRuntime {
    validateProtocolCapability(configuration);
    return configuration.type === "volcengine-ark"
      ? createVolcengineArkProvider(configuration, this.signal)
      : createImageProtocolProvider(configuration, this.signal);
  }

  async test(id: string) {
    const runtime = this.runtime(id);
    await runtime.testConnection();
    return { ok: true as const, message: "Provider connection verified." };
  }
}
