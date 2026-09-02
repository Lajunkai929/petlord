import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle,
  ImageSquare,
  PencilSimple,
  Plus,
  SlidersHorizontal,
  SpinnerGap,
  Trash,
  VideoCamera,
  Warning,
  X,
} from "@phosphor-icons/react";
import type { GenerationSettings } from "@petlord/schema";
import {
  imageModelOptions,
  videoModelOptions,
  type GenerationProviderCapability,
  type GenerationProviderConfiguration,
  type GenerationProviderType,
} from "@petlord/generation";
import type { GenerationProvidersController } from "../hooks/useGenerationProviders";

interface GenerationSettingsDialogProps {
  settings: GenerationSettings;
  providers: GenerationProvidersController;
  onChange: (settings: GenerationSettings) => void;
}

interface ProviderEditorState {
  id?: string;
  type: GenerationProviderType;
  capability: GenerationProviderCapability;
  name: string;
  apiKey: string;
  baseUrl: string;
  enabled: boolean;
}

const capabilityCopy: Record<GenerationProviderCapability, { title: string; empty: string; icon: ReactNode }> = {
  image: { title: "图片 Provider", empty: "先添加图片 Provider，才能生成状态参考图。", icon: <ImageSquare size={18} /> },
  video: { title: "视频 Provider", empty: "先添加视频 Provider，才能生成过渡动画。", icon: <VideoCamera size={18} /> },
};

