import { ArrowSquareOut, Palette, PawPrint } from "@phosphor-icons/react";
import type { StudioController } from "../hooks/useStudioController";
import { VideoBackgroundSettings } from "./VideoBackgroundSettings";
import { summarizeGenerationBudget } from "../orderOperations";
import { runtimeDisplaySizeOptions, runtimeFrameRateOptions, runtimePixelGridOptions, type RuntimeDisplaySize, type RuntimePixelGridSize } from "@petlord/runtime-react";

export function ProjectStylePanel({ studio }: { studio: StudioController }) {
  const identity = studio.identities.find((candidate) => candidate.id === studio.project.identityProfileId);
  const budget = summarizeGenerationBudget(studio.project);
  return (
    <details className="project-style-panel">
      <summary><Palette size={16} weight="fill" /><span><strong>项目风格规则</strong><small>{identity?.name ?? studio.project.characterName} · 仅作用于当前项目</small></span></summary>
      <div className="project-style-panel__content">
        <label><span>项目名称</span><input value={studio.project.name} onChange={(event) => studio.updateProject((current) => ({ ...current, name: event.target.value }))} /></label>
        <div className="linked-identity"><PawPrint size={15} weight="fill" /><span>关联全局形象</span><strong>{identity?.name ?? "历史形象"}</strong></div>
        <div className="project-global-style-field"><span><strong>复用全局风格</strong><span><button type="button" onClick={studio.styleLibrary.saveCurrentPromptAsProfile}>保存当前</button><button type="button" onClick={() => studio.setActiveArea("style")}>管理<ArrowSquareOut size={12} /></button></span></span><select value={studio.styleLibrary.activeProfileId ?? "custom"} onChange={(event) => event.target.value === "custom" ? studio.styleLibrary.useCustomPrompt(studio.project.stylePrompt) : studio.styleLibrary.applyProfile(event.target.value)}>{studio.styleLibrary.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}<option value="custom">自由文本</option></select></div>
        <div className="project-style-prompt-pair">
          <label><span>图片风格提示词</span><small>只进入 Seedream；负责造型、色块、五官可读性与静态构图。</small><textarea rows={5} value={studio.project.imageStylePrompt ?? studio.project.stylePrompt} onChange={(event) => studio.styleLibrary.useCustomPrompts(event.target.value, studio.project.videoStylePrompt ?? studio.project.stylePrompt)} /></label>
          <label><span>视频风格提示词</span><small>只进入 Seedance；负责跨帧身份、线条、色块、机位和动作稳定性。</small><textarea rows={5} value={studio.project.videoStylePrompt ?? studio.project.stylePrompt} onChange={(event) => studio.styleLibrary.useCustomPrompts(studio.project.imageStylePrompt ?? studio.project.stylePrompt, event.target.value)} /></label>
        </div>
        <div className="runtime-presentation-field">
          <span><strong>运行时呈现</strong><small>只改变预览与桌面渲染，高清源图片和视频保持不变</small></span>
          <label><span>推荐帧率</span><select value={studio.project.runtimePresentation?.defaultFrameRate ?? 24} onChange={(event) => studio.updateProject((current) => ({ ...current, runtimePresentation: { ...current.runtimePresentation, defaultFrameRate: Number(event.target.value) as 12 | 18 | 24 | 30 | 60, defaultRenderResolution: current.runtimePresentation?.defaultRenderResolution ?? 480, pixelated: current.runtimePresentation?.pixelated ?? false } }))}>{runtimeFrameRateOptions.map((value) => <option value={value} key={value}>{value} FPS</option>)}</select></label>
          <label><span>像素网格</span><small>数值越小，像素块越大；不改变宠物实际尺寸</small><select value={studio.project.runtimePresentation?.defaultPixelGridSize ?? 64} onChange={(event) => studio.updateProject((current) => ({ ...current, runtimePresentation: { ...current.runtimePresentation, defaultFrameRate: current.runtimePresentation?.defaultFrameRate ?? 24, defaultRenderResolution: current.runtimePresentation?.defaultRenderResolution ?? 480, defaultPixelGridSize: Number(event.target.value) as RuntimePixelGridSize, pixelated: current.runtimePresentation?.pixelated ?? true } }))}>{runtimePixelGridOptions.map((value) => <option value={value} key={value}>{value} × {value} 格</option>)}</select></label>
          <label><span>宠物实际大小</span><small>只改变桌面占用空间，不改变像素网格</small><select value={studio.project.runtimePresentation?.defaultDisplaySize ?? 320} onChange={(event) => studio.updateProject((current) => ({ ...current, runtimePresentation: { ...current.runtimePresentation, defaultFrameRate: current.runtimePresentation?.defaultFrameRate ?? 24, defaultRenderResolution: current.runtimePresentation?.defaultRenderResolution ?? 480, defaultDisplaySize: Number(event.target.value) as RuntimeDisplaySize, pixelated: current.runtimePresentation?.pixelated ?? false } }))}>{runtimeDisplaySizeOptions.map((value) => <option value={value} key={value}>{value} px</option>)}</select></label>
          <label className="runtime-presentation-toggle"><input type="checkbox" checked={studio.project.runtimePresentation?.pixelated ?? false} onChange={(event) => studio.updateProject((current) => ({ ...current, runtimePresentation: { ...current.runtimePresentation, defaultFrameRate: current.runtimePresentation?.defaultFrameRate ?? 24, defaultRenderResolution: current.runtimePresentation?.defaultRenderResolution ?? 480, pixelated: event.target.checked } }))} /><span><strong>像素艺术后处理</strong><small>稳定调色板、轮廓保护、五官锐化和时间防闪烁</small></span></label>
        </div>
        <div className="project-budget-field"><span><strong>API 调试预算</strong><small>实际费用 + 在途最高预估，超过后停止提交</small></span><label>¥<input type="number" min={1} max={5000} step={1} value={studio.project.generationBudgetCny} onChange={(event) => studio.updateProject((current) => ({ ...current, generationBudgetCny: Math.max(1, Math.min(5000, Number(event.target.value) || 1)) }))} /></label><div><i style={{ transform: `scaleX(${budget.usageRatio})` }} /></div><em>已承诺 ¥{budget.committedCny.toFixed(2)} · 剩余 ¥{budget.remainingCny.toFixed(2)}</em></div>
        <VideoBackgroundSettings controller={studio.videoBackgroundSettings} />
      </div>
    </details>
  );
}
