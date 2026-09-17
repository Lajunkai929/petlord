import type { GenerationSettings } from "@petlord/schema";

export const DEFAULT_VIDEO_MODEL = "doubao-seedance-2-0-mini-260615";
export const DEFAULT_IMAGE_MODEL = "doubao-seedream-5-0-260128";
export const DEFAULT_NATIVE_IMAGE_MODEL = DEFAULT_IMAGE_MODEL;
export const CHARACTER_NAME_PROMPT_VARIABLE = "{{characterName}}";
const GENERIC_IDENTITY_LOCK = "全部形象参考共同定义同一个个体。必须严格保持参考中的年龄感、头脸比例、口鼻长度、耳型与朝向、眼睛大小与间距、颈部与躯干比例、四肢长度、尾型、毛发长度、真实毛色花纹及全部独特标记；不得套用品种模板，不得擅自幼化、圆润化、缩短或拉长四肢、放大头眼、改变蓬松程度或新增配饰。";

export function materializePromptVariables(prompt: string, characterName?: string) {
  if (!characterName?.trim()) return prompt;
  return prompt.replace(/\{\{\s*characterName\s*\}\}/g, characterName.trim());
}

export function templateCharacterNamePrompt(prompt: string, characterName?: string) {
  const normalizedName = characterName?.trim();
  if (!normalizedName) return prompt;
  return prompt.split(normalizedName).join(CHARACTER_NAME_PROMPT_VARIABLE);
}

export function remapCharacterNamePrompt(prompt: string, previousName: string | undefined, nextName: string) {
  return materializePromptVariables(templateCharacterNamePrompt(prompt, previousName), nextName);
}

export const videoModelOptions = [
  { id: DEFAULT_VIDEO_MODEL, label: "Seedance 2.0 Mini", description: "默认，速度与成本优先" },
  { id: "doubao-seedance-2-0-fast-260128", label: "Seedance 2.0 Fast", description: "快速视频生成" },
  { id: "doubao-seedance-2-0-260128", label: "Seedance 2.0", description: "标准质量" },
  { id: "doubao-seedance-2-5-260628", label: "Seedance 2.5", description: "较新的高质量模型" },
  { id: "doubao-seedance-1-5-pro-251215", label: "Seedance 1.5 Pro", description: "兼容首尾帧工作流" },
] as const;

export const imageModelOptions = [
  {
    id: DEFAULT_IMAGE_MODEL,
    label: "Seedream 5.0",
    description: "默认，原生图片生成与多候选输出",
    mode: "native-image",
  },
  {
    id: "doubao-seedream-4-5-251128",
    label: "Seedream 4.5",
    description: "原生图片生成兼容选项",
    mode: "native-image",
  },
  {
    id: "doubao-seedream-4-0-250828",
    label: "Seedream 4.0",
    description: "成本更低的兼容选项",
    mode: "native-image",
  },
] as const;

export interface GeneratedMedia {
  uri: string;
  mimeType: string;
  provider: string;
  model: string;
  pixelWidth?: number;
  pixelHeight?: number;
  silent?: boolean;
  hasAlpha?: boolean;
  transparencyMethod?: "apple-vision-foreground-mask" | "adaptive-color-matte";
  alphaCoverage?: { transparentRatio: number; opaqueRatio: number };
}

export interface StateDraftRequest {
  characterName?: string;
  identityReferenceUris: string[];
  identityPrompt: string;
  stylePrompt: string;
  targetStateLabel: string;
  prompt: string;
  settings: GenerationSettings;
}

export interface StateDraftPromptSegment {
  id: "references" | "identity" | "style" | "state" | "output";
  label: string;
  content: string;
}

export interface TransitionGenerationRequest {
  characterName?: string;
  fromStateImageUri: string;
  targetDraftImageUri: string;
  identityReferenceUris: string[];
  identityPrompt: string;
  stylePrompt: string;
  prompt: string;
  settings: GenerationSettings;
  durationMode: "smart" | "fixed";
  durationSeconds?: number;
  transparentVideo: boolean;
  transparencyKeyColor: string;
  transparencySimilarity: number;
  chromaBackgroundColor: string;
}

