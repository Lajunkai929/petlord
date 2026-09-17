import { Button } from "@petlord/ui";
import { Palette, Sparkle, SpinnerGap } from "@phosphor-icons/react";
import type { VideoBackgroundSettingsController } from "../hooks/useVideoBackgroundSettings";

const presets = ["#00FF00", "#FFFFFF", "#006CFF", "#FF00FF"];

export function VideoBackgroundSettings({ controller }: { controller: VideoBackgroundSettingsController }) {
  return (
    <section className="video-background-settings">
      <header><Palette size={16} weight="fill" /><div><strong>视频抠图底色</strong><span>项目级设置 · 会写入最终 Seedance 提示词</span></div></header>
      <div className="video-background-mode" role="group" aria-label="抠图背景色模式">
        <button type="button" className={controller.settings.mode === "auto" ? "is-active" : ""} onClick={() => controller.setMode("auto")}><strong>自动避色</strong><small>分析宠物主色</small></button>
        <button type="button" className={controller.settings.mode === "manual" ? "is-active" : ""} onClick={() => controller.setMode("manual")}><strong>手动指定</strong><small>覆盖自动结果</small></button>
      </div>
      <div className="video-background-current">
        <i style={{ "--video-key-color": controller.effectiveColor } as React.CSSProperties} />
        <span><small>当前生成底色</small><strong>{controller.effectiveColor}</strong></span>
        {controller.settings.mode === "auto" && <Button type="default" htmlType="button" disabled={controller.analyzing} onClick={controller.recalculate}>{controller.analyzing ? <SpinnerGap className="spin" size={13} /> : <Sparkle size={13} weight="fill" />}{controller.analyzing ? "分析中" : "重新计算"}</Button>}
      </div>
      {controller.settings.mode === "manual" && (
        <div className="video-background-manual">
          <label>自定义颜色<input aria-label="自定义视频背景色" type="color" value={controller.settings.manualColor} onChange={(event) => controller.setManualColor(event.target.value)} /></label>
          <div>{presets.map((color) => <button type="button" aria-label={`使用 ${color}`} className={controller.settings.manualColor === color ? "is-active" : ""} style={{ "--video-key-color": color } as React.CSSProperties} key={color} onClick={() => controller.setManualColor(color)} />)}</div>
        </div>
      )}
    </section>
  );
}