export function GenerationSettingsDialog({ settings, providers, onChange }: GenerationSettingsDialogProps) {
  const [editor, setEditor] = useState<ProviderEditorState | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const snapshot = providers.snapshot;
  const imageProviders = snapshot?.providers.filter((provider) => provider.capability === "image") ?? [];
  const videoProviders = snapshot?.providers.filter((provider) => provider.capability === "video") ?? [];
  const selectedImageProvider = selectedProvider(imageProviders, settings.imageProviderId, snapshot?.defaults.image);
  const selectedVideoProvider = selectedProvider(videoProviders, settings.videoProviderId, snapshot?.defaults.video);
  const imageModels = selectedImageProvider?.models ?? imageModelOptions;
  const videoModels = selectedVideoProvider?.models ?? videoModelOptions;
  const ready = Boolean(selectedImageProvider?.enabled && selectedVideoProvider?.enabled);

  function patch(next: Partial<GenerationSettings>) {
    onChange({ ...settings, ...next });
  }

  function beginCreate(capability: GenerationProviderCapability) {
    const catalog = snapshot?.catalog.find((entry) => entry.capabilities.includes(capability));
    setFeedback(null);
    setEditor({
      type: catalog?.type ?? "volcengine-ark",
      capability,
      name: capability === "image" ? "Volcengine Ark · Images" : "Volcengine Ark · Video",
      apiKey: "",
      baseUrl: catalog?.defaultBaseUrl ?? "https://ark.cn-beijing.volces.com/api/v3",
      enabled: true,
    });
  }

  function beginEdit(provider: GenerationProviderConfiguration) {
    setFeedback(null);
    setEditor({
      id: provider.id,
      type: provider.type,
      capability: provider.capability,
      name: provider.name,
      apiKey: "",
      baseUrl: provider.baseUrl,
      enabled: provider.enabled,
    });
  }

  async function saveProvider(event: FormEvent) {
    event.preventDefault();
    if (!editor) return;
    setSaving(true);
    setFeedback(null);
    try {
      const saved = editor.id
        ? await providers.update(editor.id, {
            name: editor.name,
            baseUrl: editor.baseUrl,
            enabled: editor.enabled,
            ...(editor.apiKey.trim() ? { apiKey: editor.apiKey.trim() } : {}),
          })
        : await providers.create({
            type: editor.type,
            capability: editor.capability,
            name: editor.name,
            apiKey: editor.apiKey.trim(),
            baseUrl: editor.baseUrl,
            enabled: editor.enabled,
          });
      const firstModel = saved.models[0]?.id;
      if (saved.capability === "image") {
        patch({ imageProviderId: saved.id, ...(firstModel ? { imageModel: firstModel } : {}) });
      } else {
        patch({ videoProviderId: saved.id, ...(firstModel ? { videoModel: firstModel } : {}) });
      }
      setEditor(null);
      setFeedback({ kind: "success", message: `${saved.name} 已保存在本机。` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Provider 保存失败。" });
    } finally {
      setSaving(false);
    }
  }

  async function testProvider(provider: GenerationProviderConfiguration) {
    setActionId(provider.id);
    setFeedback(null);
    try {
      await providers.test(provider.id);
      setFeedback({ kind: "success", message: `${provider.name} 连接验证成功。` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "连接验证失败。" });
    } finally {
      setActionId(null);
    }
  }

  async function removeProvider(provider: GenerationProviderConfiguration) {
    if (!window.confirm(`删除 Provider“${provider.name}”？本机保存的凭据也会一起删除。`)) return;
    setActionId(provider.id);
    setFeedback(null);
    try {
      const next = await providers.remove(provider.id);
      if (provider.capability === "image" && selectedImageProvider?.id === provider.id) {
        patch({ imageProviderId: next.defaults.image });
      }
      if (provider.capability === "video" && selectedVideoProvider?.id === provider.id) {
        patch({ videoProviderId: next.defaults.video });
      }
      setFeedback({ kind: "success", message: `${provider.name} 已删除。` });
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "Provider 删除失败。" });
    } finally {
      setActionId(null);
    }
  }

  function chooseProvider(capability: GenerationProviderCapability, id: string) {
    const provider = snapshot?.providers.find((candidate) => candidate.id === id);
    if (!provider) return;
    const firstModel = provider.models[0]?.id;
    if (capability === "image") {
      patch({ imageProviderId: id, ...(provider.models.some((model) => model.id === settings.imageModel) ? {} : firstModel ? { imageModel: firstModel } : {}) });
    } else {
      patch({ videoProviderId: id, ...(provider.models.some((model) => model.id === settings.videoModel) ? {} : firstModel ? { videoModel: firstModel } : {}) });
    }
  }

  const providerPanels = useMemo(() => ([
    { capability: "image" as const, configured: imageProviders, selected: selectedImageProvider },
    { capability: "video" as const, configured: videoProviders, selected: selectedVideoProvider },
  ]), [imageProviders, selectedImageProvider, selectedVideoProvider, videoProviders]);

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="ghost-button model-settings-button" type="button">
          <SlidersHorizontal size={16} />模型与 Provider
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content generation-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>生成模型与 Provider</Dialog.Title>
              <Dialog.Description>图片与视频独立选择 Provider；凭据只保存在本机服务中。</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="关闭">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className={`provider-health ${providers.status === "online" && ready ? "is-ready" : "is-warning"}`}>
            {providers.status === "loading" ? <SpinnerGap className="spin" size={18} /> : providers.status === "online" && ready ? <CheckCircle size={18} weight="fill" /> : <Warning size={18} weight="fill" />}
            <div>
              <strong>{providers.status === "offline" ? "本地生成服务未启动" : ready ? "图片与视频 Provider 已就绪" : providers.status === "loading" ? "正在读取 Provider" : "需要完成 Provider 配置"}</strong>
              <span>{providers.status === "online" ? "应用可无 Token 启动；API Key 不会返回浏览器。" : "请先确认 generation-api 正在运行。"}</span>
            </div>
          </div>

          <div className="provider-columns">
            {providerPanels.map(({ capability, configured, selected }) => {
              const copy = capabilityCopy[capability];
              return (
                <section className="provider-panel" key={capability}>
                  <header><span>{copy.icon}</span><div><strong>{copy.title}</strong><small>{configured.length} 个已配置</small></div></header>
                  {configured.length > 0 ? (
                    <>
                      <label className="provider-select-label">
                        当前使用
                        <select value={selected?.id ?? ""} onChange={(event) => chooseProvider(capability, event.target.value)}>
                          {configured.map((provider) => <option key={provider.id} value={provider.id} disabled={!provider.enabled}>{provider.name}{provider.enabled ? "" : "（已停用）"}</option>)}
                        </select>
                      </label>
                      {selected && (
                        <div className="provider-card-detail">
                          <div><strong>{selected.type === "volcengine-ark" ? "Volcengine Ark" : selected.type}</strong><span>{selected.credentialHint}</span></div>
                          <small title={selected.baseUrl}>{selected.baseUrl}</small>
                          <div className="provider-card-actions">
                            <button type="button" onClick={() => void testProvider(selected)} disabled={actionId === selected.id}>{actionId === selected.id ? <SpinnerGap className="spin" size={14} /> : <CheckCircle size={14} />}验证</button>
                            <button type="button" onClick={() => beginEdit(selected)}><PencilSimple size={14} />编辑</button>
                            <button className="is-danger" type="button" onClick={() => void removeProvider(selected)} disabled={actionId === selected.id}><Trash size={14} />删除</button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : <p className="provider-empty">{copy.empty}</p>}
                  <button className="provider-add-button" type="button" onClick={() => beginCreate(capability)} disabled={providers.status !== "online"}><Plus size={14} />添加{copy.title}</button>
                </section>
              );
            })}
          </div>

          {editor && (
            <form className="provider-editor" onSubmit={(event) => void saveProvider(event)}>
              <div><strong>{editor.id ? "编辑" : "添加"}{capabilityCopy[editor.capability].title}</strong><button className="icon-button" type="button" onClick={() => setEditor(null)} aria-label="取消编辑"><X size={15} /></button></div>
              <div className="provider-editor-grid">
                <label>名称<input required maxLength={80} value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} /></label>
                <label>类型<select value={editor.type} disabled><option value="volcengine-ark">Volcengine Ark</option></select></label>
                <label className="is-wide">API Base URL<input required type="url" value={editor.baseUrl} onChange={(event) => setEditor({ ...editor, baseUrl: event.target.value })} /></label>
                <label className="is-wide">API Key<input required={!editor.id} type="password" autoComplete="off" placeholder={editor.id ? "留空以保留现有 API Key" : "粘贴 API Key"} value={editor.apiKey} onChange={(event) => setEditor({ ...editor, apiKey: event.target.value })} /></label>
              </div>
              <label className="provider-enabled"><input type="checkbox" checked={editor.enabled} onChange={(event) => setEditor({ ...editor, enabled: event.target.checked })} />启用这个 Provider</label>
              <footer><button className="ghost-button" type="button" onClick={() => setEditor(null)}>取消</button><button className="primary-button" type="submit" disabled={saving}>{saving ? <SpinnerGap className="spin" size={15} /> : null}保存到本机</button></footer>
            </form>
          )}

          {feedback && <p className={`provider-feedback is-${feedback.kind}`}>{feedback.message}</p>}

          <div className="generation-model-section">
            <h3>模型与输出</h3>
            <div className="model-setting-grid">
              <div className="field-block">
                <label htmlFor="image-model">状态图片模型</label>
                <select id="image-model" value={settings.imageModel} disabled={!selectedImageProvider} onChange={(event) => {
                  const option = imageModels.find((model) => model.id === event.target.value);
                  if (option) patch({ imageModel: option.id, imageMode: "native-image", ...(option.id.startsWith("doubao-seedream-5-") ? { imageResolution: "2K" as const } : {}) });
                }}>
                  {imageModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
                <small>{imageModels.find((model) => model.id === settings.imageModel)?.description}</small>
              </div>
              <div className="field-block">
                <label htmlFor="video-model">转换视频模型</label>
                <select id="video-model" value={settings.videoModel} disabled={!selectedVideoProvider} onChange={(event) => patch({ videoModel: event.target.value })}>
                  {videoModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                </select>
                <small>{videoModels.find((model) => model.id === settings.videoModel)?.description}</small>
              </div>
            </div>

            <div className="model-setting-grid">
              <div className="field-block">
                <label htmlFor="image-resolution">图片清晰度</label>
                <select id="image-resolution" aria-label="图片清晰度" value={settings.imageResolution} onChange={(event) => patch({ imageResolution: event.target.value as "1K" | "2K" })}>
                  <option value="1K" disabled={settings.imageModel.startsWith("doubao-seedream-5-")}>1K · {settings.imageModel.startsWith("doubao-seedream-5-") ? "Seedream 5.0 不支持" : "最低成本"}</option>
                  <option value="2K">2K · {settings.imageModel.startsWith("doubao-seedream-5-") ? "当前模型最低档" : "更清晰"}</option>
                </select>
                <small>固定正方形 1:1</small>
              </div>
              <div className="field-block">
                <label htmlFor="video-resolution">视频清晰度</label>
                <select id="video-resolution" aria-label="视频清晰度" value={settings.videoResolution} onChange={(event) => patch({ videoResolution: event.target.value as "480p" | "720p" | "1080p" })}>
                  <option value="480p">480p · 最低成本</option>
                  <option value="720p">720p · 高清母版</option>
                  <option value="1080p">1080p · 最高质量</option>
                </select>
                <small>固定正方形 1:1；运行时可独立降分辨率</small>
              </div>
            </div>

            <div className="duration-setting">
              <div><strong>默认视频时长</strong><span>每条转换仍可单独覆盖</span></div>
              <select aria-label="默认视频时长" value={settings.durationMode === "smart" ? "smart" : String(settings.durationSeconds ?? 4)} onChange={(event) => {
                if (event.target.value === "smart") patch({ durationMode: "smart", durationSeconds: undefined });
                else patch({ durationMode: "fixed", durationSeconds: Number(event.target.value) });
              }}>
                <option value="smart">智能时长</option>
                {[4, 5, 6, 8, 10, 12, 15].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
              </select>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function selectedProvider(providers: GenerationProviderConfiguration[], requestedId?: string, defaultId?: string) {
  return providers.find((provider) => provider.id === requestedId)
    ?? providers.find((provider) => provider.id === defaultId)
    ?? providers.find((provider) => provider.enabled);
}