export interface TransitionGenerationResult {
  video: GeneratedMedia;
  extractedTail: GeneratedMedia;
  durationMs?: number;
}

export interface GenerationTrigger {
  projectId: string;
  entityType: "state" | "transition" | "pointer-gaze";
  entityId: string;
  label: string;
}

export type PersistentJobStatus = "queued" | "submitting" | "running" | "succeeded" | "failed";

export interface PersistentGenerationJob {
  id: string;
  remoteTaskId?: string;
  kind: "state-image" | "transition-video";
  providerId?: string;
  provider?: string;
  status: PersistentJobStatus;
  progress: number;
  model: string;
  trigger: GenerationTrigger;
  createdAt: string;
  updatedAt: string;
  error?: string;
  assembledPrompt?: string;
  chromaKeyColor?: string;
  cost?: PersistentJobCost;
  result?: {
    image?: GeneratedMedia;
    images?: GeneratedMedia[];
    video?: GeneratedMedia;
    tail?: GeneratedMedia;
    durationMs?: number;
  };
}

export interface PersistentJobCost {
  priorAttemptsReservedCny?: number;
  status: "estimated" | "settled";
  source: "estimate" | "provider-usage" | "unit-output" | "duration-reconciled";
  estimatedMinCny: number;
  estimatedMaxCny: number;
  actualCny?: number;
  basis: string;
}

export type GenerationProviderCapability = "image" | "video";
export type GenerationProviderType = "volcengine-ark" | "openai-compatible" | "siliconflow";

export interface GenerationProviderProtocol {
  id: GenerationProviderType;
  label: string;
  description: string;
  capabilities: GenerationProviderCapability[];
}

export interface GenerationProviderModel {
  /** User-supplied budget estimate: CNY per image or per video second. */
  estimatedUnitCostCny?: number;
  id: string;
  label: string;
  description: string;
}

export interface GenerationProviderCatalogEntry {
  id?: string;
  type: GenerationProviderType;
  label: string;
  description: string;
  defaultBaseUrl: string;
  capabilities: GenerationProviderCapability[];
  models: Record<GenerationProviderCapability, GenerationProviderModel[]>;
}

export interface GenerationProviderConfiguration {
  presetId?: string;
  id: string;
  type: GenerationProviderType;
  capability: GenerationProviderCapability;
  name: string;
  baseUrl: string;
  enabled: boolean;
  credentialHint: string;
  models: GenerationProviderModel[];
  createdAt: string;
  updatedAt: string;
}

export interface GenerationProvidersSnapshot {
  serviceAvailable: true;
  providers: GenerationProviderConfiguration[];
  catalog: GenerationProviderCatalogEntry[];
  protocols?: GenerationProviderProtocol[];
  defaults: Partial<Record<GenerationProviderCapability, string>>;
}

export interface SaveGenerationProviderInput {
  presetId?: string;
  models?: GenerationProviderModel[];
  type: GenerationProviderType;
  capability: GenerationProviderCapability;
  name: string;
  apiKey?: string;
  baseUrl: string;
  enabled?: boolean;
}

const imagePriceCny: Record<string, number> = {
  "doubao-seedream-5-0-260128": 0.22,
  "doubao-seedream-4-5-251128": 0.25,
  "doubao-seedream-4-0-250828": 0.20,
};

const videoTokenPricePerMillionCny: Record<string, number> = {
  "doubao-seedance-2-0-mini-260615": 23,
  "doubao-seedance-2-0-fast-260128": 37,
  "doubao-seedance-2-0-260128": 46,
};

function knownModelPrice(prices: Record<string, number>, model: string) {
  return Object.hasOwn(prices, model) ? prices[model] : undefined;
}

// Calibrated from Ark's returned usage for a 4 s, 480p, 1:1 Seedance 2.0 Mini task (38,800 tokens).
// It is intentionally presented as an estimate; the provider's final usage remains authoritative.
const seedance480SquareTokensPerSecond = 9_700;

export interface CostEstimate {
  minimumCny: number;
  maximumCny: number;
  basis: string;
}

