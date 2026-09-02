import type {
  GenerationProviderCapability,
  GenerationProviderConfiguration,
  GenerationProviderType,
} from "@petlord/generation";

export interface StoredGenerationProviderConfiguration {
  id: string;
  type: GenerationProviderType;
  capability: GenerationProviderCapability;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderImageResult {
  model: string;
  images: Array<{ url?: string; dataUrl?: string }>;
}

export interface ProviderVideoTask {
  id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
  model?: string;
  durationSeconds?: number;
  videoUrl?: string;
  tailUrl?: string;
  completionTokens?: number;
  error?: string;
}

interface GenerationProviderRuntimeBase {
  readonly id: string;
  readonly type: GenerationProviderType;
  readonly capability: GenerationProviderCapability;
  validateRequest(request: unknown): unknown;
  testConnection(): Promise<void>;
}

export interface ImageGenerationProviderRuntime extends GenerationProviderRuntimeBase {
  readonly capability: "image";
  validateRequest(request: unknown): unknown;
  generate(request: unknown): Promise<ProviderImageResult>;
}

export interface VideoGenerationProviderRuntime extends GenerationProviderRuntimeBase {
  readonly capability: "video";
  validateRequest(request: unknown): unknown;
  submit(request: unknown): Promise<string>;
  poll(taskId: string): Promise<ProviderVideoTask>;
}

export type GenerationProviderRuntime = ImageGenerationProviderRuntime | VideoGenerationProviderRuntime;

export interface GenerationProviderConfigurationStore {
  listGenerationProviders(): StoredGenerationProviderConfiguration[];
  getGenerationProvider(id: string): StoredGenerationProviderConfiguration | undefined;
  upsertGenerationProvider(configuration: StoredGenerationProviderConfiguration): void;
  deleteGenerationProvider(id: string): void;
}

export function credentialHint(apiKey: string) {
  const suffix = apiKey.trim().slice(-4);
  return suffix ? `•••• ${suffix}` : "已保存";
}

export type PublicGenerationProviderConfiguration = GenerationProviderConfiguration;
