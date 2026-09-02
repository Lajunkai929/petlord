import { Eye, Play, Smiley, SpinnerGap } from "@phosphor-icons/react";
import type { Artifact, PointerGaze } from "@petlord/schema";
import type { CostEstimate, PersistentGenerationJob } from "@petlord/generation";
import { Segmented, Switch, Tooltip } from "antd";

export const defaultPointerGaze: PointerGaze = {
  enabled: false,
  motionTarget: "eyes",
  activationRadius: 1.4,
  videoArtifactIds: [],
  segmentStartMs: 0,
};

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
          {activeVideo && <video className="pointer-gaze-editor__video checkerboard" src={activeVideo.uri} controls muted playsInline />}
          {videos.length > 0 && <label className="pointer-gaze-editor__version"><span>注视素材</span><select value={gaze.videoArtifactId ?? ""} onChange={(event) => onActivateVideo(event.target.value)}>{videos.map((video, index) => <option value={video.id} key={video.id}>版本 {index + 1} · {new Date(video.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</option>)}</select></label>}
          {activeVideo && <div className="pointer-gaze-editor__segment"><label><span>起点</span><input type="number" min={0} max={Math.max(0, durationMs / 1000 - 0.1)} step={0.1} value={gaze.segmentStartMs / 1000} onChange={(event) => onChange({ ...gaze, segmentStartMs: Math.round(Number(event.target.value) * 1000) })} /></label><label><span>终点</span><input type="number" min={0.1} max={durationMs / 1000} step={0.1} value={(gaze.segmentEndMs ?? durationMs) / 1000} onChange={(event) => onChange({ ...gaze, segmentEndMs: Math.round(Number(event.target.value) * 1000) })} /></label></div>}
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