export function toPersistentJobCost(estimate: CostEstimate | null): PersistentJobCost | undefined {
  if (!estimate) return undefined;
  return {
    status: "estimated",
    source: "estimate",
    estimatedMinCny: estimate.minimumCny,
    estimatedMaxCny: estimate.maximumCny,
    basis: estimate.basis,
  };
}

export function estimateImageGenerationCost(model: string, count: number, models?: GenerationProviderModel[]): CostEstimate | null {
  const configuredPrice = models?.find(candidate => candidate.id === model)?.estimatedUnitCostCny;
  const unitPrice = configuredPrice ?? knownModelPrice(imagePriceCny, model);
  if (unitPrice === undefined || !Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(count) || count < 0) return null;
  const amount = unitPrice * count;
  if (!Number.isFinite(amount)) return null;
  return { minimumCny: amount, maximumCny: amount, basis: `${configuredPrice !== undefined ? "用户预估 · " : ""}按 ¥${unitPrice}/张 × ${count} 张估算` };
}

export function estimateVideoGenerationCost(input: {
  model: string;
  models?: GenerationProviderModel[];
  resolution: "480p" | "720p" | "1080p";
  durationMode: "smart" | "fixed";
  durationSeconds?: number;
}): CostEstimate | null {
  const configuredPrice = input.models?.find(candidate => candidate.id === input.model)?.estimatedUnitCostCny;
  if (configuredPrice !== undefined) {
    if (!Number.isFinite(configuredPrice) || configuredPrice <= 0) return null;
    const minimumSeconds = input.durationMode === "fixed" ? input.durationSeconds ?? 4 : 4;
    const maximumSeconds = input.durationMode === "fixed" ? input.durationSeconds ?? 4 : 15;
    if (!Number.isFinite(minimumSeconds) || minimumSeconds <= 0 || !Number.isFinite(configuredPrice * maximumSeconds)) return null;
    return { minimumCny: configuredPrice * minimumSeconds, maximumCny: configuredPrice * maximumSeconds, basis: `用户预估 · ¥${configuredPrice}/秒 × ${minimumSeconds === maximumSeconds ? minimumSeconds : `${minimumSeconds}–${maximumSeconds}`} 秒` };
  }
  const tokenPrice = knownModelPrice(videoTokenPricePerMillionCny, input.model);
  if (tokenPrice === undefined) return null;
  const resolutionFactor = input.resolution === "480p" ? 1 : input.resolution === "720p" ? 2.25 : 5.0625;
  const pricePerSecond = seedance480SquareTokensPerSecond * resolutionFactor * tokenPrice / 1_000_000;
  const minimumSeconds = input.durationMode === "fixed" ? input.durationSeconds ?? 4 : 4;
  const maximumSeconds = input.durationMode === "fixed" ? input.durationSeconds ?? 4 : 15;
  if (!Number.isFinite(minimumSeconds) || minimumSeconds <= 0 || !Number.isFinite(pricePerSecond * maximumSeconds)) return null;
  return {
    minimumCny: pricePerSecond * minimumSeconds,
    maximumCny: pricePerSecond * maximumSeconds,
    basis: input.durationMode === "fixed"
      ? `按 ${input.resolution} · ${minimumSeconds} 秒估算`
      : `智能时长按 4–15 秒区间估算`,
  };
}

export function calculateVideoGenerationCostFromTokens(model: string, completionTokens: number) {
  const tokenPrice = knownModelPrice(videoTokenPricePerMillionCny, model);
  if (tokenPrice === undefined || !Number.isFinite(completionTokens) || completionTokens < 0) return null;
  const amount = completionTokens * tokenPrice / 1_000_000;
  return Number.isFinite(amount) ? amount : null;
}

export type PersistentStateDraftRequest = StateDraftRequest & {
  jobId: string;
  trigger: GenerationTrigger;
};

export type PersistentTransitionRequest = TransitionGenerationRequest & {
  jobId: string;
  trigger: GenerationTrigger;
};

export interface ImageGenerationProvider {
  readonly id: string;
  readonly capability: "image";
  generateStateDraft(request: StateDraftRequest, onProgress?: (progress: number) => void): Promise<GeneratedMedia>;
}

