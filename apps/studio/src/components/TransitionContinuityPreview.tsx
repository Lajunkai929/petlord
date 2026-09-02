import { ArrowClockwise, Check, FilmStrip, ImageSquare, SpeakerSlash, X } from "@phosphor-icons/react";
import { RuntimeMediaCanvas, runtimeResolutionOptions, type RuntimeRenderResolution } from "@petlord/runtime-react";
import {
  useTransitionContinuityPreview,
  type TransitionPreviewData,
  type TransitionPreviewPhase,
} from "../hooks/useTransitionContinuityPreview";

const phaseLabels: Record<TransitionPreviewPhase, string> = {
  source: "起始静态图",
  video: "过渡视频",
  target: "结束静态图",
};

export function TransitionContinuityPreview({ data, onClose }: { data: TransitionPreviewData; onClose: () => void }) {
  const player = useTransitionContinuityPreview(data, onClose);
  const renderResolution = runtimeResolutionOptions.includes(data.pixelSize as RuntimeRenderResolution)
    ? data.pixelSize as RuntimeRenderResolution
    : 480;
  return (
    <div className="transition-preview-backdrop" role="presentation">
      <section className="transition-preview-dialog" role="dialog" aria-modal="true" aria-label={`${data.label}过渡预览`}>
        <header>
          <div><span>连续性检查</span><strong>{data.label}</strong></div>
          <div className="transition-preview-badges">
            <em><SpeakerSlash size={13} weight="fill" />无声</em>
            <em>{data.pixelSize ? `${data.pixelSize} × ${data.pixelSize}` : "1:1"}</em>
            {data.transparentVideo && <em>Alpha 视频</em>}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭过渡预览"><X size={17} /></button>
        </header>

        <div
          className={`transition-preview-stage checkerboard ${data.transparentVideo ? "is-transparent" : ""} bridge-${data.authorityBridge.mode} ${player.bridgeProgress > 0 ? "is-bridging" : ""}`}
          style={{ "--bridge-progress": player.bridgeProgress } as React.CSSProperties}
        >
          <RuntimeMediaCanvas
            currentState={player.currentState}
            activeTransition={player.activeTransition}
            phase={player.runtimePhase}
            bridgeProgress={player.bridgeProgress}
            playbackRunId={player.playbackRunId}
            playbackCycleCount={player.cycleCount}
            frameRate={24}
            renderResolution={renderResolution}
            pixelated={data.pixelated}
            pixelGridSize={data.pixelGridSize}
            pixelArtProfileKey={data.pixelArtProfileKey}
            muted
            className="transition-preview-media"
            onVideoTimeUpdate={player.onVideoTimeUpdate}
            onVideoEnded={player.finishVideo}
            onPlaybackError={player.setPlaybackError}
          />
          <div className="transition-preview-phase"><span>{player.bridging ? "冻结末帧并收口" : phaseLabels[player.phase]}</span><b>{player.bridging ? `${(data.authorityBridge.durationMs / 1000).toFixed(2)}s` : player.phase === "target" ? data.targetMode === "authority-reference" ? "权威参考" : data.targetMode === "source-frame" ? "回到源帧" : "视频选帧" : ""}</b></div>
        </div>

        <div className="transition-preview-timeline">
          <TimelineStep active={player.phase === "source"} complete={player.phase !== "source"} icon="image" label="起始图" />
          <i className="transition-preview-line"><span style={{ transform: `scaleX(${player.videoProgress})` }} /></i>
          <TimelineStep active={player.phase === "video"} complete={player.phase === "target"} icon="video" label={`视频 · ${(data.stopAtMs / 1000).toFixed(2)}s × ${player.cycleCount} 轮`} />
          <i className="transition-preview-line"><span style={{ transform: `scaleX(${player.phase === "target" ? 1 : 0})` }} /></i>
          <TimelineStep active={player.phase === "target"} complete={false} icon="image" label={data.targetMode === "video-frame" ? "视频选帧" : data.targetMode === "source-frame" ? "回到源帧" : "权威参考"} />
        </div>

        <footer>
          <button className="secondary-button" type="button" onClick={player.replay}><ArrowClockwise size={15} />重新播放</button>
        </footer>
        {player.playbackError && <p className="transition-preview-error">{player.playbackError}</p>}
      </section>
    </div>
  );
}

function TimelineStep({ active, complete, icon, label }: { active: boolean; complete: boolean; icon: "image" | "video"; label: string }) {
  return (
    <div className={`transition-preview-step ${active ? "is-active" : ""} ${complete ? "is-complete" : ""}`}>
      <span>{complete ? <Check size={13} weight="bold" /> : icon === "video" ? <FilmStrip size={13} /> : <ImageSquare size={13} />}</span>
      <small>{label}</small>
    </div>
  );
}
