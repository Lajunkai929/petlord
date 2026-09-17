import { useState } from "react";
import { Alert, Button, DialogContent, SelectField, Dialog } from "@petlord/ui";
import { ArrowSquareOut, SlidersHorizontal, X } from "@phosphor-icons/react";

import type { GenerationSettings } from "@petlord/schema";
import type { GenerationProviderCapability, GenerationProviderConfiguration } from "@petlord/generation";
import type { GenerationProvidersController } from "../hooks/useGenerationProviders";

export function GenerationSettingsDialog({ settings, providers, onChange, onManageProviders }: {
  settings: GenerationSettings;
  providers: GenerationProvidersController;
  onChange: (settings: GenerationSettings) => void;
  onManageProviders: () => void;
}) {
  const [open, setOpen] = useState(false);
  const snapshot = providers.snapshot;
  const imageProviders = snapshot?.providers.filter(provider => provider.capability === "image") ?? [];
  const videoProviders = snapshot?.providers.filter(provider => provider.capability === "video") ?? [];
  const selectedImageProvider = selectedProvider(imageProviders, settings.imageProviderId, snapshot?.defaults.image);
  const selectedVideoProvider = selectedProvider(videoProviders, settings.videoProviderId, snapshot?.defaults.video);
  const imageModels = selectedImageProvider?.models ?? [];
  const videoModels = selectedVideoProvider?.models ?? [];
  const seedream5 = selectedImageProvider?.type === "volcengine-ark" && settings.imageModel.startsWith("doubao-seedream-5-");
  const modelSize = selectedImageProvider?.type === "siliconflow"
    ? settings.imageModel === "Qwen/Qwen-Image" ? "1328 × 1328"
      : ["Qwen/Qwen-Image-Edit", "Qwen/Qwen-Image-Edit-2509"].includes(settings.imageModel) ? "由模型决定" : undefined
    : undefined;
  const patch = (next: Partial<GenerationSettings>) => onChange({ ...settings, ...next });
  function chooseProvider(capability: GenerationProviderCapability, id: string) {
    const provider = snapshot?.providers.find(candidate => candidate.id === id);
    if (!provider?.enabled || provider.capability !== capability) return;
    const currentModel = capability === "image" ? settings.imageModel : settings.videoModel;
    const model = provider.models.find(model => model.id === currentModel)?.id ?? provider.models[0]?.id;
    patch(capability === "image" ? { imageProviderId: id, ...(model ? { imageModel: model, ...(provider.type === "volcengine-ark" && model.startsWith("doubao-seedream-5-") ? { imageResolution: "2K" as const } : {}) } : {}) } : { videoProviderId: id, ...(model ? { videoModel: model } : {}) });
  }
  const selections = [
    { capability: "image" as const, label: "图片服务", providers: imageProviders, requestedId: settings.imageProviderId, selected: selectedImageProvider },
    { capability: "video" as const, label: "视频服务", providers: videoProviders, requestedId: settings.videoProviderId, selected: selectedVideoProvider },
  ];
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Trigger asChild><Button type="default" icon={<SlidersHorizontal size={16} />}>生成设置</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><DialogContent className="dialog-content generation-dialog project-generation-dialog">
      <div className="dialog-heading"><div><Dialog.Title>生成设置</Dialog.Title><Dialog.Description>为当前项目选择服务、模型与输出参数。</Dialog.Description></div><Dialog.Close asChild><Button type="text" htmlType="button" className="icon-button" aria-label="关闭"><X size={18} /></Button></Dialog.Close></div>
      <div className="generation-services-heading"><h3>当前项目使用</h3><Button type="link" icon={<ArrowSquareOut size={15} />} onClick={() => { setOpen(false); onManageProviders(); }}>管理模型服务</Button></div>
      {providers.status === "offline" && <Alert type="error" title="无法连接本机服务，请确认 PetLord 正在运行。" showIcon />}
      <div className="model-setting-grid">{selections.map(item => {
        const missing = Boolean(item.requestedId && !item.selected);
        const unavailable = missing || item.selected?.enabled === false;
        return <div className="field-block" key={item.capability}>
          <label htmlFor={`project-${item.capability}-provider`}>{item.label}</label>
          <SelectField id={`project-${item.capability}-provider`} value={item.requestedId ?? item.selected?.id ?? ""} aria-invalid={unavailable} aria-describedby={unavailable ? `project-${item.capability}-provider-status` : undefined} disabled={!item.providers.some(provider => provider.enabled)} onChange={event => chooseProvider(item.capability, event.target.value)}>
            {missing && <option value={item.requestedId} disabled>原服务已删除，请重新选择</option>}
            {!item.selected && !item.requestedId && <option value="" disabled>{item.providers.length ? "暂无可用服务" : "尚未添加服务"}</option>}
            {item.providers.map(provider => <option key={provider.id} value={provider.id} disabled={!provider.enabled}>{provider.name}{provider.enabled ? "" : "（已停用）"}</option>)}
          </SelectField>
          {unavailable && <small id={`project-${item.capability}-provider-status`} role="status">{missing ? "项目保存的服务已不存在，请重新选择服务。" : "此服务已停用，请选择其他服务或在模型服务中启用。"}</small>}
        </div>;
      })}</div>
          <div className="generation-model-section">
            <h3>输出设置</h3>
            <div className="model-setting-grid">
              <div className="field-block">
                <label htmlFor="image-model">状态图片模型</label>
                <SelectField id="image-model" value={settings.imageModel} disabled={!selectedImageProvider?.enabled} onChange={(event) => {
                  const option = imageModels.find((model) => model.id === event.target.value);
                  if (option) patch({ imageModel: option.id, imageMode: "native-image", ...(selectedImageProvider?.type === "volcengine-ark" && option.id.startsWith("doubao-seedream-5-") ? { imageResolution: "2K" as const } : {}) });
                }}>
                  {!imageModels.some(model => model.id === settings.imageModel) && <option value={settings.imageModel} disabled>{imageModels.length ? "请选择可用模型" : "尚未配置模型"}</option>}{imageModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </SelectField>
                <small>{imageModels.find((model) => model.id === settings.imageModel)?.description}</small>
              </div>
              <div className="field-block">
                <label htmlFor="video-model">转换视频模型</label>
                <SelectField id="video-model" value={settings.videoModel} disabled={!selectedVideoProvider?.enabled} onChange={(event) => patch({ videoModel: event.target.value })}>
                  {!videoModels.some(model => model.id === settings.videoModel) && <option value={settings.videoModel} disabled>{videoModels.length ? "请选择可用模型" : "尚未配置模型"}</option>}{videoModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </SelectField>
                <small>{videoModels.find((model) => model.id === settings.videoModel)?.description}</small>
              </div>
            </div>

            <div className="model-setting-grid">
              <div className="field-block">
                <label htmlFor="image-resolution">图片清晰度</label>
                <SelectField id="image-resolution" aria-label="图片清晰度" disabled={Boolean(modelSize)} value={modelSize ? "model-size" : settings.imageResolution} onChange={(event) => patch({ imageResolution: event.target.value as "1K" | "2K" })}>
                  {modelSize ? <option value="model-size">{modelSize}</option> : <><option value="1K" disabled={seedream5}>1K · {seedream5 ? "此模型不支持" : "1024 × 1024"}</option>
                  <option value="2K">2K · {seedream5 ? "当前模型最低档" : "2048 × 2048"}</option></>}
                </SelectField>
                <small>{modelSize ? modelSize === "由模型决定" ? "此编辑模型按参考图决定输出尺寸，不能指定 1K 或 2K。" : "此模型使用服务支持的正方形尺寸。" : "固定正方形 1:1"}</small>
              </div>
              <div className="field-block">
                <label htmlFor="video-resolution">视频清晰度</label>
                <SelectField id="video-resolution" aria-label="视频清晰度" value={settings.videoResolution} onChange={(event) => patch({ videoResolution: event.target.value as "480p" | "720p" | "1080p" })}>
                  <option value="480p">480p · 最低成本</option>
                  <option value="720p">720p · 高清母版</option>
                  <option value="1080p">1080p · 最高质量</option>
                </SelectField>
                <small>固定正方形 1:1；运行时可独立降分辨率</small>
              </div>
            </div>

            <div className="duration-setting">
              <div><strong>默认视频时长</strong><span>每条转换仍可单独覆盖</span></div>
              <SelectField aria-label="默认视频时长" value={settings.durationMode === "smart" ? "smart" : String(settings.durationSeconds ?? 4)} onChange={(event) => {
                if (event.target.value === "smart") patch({ durationMode: "smart", durationSeconds: undefined });
                else patch({ durationMode: "fixed", durationSeconds: Number(event.target.value) });
              }}>
                <option value="smart">智能时长</option>
                {[4, 5, 6, 8, 10, 12, 15].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
              </SelectField>
            </div>
          </div>
    </DialogContent></Dialog.Portal>
  </Dialog.Root>;
}
function selectedProvider(providers: GenerationProviderConfiguration[], requestedId?: string, defaultId?: string) {
  if (requestedId !== undefined) return providers.find(provider => provider.id === requestedId);
  return providers.find(provider => provider.id === defaultId) ?? providers.find(provider => provider.enabled);
}