export interface VideoGenerationProvider {
  readonly id: string;
  readonly capability: "video";
  generateTransition(
    request: TransitionGenerationRequest,
    onProgress?: (progress: number) => void,
  ): Promise<TransitionGenerationResult>;
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function parseJsonResponse<T>(response: Response, operation = "请求"): Promise<T> {
  const contents = await response.text();
  if (!contents.trim()) {
    throw new Error(`${operation}没有收到服务端结果（HTTP ${response.status || "连接中断"}）。本地生成服务可能在处理期间重启，请重新执行。`);
  }
  let payload: T & { error?: { message?: string }; message?: string };
  try {
    payload = JSON.parse(contents) as T & { error?: { message?: string }; message?: string };
  } catch {
    const contentType = response.headers.get("content-type") ?? "未知格式";
    throw new Error(`${operation}收到无法解析的服务响应（HTTP ${response.status} · ${contentType}）。请确认本地生成服务仍在运行后重试。`);
  }
  if (!response.ok) {
    throw new Error(payload.error?.message ?? payload.message ?? `${operation}失败（HTTP ${response.status}）。`);
  }
  return payload;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  return parseJsonResponse<T>(response, "生成请求");
}

export function listGenerationProviders() {
  return requestJson<GenerationProvidersSnapshot>("/api/providers");
}

export function createGenerationProvider(input: SaveGenerationProviderInput) {
  return requestJson<GenerationProviderConfiguration>("/api/providers", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateGenerationProvider(id: string, input: Partial<SaveGenerationProviderInput>) {
  return requestJson<GenerationProviderConfiguration>(`/api/providers/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function deleteGenerationProvider(id: string) {
  return requestJson<{ deleted: true }>(`/api/providers/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function testGenerationProvider(id: string) {
  return requestJson<{ ok: true; message: string }>(`/api/providers/${encodeURIComponent(id)}/test`, { method: "POST" });
}

async function toArkImageUri(uri: string): Promise<string> {
  if (/^(https?:|data:|asset:)/.test(uri)) return uri;
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`无法读取参考图片：${uri}`);
  const blob = await response.blob();
  if (typeof FileReader === "undefined") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("参考图片编码失败"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}


export function squareVideoPixels(resolution: GenerationSettings["videoResolution"]) {
  return resolution === "480p" ? 480 : resolution === "720p" ? 720 : 1080;
}

export function assembleTransitionPrompt(request: Pick<TransitionGenerationRequest,
  "characterName" | "identityPrompt" | "stylePrompt" | "prompt" | "settings" | "transparentVideo" | "chromaBackgroundColor"
>) {
  const identityPrompt = materializePromptVariables(request.identityPrompt, request.characterName);
  const stylePrompt = materializePromptVariables(request.stylePrompt, request.characterName);
  const actionPrompt = materializePromptVariables(request.prompt, request.characterName);
  const cameraRequirements = [
    "摄影机安装在固定三脚架上，位置、朝向和光轴必须从第一帧到最后一帧完全固定。",
    "禁止平移、摇摄、俯仰、旋转、环绕、推进、拉远、变焦、裁切、重新构图、镜头呼吸或任何虚拟摄影机运动。",
    "焦距、视场角、传感器裁切、景深、透视关系、消失点、地平线和机位高度必须保持完全一致。",
    "角色在 1:1 画布中的中心点、脚底基线、包围盒大小和头身比例必须稳定；动作只能由角色身体局部产生，不能通过镜头运动伪造。",
    "角色不能朝镜头前后移动导致比例变化；除动作本身外，角色整体缩放必须固定。",
    "光源方向、曝光、白平衡和角色自身明暗必须稳定，禁止画面闪烁、纹理漂移、光晕、粒子或突然出现的新物体。",
  ].join("\n");
  const outputRequirements = request.transparentVideo
    ? `全程使用单一纯色 ${request.chromaBackgroundColor.toUpperCase()} 背景。画布每个背景像素必须是完全相同的颜色，禁止渐变、聚光、暗角、地面、水平线、投影、接触阴影、倒影、环境反射、背景纹理、色彩溢出或工作室布光痕迹。角色像悬浮在纯色画布上一样，轮廓和毛发边缘清晰，角色身体上不得新增 ${request.chromaBackgroundColor.toUpperCase()} 色。`
    : "背景必须像锁定的静态底图一样保持不动，已有阴影的位置、形状、深浅不得变化，禁止新增或消失阴影。";
  return [
    "【参考图职责】",
    "图片1是必须严格保持的第一帧。图片2是目标状态权威参考，结尾姿态与构图向图片2收敛，但动作必须连续自然。其余图片只用于稳定同一角色的身份。",
    "【角色身份】",
    [identityPrompt, GENERIC_IDENTITY_LOCK].filter(Boolean).join("\n"),
    "【视觉风格】",
    stylePrompt,
    "【动作要求】",
    actionPrompt,
    "【摄影机与构图锁定】",
    cameraRequirements,
    "【背景与抠图约束】",
    outputRequirements,
    "【输出规格】",
    `生成无声视频，不要对白、音乐或音效。输出固定为 ${request.settings.ratio} 正方形、${request.settings.videoResolution}；第一帧必须与图片1逐像素构图衔接。`,
  ].filter(Boolean).join("\n");
}

async function submitPersistentJob(body: Record<string, unknown>) {
  return requestJson<PersistentGenerationJob>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function listPersistentJobs() {
  return requestJson<PersistentGenerationJob[]>("/api/jobs");
}

export function getPersistentJob(jobId: string) {
  return requestJson<PersistentGenerationJob>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function stateDraftPromptSegments(request: StateDraftRequest): StateDraftPromptSegment[] {
  const identityPrompt = materializePromptVariables(request.identityPrompt, request.characterName);
  const stylePrompt = materializePromptVariables(request.stylePrompt, request.characterName);
  const statePrompt = materializePromptVariables(request.prompt, request.characterName);
  return [
    {
      id: "references",
      label: "参考图职责",
      content: "所有输入图片都只用于确认同一只宠物的真实身份、脸型、体型、毛色、花纹和独特标记；不要复制原图姿势或背景。",
    },
    { id: "identity", label: "角色身份", content: [identityPrompt.trim(), GENERIC_IDENTITY_LOCK].filter(Boolean).join("\n") },
    { id: "style", label: "项目风格", content: stylePrompt.trim() },
    {
      id: "state",
      label: "目标状态",
      content: [`生成“${request.targetStateLabel}”状态的权威参考图。`, statePrompt.trim()].filter(Boolean).join("\n"),
    },
    {
      id: "output",
      label: "输出约束",
      content: [
        `正方形 ${request.settings.ratio} 构图，${request.settings.imageResolution} 清晰度，完整展示角色，保持身份、体型、毛色和视觉风格一致。`,
        request.settings.imageCandidateCount > 1
          ? `一次生成 ${request.settings.imageCandidateCount} 张彼此不同的候选图；每张都保持同一角色与同一目标状态，只改变细微表情、构图和动作细节。`
          : "只生成 1 张候选图。",
      ].join("\n"),
    },
  ];
}

export function assembleStateDraftPrompt(request: StateDraftRequest) {
  return stateDraftPromptSegments(request)
    .filter((segment) => segment.content)
    .map((segment) => `【${segment.label}】\n${segment.content}`)
    .join("\n");
}

export async function buildStateDraftJobSubmission(request: PersistentStateDraftRequest, resolveImage: (uri: string) => Promise<string> = toArkImageUri) {
  const prompt = assembleStateDraftPrompt(request);
  const images = await Promise.all(request.identityReferenceUris.slice(0, 10).map(resolveImage));
  return {
    id: request.jobId,
    kind: "state-image",
    providerId: request.settings.imageProviderId,
    capability: "image",
    model: request.settings.imageModel,
    trigger: request.trigger,
    assembledPrompt: prompt,
    cost: toPersistentJobCost(estimateImageGenerationCost(request.settings.imageModel, request.settings.imageCandidateCount)),
    request: {
      model: request.settings.imageModel,
      prompt,
      referenceImages: images,
      resolution: request.settings.imageResolution,
      candidateCount: request.settings.imageCandidateCount,
    },
  };
}

export async function buildTransitionJobSubmission(request: PersistentTransitionRequest, resolveImage: (uri: string) => Promise<string> = toArkImageUri) {
  const [firstFrame, lastFrame] = await Promise.all([
    resolveImage(request.fromStateImageUri),
    resolveImage(request.targetDraftImageUri),
  ]);
  const providerRequest: Record<string, unknown> = {
    model: request.settings.videoModel,
    prompt: assembleTransitionPrompt(request),
    firstFrame,
    lastFrame,
    identityReferences: await Promise.all(request.identityReferenceUris.slice(0, 7).map(resolveImage)),
    resolution: request.settings.videoResolution,
    ratio: request.settings.ratio,
  };
  if (request.durationMode === "fixed" && request.durationSeconds) providerRequest.durationSeconds = request.durationSeconds;
  return {
    id: request.jobId,
    kind: "transition-video",
    providerId: request.settings.videoProviderId,
    capability: "video",
    model: request.settings.videoModel,
    trigger: request.trigger,
    cost: toPersistentJobCost(estimateVideoGenerationCost({
      model: request.settings.videoModel,
      resolution: request.settings.videoResolution,
      durationMode: request.durationMode,
      durationSeconds: request.durationSeconds,
    })),
    request: providerRequest,
    assembledPrompt: assembleTransitionPrompt(request),
    chromaKeyColor: request.chromaBackgroundColor.toUpperCase(),
    postprocess: {
      transparentVideo: request.transparentVideo,
      resolution: request.settings.videoResolution,
      keyColor: request.transparencyKeyColor,
      similarity: request.transparencySimilarity,
    },
  };
}

export async function submitStateDraftJob(request: PersistentStateDraftRequest) {
  return submitPersistentJob(await buildStateDraftJobSubmission(request));
}

export async function submitTransitionJob(request: PersistentTransitionRequest) {
  return submitPersistentJob(await buildTransitionJobSubmission(request));
}

export function createSandboxImageGenerationProvider(options: { stepDelayMs?: number } = {}): ImageGenerationProvider {
  const stepDelayMs = options.stepDelayMs ?? 360;
  return {
    id: "sandbox-image",
    capability: "image",
    async generateStateDraft(request) {
      await wait(stepDelayMs * 2);
      return {
        uri: "/demo/pip/state-sitting.png",
        mimeType: "image/png",
        provider: this.id,
        model: request.settings.imageModel,
      };
    },
  };
}

export function createSandboxVideoGenerationProvider(options: { stepDelayMs?: number } = {}): VideoGenerationProvider {
  const stepDelayMs = options.stepDelayMs ?? 360;
  return {
    id: "sandbox-video",
    capability: "video",
    async generateTransition(request, onProgress) {
      for (const progress of [24, 48, 73, 91]) {
        await wait(stepDelayMs);
        onProgress?.(progress);
      }
      return {
        video: {
          uri: `sandbox://transitions/${crypto.randomUUID()}.webm`,
          mimeType: "video/webm",
          provider: this.id,
          model: request.settings.videoModel,
          pixelWidth: squareVideoPixels(request.settings.videoResolution),
          pixelHeight: squareVideoPixels(request.settings.videoResolution),
          silent: true,
          hasAlpha: request.transparentVideo,
        },
        extractedTail: {
          uri: request.targetDraftImageUri,
          mimeType: "image/png",
          provider: this.id,
          model: request.settings.videoModel,
          pixelWidth: squareVideoPixels(request.settings.videoResolution),
          pixelHeight: squareVideoPixels(request.settings.videoResolution),
          hasAlpha: request.transparentVideo,
        },
        durationMs: request.durationSeconds ? request.durationSeconds * 1000 : undefined,
      };
    },
  };
}

export const sandboxImageGenerationProvider = createSandboxImageGenerationProvider();
export const sandboxVideoGenerationProvider = createSandboxVideoGenerationProvider();
