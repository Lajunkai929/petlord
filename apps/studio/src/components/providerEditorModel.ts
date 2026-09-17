import type { GenerationProviderCapability, GenerationProviderConfiguration, GenerationProviderProtocol, GenerationProviderType, GenerationProvidersSnapshot, SaveGenerationProviderInput } from "@petlord/generation";

export interface ProviderDraft {
  id?: string;
  presetId: string;
  type: GenerationProviderType;
  capability: GenerationProviderCapability;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
  modelIds: string[];
  modelPrices: Record<string, number | undefined>;
}
export const presetNames: Record<string, string> = { "volcengine-ark": "火山方舟", openai: "OpenAI", siliconflow: "硅基流动", other: "其他服务" };
export const presetName = (id: string) => Object.hasOwn(presetNames, id) ? presetNames[id] : undefined;
export const protocolHelp: Record<GenerationProviderType, string> = {
  "volcengine-ark": "适用于火山方舟的 Seedream 图片、Seedance 视频及兼容服务。",
  "openai-compatible": "支持 OpenAI 图片生成与编辑接口，编辑接口需要接受 JSON 图片引用。",
  siliconflow: "适用于硅基流动的图片生成与编辑接口，参考图数量受所选模型限制。",
};
export function providerProtocols(snapshot: GenerationProvidersSnapshot | null): GenerationProviderProtocol[] {
  return snapshot?.protocols ?? [{ id: "volcengine-ark", label: "火山方舟", description: "Seedream 图片与 Seedance 视频", capabilities: ["image", "video"] }];
}
export function newProviderDraft(snapshot: GenerationProvidersSnapshot, presetId: string, capability?: GenerationProviderCapability): ProviderDraft {
  const preset = snapshot.catalog.find(entry => (entry.id ?? entry.type) === presetId);
  const use = capability && preset?.capabilities.includes(capability) ? capability : preset?.capabilities[0] ?? capability ?? "image";
  const type = preset?.type ?? providerProtocols(snapshot).find(protocol => protocol.capabilities.includes(use))!.id;
  return { presetId, type, capability: use, name: preset ? `${presetName(presetId) ?? preset.label} · ${use === "image" ? "图片" : "视频"}` : "", baseUrl: preset?.defaultBaseUrl ?? "", apiKey: "", enabled: true, modelIds: preset?.models[use].map(model => model.id) ?? [], modelPrices: Object.fromEntries((preset?.models[use] ?? []).map(model => [model.id, model.estimatedUnitCostCny])) };
}
export function editProviderDraft(provider: GenerationProviderConfiguration): ProviderDraft {
  return { id: provider.id, presetId: provider.presetId ?? (provider.type === "volcengine-ark" ? "volcengine-ark" : "other"), type: provider.type, capability: provider.capability, name: provider.name, baseUrl: provider.baseUrl, enabled: provider.enabled, apiKey: "", modelIds: provider.models.map(model => model.id), modelPrices: Object.fromEntries(provider.models.map(model => [model.id, model.estimatedUnitCostCny])) };
}
function modelPrice(draft: ProviderDraft, rawId: string) {
  const key = Object.hasOwn(draft.modelPrices, rawId) ? rawId : rawId.trim();
  return Object.hasOwn(draft.modelPrices, key) ? draft.modelPrices[key] : undefined;
}
function duplicateModelIds(ids: string[]) {
  const normalized = ids.map(id => id.trim()).filter(Boolean);
  return new Set(normalized).size !== normalized.length;
}
export type ProviderDraftErrors = Partial<Record<"name" | "apiKey" | "baseUrl" | "modelIds" | "type", string>>;
export function providerDraftErrors(draft: ProviderDraft, snapshot: GenerationProvidersSnapshot | null): ProviderDraftErrors {
  const errors: ProviderDraftErrors = {};
  if (!draft.name.trim()) errors.name = "请输入服务名称。";
  if (!draft.id && !draft.apiKey.trim()) errors.apiKey = "请输入 API Key。";
  try {
    const url = new URL(draft.baseUrl.trim());
    if (url.username || url.password || url.hash || url.search || !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new Error();
  } catch { errors.baseUrl = "请输入 HTTPS 地址，或本机 HTTP 地址；不包含账号、查询参数或片段。"; }
  if (!draft.modelIds.some(id => id.trim())) errors.modelIds = "至少填写一个模型 ID，输入后按 Enter 确认。";
  if (draft.modelIds.some(id => !id.trim() || id.trim().length > 256 || /\s/.test(id.trim()))) errors.modelIds = "模型 ID 不能包含空白，且最多 256 个字符。";
  if (draft.modelIds.some(id => { const price = modelPrice(draft, id); return price !== undefined && (!Number.isFinite(price) || price <= 0 || price > 5000); })) errors.modelIds = "预估费用需大于零且不超过 5000 元。";
  if (duplicateModelIds(draft.modelIds)) errors.modelIds = "模型 ID 去除首尾空白后不能重复，请合并重复模型。";
  if (draft.modelIds.length > 100) errors.modelIds = "每个服务最多配置 100 个模型。";
  if (!providerProtocols(snapshot).find(protocol => protocol.id === draft.type)?.capabilities.includes(draft.capability)) errors.type = "此协议不支持当前生成用途，请重新选择。";
  return errors;
}
export function buildProviderInput(draft: ProviderDraft, original?: GenerationProviderConfiguration): SaveGenerationProviderInput {
  const originals = new Map(original?.models.map(model => [model.id, model]));
  if (duplicateModelIds(draft.modelIds)) throw new Error("模型 ID 去除首尾空白后不能重复，请合并重复模型。");
  const models = draft.modelIds.map(rawId => ({ id: rawId.trim(), price: modelPrice(draft, rawId) })).filter(model => model.id);
  return { type: draft.type, presetId: draft.presetId, capability: draft.capability, name: draft.name.trim(), baseUrl: draft.baseUrl.trim().replace(/\/+$/, ""), enabled: draft.enabled, models: models.map(({ id, price }) => {
    const { estimatedUnitCostCny: _previous, ...model } = originals.get(id) ?? { id, label: id, description: "" };
    return { ...model, ...(price !== undefined ? { estimatedUnitCostCny: price } : {}) };
  }), ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}) };
}
