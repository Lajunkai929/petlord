import { Eye, Play, Smiley, SpinnerGap } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { defaultPointerGazeDirectionKeyframesMs, type Artifact, type PointerGaze } from "@petlord/schema";
import type { CostEstimate, PersistentGenerationJob } from "@petlord/generation";
import { Segmented, Switch, Tooltip } from "antd";

export const defaultPointerGaze: PointerGaze = {
  enabled: false,
  motionTarget: "eyes",
  activationRadius: 1.4,
  videoArtifactIds: [],
  segmentStartMs: 0,
  directionKeyframesMs: [...defaultPointerGazeDirectionKeyframesMs],
  blendDurationMs: 240,
};

const gazeDirections = [
  { index: 1, label: "左上", short: "↖", gridColumn: 1, gridRow: 1 },
  { index: 2, label: "上", short: "↑", gridColumn: 2, gridRow: 1 },
  { index: 3, label: "右上", short: "↗", gridColumn: 3, gridRow: 1 },
  { index: 0, label: "左", short: "←", gridColumn: 1, gridRow: 2 },
  { index: 4, label: "右", short: "→", gridColumn: 3, gridRow: 2 },
  { index: 7, label: "左下", short: "↙", gridColumn: 1, gridRow: 3 },
  { index: 6, label: "下", short: "↓", gridColumn: 2, gridRow: 3 },
  { index: 5, label: "右下", short: "↘", gridColumn: 3, gridRow: 3 },
] as const;

