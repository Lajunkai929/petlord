import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle, SlidersHorizontal, Warning, X } from "@phosphor-icons/react";
import type { GenerationSettings } from "@petlord/schema";
import { imageModelOptions, videoModelOptions } from "@petlord/generation";

interface GenerationSettingsDialogProps {
  settings: GenerationSettings;
  apiConfigured: boolean | null;
  onChange: (settings: GenerationSettings) => void;
}

export function GenerationSettingsDialog({ settings, apiConfigured, onChange }: GenerationSettingsDialogProps) {
  function patch(next: Partial<GenerationSettings>) {
    onChange({ ...settings, ...next });
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="ghost-button model-settings-button" type="button">
          <SlidersHorizontal size={16} />模型
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content generation-dialog">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>生成模型</Dialog.Title>
              <Dialog.Description>项目统一使用 1:1，并按模型约束采用最低有效清晰度。</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="关闭">
              <X size={18} />
            </Dialog.Close>
          </div>

          <div className={`provider-health ${apiConfigured ? "is-ready" : "is-warning"}`}>
            {apiConfigured ? <CheckCircle size={18} weight="fill" /> : <Warning size={18} weight="fill" />}
            <div>
              <strong>{apiConfigured ? "火山方舟已连接" : apiConfigured === null ? "正在检查火山方舟" : "火山方舟未配置"}</strong>
              <span>{apiConfigured ? "API Key 只保存在本地服务端" : "请在 .env.local 配置 ARK_API_KEY"}</span>
            </div>
          </div>

          <div className="model-setting-grid">
            <div className="field-block">
              <label htmlFor="image-model">状态图片模型</label>
              <select
                id="image-model"
                value={settings.imageModel}
                onChange={(event) => {
                  const option = imageModelOptions.find((model) => model.id === event.target.value);
                  if (option) patch({
                    imageModel: option.id,
                    imageMode: "native-image",
                    ...(option.id.startsWith("doubao-seedream-5-") ? { imageResolution: "2K" as const } : {}),
                  });
                }}
              >
                {imageModelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
              <small>{imageModelOptions.find((model) => model.id === settings.imageModel)?.description}</small>
            </div>
            <div className="field-block">
              <label htmlFor="video-model">转换视频模型</label>
              <select id="video-model" value={settings.videoModel} onChange={(event) => patch({ videoModel: event.target.value })}>
                {videoModelOptions.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
              </select>
              <small>{videoModelOptions.find((model) => model.id === settings.videoModel)?.description}</small>
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
            <select
              aria-label="默认视频时长"
              value={settings.durationMode === "smart" ? "smart" : String(settings.durationSeconds ?? 4)}
              onChange={(event) => {
                if (event.target.value === "smart") patch({ durationMode: "smart", durationSeconds: undefined });
                else patch({ durationMode: "fixed", durationSeconds: Number(event.target.value) });
              }}
            >
              <option value="smart">智能时长</option>
              {[4, 5, 6, 8, 10, 12, 15].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
            </select>
          </div>

          <p className="model-mode-note">状态权威参考图只调用 Seedream 图片模型；过渡动画只调用 Seedance 视频模型。</p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
