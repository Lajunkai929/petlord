import { z } from "zod";
import { normalizeArkImageRequest } from "../arkImageRequest";
import type {
  GenerationProviderRuntime,
  ProviderImageResult,
  ProviderVideoTask,
  StoredGenerationProviderConfiguration,
} from "./types";

const imageModels = new Set([
  "doubao-seedream-5-0-260128",
  "doubao-seedream-4-5-251128",
  "doubao-seedream-4-0-250828",
]);

const videoModels = new Set([
  "doubao-seedance-2-0-mini-260615",
  "doubao-seedance-2-0-fast-260128",
  "doubao-seedance-2-0-260128",
  "doubao-seedance-2-5-260628",
  "doubao-seedance-1-5-pro-251215",
]);

const imageRequestSchema = z.object({
  model: z.string().refine((model) => imageModels.has(model), "Unsupported image model."),
  prompt: z.string().min(1).max(20_000),
  referenceImages: z.array(z.string().min(1)).max(10),
  resolution: z.enum(["1K", "2K"]),
  candidateCount: z.number().int().min(1).max(5),
});

const videoRequestSchema = z.object({
  model: z.string().refine((model) => videoModels.has(model), "Unsupported video model."),
  prompt: z.string().min(1).max(20_000),
  firstFrame: z.string().min(1),
  lastFrame: z.string().min(1),
  identityReferences: z.array(z.string().min(1)).max(7),
  resolution: z.enum(["480p", "720p", "1080p"]),
  ratio: z.literal("1:1"),
  durationSeconds: z.number().int().min(2).max(15).optional(),
}).superRefine((request, context) => {
  if (request.model.startsWith("doubao-seedance-2-") && request.durationSeconds !== undefined && request.durationSeconds < 4) {
    context.addIssue({ code: "custom", path: ["durationSeconds"], message: "Seedance 2.0 duration must be between 4 and 15 seconds." });
  }
});

function arkVideoContent(body: z.infer<typeof videoRequestSchema>) {
  if (body.model.startsWith("doubao-seedance-2-")) {
    return [
      { type: "text", text: body.prompt },
      ...[body.firstFrame, body.lastFrame, ...body.identityReferences].map((url) => ({
        type: "image_url",
        image_url: { url },
        role: "reference_image",
      })),
    ];
  }
  return [
    { type: "text", text: body.prompt },
    { type: "image_url", image_url: { url: body.firstFrame }, role: "first_frame" },
    { type: "image_url", image_url: { url: body.lastFrame }, role: "last_frame" },
    ...body.identityReferences.slice(0, 4).map((url) => ({ type: "image_url", image_url: { url }, role: "reference_image" })),
  ];
}

interface ArkErrorPayload {
  error?: { message?: string };
  message?: string;
}

function trimBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function createVolcengineArkProvider(configuration: StoredGenerationProviderConfiguration): GenerationProviderRuntime {
  async function request(path: string, init?: RequestInit) {
    const response = await fetch(`${trimBaseUrl(configuration.baseUrl)}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${configuration.apiKey}`,
        ...init?.headers,
      },
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { error: { message: text || `Volcengine Ark returned HTTP ${response.status}.` } };
    }
    if (!response.ok) {
      const candidate = payload as ArkErrorPayload;
      throw new Error(candidate.error?.message ?? candidate.message ?? `Volcengine Ark request failed with HTTP ${response.status}.`);
    }
    return payload;
  }

  async function testConnection() {
    await request("/models");
  }

  if (configuration.capability === "image") {
    return {
      id: configuration.id,
      type: configuration.type,
      capability: "image",
      validateRequest(requestBody) {
        return imageRequestSchema.parse(requestBody);
      },
      testConnection,
      async generate(requestBody): Promise<ProviderImageResult> {
        const body = imageRequestSchema.parse(requestBody);
        const arkBody = {
          model: body.model,
          prompt: body.prompt,
          image: body.referenceImages,
          size: body.resolution,
          sequential_image_generation: body.candidateCount > 1 ? "auto" as const : "disabled" as const,
          ...(body.candidateCount > 1 ? { sequential_image_generation_options: { max_images: body.candidateCount } } : {}),
          response_format: "url" as const,
          watermark: false as const,
        };
        const payload = await request("/images/generations", {
          method: "POST",
          body: JSON.stringify(normalizeArkImageRequest(arkBody)),
        }) as { model?: string; data?: Array<{ url?: string; b64_json?: string }> };
        return {
          model: payload.model ?? body.model,
          images: (payload.data ?? []).map((item) => ({
            url: item.url,
            dataUrl: item.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined,
          })),
        };
      },
    };
  }

  return {
    id: configuration.id,
    type: configuration.type,
    capability: "video",
    validateRequest(requestBody) {
      return videoRequestSchema.parse(requestBody);
    },
    testConnection,
    async submit(requestBody) {
      const body = videoRequestSchema.parse(requestBody);
      const arkBody = {
        model: body.model,
        content: arkVideoContent(body),
        return_last_frame: true,
        generate_audio: false,
        resolution: body.resolution,
        ratio: body.ratio,
        ...(body.durationSeconds ? { duration: body.durationSeconds } : {}),
        watermark: false,
      };
      const payload = await request("/contents/generations/tasks", {
        method: "POST",
        body: JSON.stringify(arkBody),
      }) as { id?: string };
      if (!payload.id) throw new Error("Seedance did not return a task ID.");
      return payload.id;
    },
    async poll(taskId): Promise<ProviderVideoTask> {
      const payload = await request(`/contents/generations/tasks/${encodeURIComponent(taskId)}`) as {
        id?: string;
        status?: ProviderVideoTask["status"];
        model?: string;
        duration?: string | number;
        error?: { message?: string };
        content?: { video_url?: string; last_frame_url?: string; last_frame?: string | { url?: string }; image_url?: string };
        usage?: { completion_tokens?: number };
      };
      const lastFrame = payload.content?.last_frame;
      const durationSeconds = Number(payload.duration);
      return {
        id: payload.id ?? taskId,
        status: payload.status ?? "queued",
        model: payload.model,
        durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : undefined,
        videoUrl: payload.content?.video_url,
        tailUrl: payload.content?.last_frame_url
          ?? (typeof lastFrame === "string" ? lastFrame : lastFrame?.url)
          ?? payload.content?.image_url,
        completionTokens: payload.usage?.completion_tokens,
        error: payload.error?.message,
      };
    },
  };
}
