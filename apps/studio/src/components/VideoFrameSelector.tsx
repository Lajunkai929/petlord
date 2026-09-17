import { Button } from "@petlord/ui";
import { Check, FilmStrip, SpinnerGap } from "@phosphor-icons/react";
import { useVideoFrameSelector } from "../hooks/useVideoFrameSelector";
import { PreviewableImage } from "./PreviewableImage";

interface VideoFrameSelectorProps {
  videoUri: string;
  initialTimeMs?: number;
  selectedFrameUri?: string;
  hasAlpha: boolean;
  onSelect: (selection: {
    uri: string;
    mimeType: string;
    timeMs: number;
    durationMs: number;
    pixelWidth: number;
    pixelHeight: number;
    hasAlpha: boolean;
  }) => void;
}

function formatTime(milliseconds: number) {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}

export function VideoFrameSelector({ videoUri, initialTimeMs, selectedFrameUri, hasAlpha, onSelect }: VideoFrameSelectorProps) {
  const frame = useVideoFrameSelector(initialTimeMs, hasAlpha, onSelect);

  return (
    <section className="frame-selector">
      <div className="frame-selector-heading">
        <div><FilmStrip size={18} weight="fill" /><strong>选择真实结束帧</strong></div>
        <span>{formatTime(frame.timeMs)} / {formatTime(frame.durationMs)}</span>
      </div>
      <video
        ref={frame.videoRef}
        src={videoUri}
        preload="metadata"
        playsInline
        muted
        controls
        onLoadedMetadata={(event) => frame.loaded(event.currentTarget)}
        onTimeUpdate={(event) => frame.setTimeMs(Math.round(event.currentTarget.currentTime * 1000))}
      />
      <input
        className="frame-slider"
        type="range"
        min={0}
        max={Math.max(0, frame.durationMs)}
        step={33}
        value={Math.min(frame.timeMs, frame.durationMs)}
        onChange={(event) => frame.seek(Number(event.target.value))}
      />
      <div className="frame-selector-review">
        {selectedFrameUri && <PreviewableImage className="checkerboard" src={selectedFrameUri} alt="当前选定的真实展示帧" />}
        <div>
          <Button type="default" className="secondary-button" htmlType="button" disabled={frame.saving || !frame.durationMs} onClick={frame.selectCurrentFrame}>
            {frame.saving ? <SpinnerGap className="spin" size={16} /> : <Check size={16} weight="bold" />}
            {frame.saving ? "正在保存" : "采用当前画面"}
          </Button>
        </div>
      </div>
      {frame.error && <p className="frame-selector-error">{frame.error}</p>}
    </section>
  );
}