export function StatePointerGazeEditor({
  value,
  videos,
  activeJob,
  estimate,
  busy,
  onChange,
  onActivateVideo,
  onGenerate,
}: {
  value?: PointerGaze;
  videos: Artifact[];
  activeJob?: PersistentGenerationJob;
  estimate: CostEstimate | null;
  busy: boolean;
  onChange: (value: PointerGaze) => void;
  onActivateVideo: (artifactId: string) => void;
  onGenerate: () => void;
}) {
  const gaze = value ?? defaultPointerGaze;
  const activeVideo = videos.find((video) => video.id === gaze.videoArtifactId);
  const durationMs = gaze.durationMs ?? 6_000;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedDirection, setSelectedDirection] = useState(0);
  const [previewTimeMs, setPreviewTimeMs] = useState(0);
  const directionKeyframesMs = gaze.directionKeyframesMs ?? defaultPointerGazeDirectionKeyframesMs;
  const selectedDirectionLabel = gazeDirections.find((direction) => direction.index === selectedDirection)?.label ?? "左";

  useEffect(() => {
    setSelectedDirection(0);
    setPreviewTimeMs(0);
  }, [activeVideo?.id]);

  function previewDirection(index: number) {
    setSelectedDirection(index);
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(0, Math.min(durationMs, directionKeyframesMs[index])) / 1000;
  }

  function calibrateSelectedDirection() {
    const video = videoRef.current;
    if (!video) return;
    const next = [...directionKeyframesMs] as PointerGaze["directionKeyframesMs"];
    next[selectedDirection] = Math.max(0, Math.min(durationMs, Math.round(video.currentTime * 1000)));
    onChange({ ...gaze, directionKeyframesMs: next });
  }

  function resetDirectionCalibration() {
    const reset = [...defaultPointerGazeDirectionKeyframesMs] as PointerGaze["directionKeyframesMs"];
    onChange({ ...gaze, directionKeyframesMs: reset });
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.currentTime = reset[selectedDirection] / 1000;
    }
  }
  return (
    <section className={`pointer-gaze-editor ${gaze.enabled ? "is-enabled" : ""}`}>
      <header>
        <span><Eye size={18} weight="fill" /><strong>注视鼠标</strong></span>
        <Switch
          size="small"
          checked={gaze.enabled}
          aria-label="启用注视鼠标"
          onChange={(enabled) => onChange({ ...gaze, enabled })}
        />
      </header>
      {gaze.enabled && (
        <div className="pointer-gaze-editor__controls">
          <Segmented
            block
            aria-label="注视动作部位"
            value={gaze.motionTarget}
            onChange={(motionTarget) => onChange({ ...gaze, motionTarget: motionTarget as PointerGaze["motionTarget"] })}
            options={[
              { value: "eyes", label: <span><Eye size={14} />只动眼睛</span> },
              { value: "head", label: <span><Smiley size={14} />转动头部</span> },
            ]}
          />
          <label className="pointer-gaze-editor__range"><span>响应范围</span><select value={gaze.activationRadius} onChange={(event) => onChange({ ...gaze, activationRadius: Number(event.target.value) })}><option value={1}>贴近宠物</option><option value={1.4}>附近</option><option value={1.8}>较远</option><option value={2.4}>大范围</option></select></label>
          {activeVideo && <video
            ref={videoRef}
            className="pointer-gaze-editor__video checkerboard"
            src={activeVideo.uri}
            controls
            muted
            playsInline
            onTimeUpdate={(event) => setPreviewTimeMs(Math.round(event.currentTarget.currentTime * 1000))}
          />}
          {videos.length > 0 && <label className="pointer-gaze-editor__version"><span>注视素材</span><select value={gaze.videoArtifactId ?? ""} onChange={(event) => onActivateVideo(event.target.value)}>{videos.map((video, index) => <option value={video.id} key={video.id}>版本 {index + 1} · {new Date(video.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</option>)}</select></label>}
          {activeVideo && <section className="pointer-gaze-editor__calibration">
            <header><span><strong>八方向校准</strong><small>点方向预览；拖动视频后记录当前画面</small></span><button type="button" onClick={resetDirectionCalibration}>恢复均匀</button></header>
            <div className="pointer-gaze-editor__direction-pad" role="group" aria-label="注视方向校准">
              {gazeDirections.map((direction) => <button
                type="button"
                className={selectedDirection === direction.index ? "is-active" : ""}
                aria-pressed={selectedDirection === direction.index}
                aria-label={`预览${direction.label}方向`}
                title={`${direction.label} · ${(directionKeyframesMs[direction.index] / 1000).toFixed(2)} 秒`}
                style={{ gridColumn: direction.gridColumn, gridRow: direction.gridRow }}
                onClick={() => previewDirection(direction.index)}
                key={direction.label}
              ><b>{direction.short}</b><small>{(directionKeyframesMs[direction.index] / 1000).toFixed(1)}s</small></button>)}
              <div className="pointer-gaze-editor__direction-center"><Eye size={16} /><small>鼠标</small></div>
            </div>
            <div className="pointer-gaze-editor__calibration-action"><span>当前 {previewTimeMs / 1000}s · 校准“{selectedDirectionLabel}”</span><button type="button" onClick={calibrateSelectedDirection}>使用当前画面</button></div>
          </section>}
          <label className="pointer-gaze-editor__range"><span>切入 / 退出融合</span><select value={gaze.blendDurationMs ?? 240} onChange={(event) => onChange({ ...gaze, blendDurationMs: Number(event.target.value) })}><option value={0}>关闭</option><option value={120}>快速 · 0.12 秒</option><option value={240}>自然 · 0.24 秒</option><option value={360}>柔和 · 0.36 秒</option><option value={500}>最柔和 · 0.50 秒</option></select></label>
          <div className="pointer-gaze-editor__submit">
            <Tooltip title="鼠标停住后保持当前视频帧；移动方向决定正向或反向取帧。点击和其他状态事件会打断注视。">
              <span className="pointer-gaze-editor__status">{activeVideo ? "已绑定可交互素材" : "素材待制作"}</span>
            </Tooltip>
            <span><small>预计 ¥{estimate?.maximumCny.toFixed(2) ?? "--"}</small><button className="secondary-button" type="button" disabled={busy || Boolean(activeJob)} onClick={onGenerate}>{activeJob ? <SpinnerGap className="spin" size={14} /> : <Play size={14} weight="fill" />}{activeJob ? `${activeJob.progress}%` : activeVideo ? "重新生成" : "生成注视视频"}</button></span>
          </div>
        </div>
      )}
    </section>
  );
}
