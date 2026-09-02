import { ArrowsClockwise, Play, Repeat, Scissors, SpinnerGap } from "@phosphor-icons/react";
import type { TransitionPlayback } from "@petlord/schema";
import { useTransitionPlaybackEditor } from "../hooks/useTransitionPlaybackEditor";

export function TransitionPlaybackEditor(props: {
  transitionId: string;
  playback?: TransitionPlayback;
  sourceDurationMs: number;
  isSelfTransition: boolean;
  hasVideo: boolean;
  busy: boolean;
  sourceVideoUri?: string;
  onUpdate: (playback: TransitionPlayback) => void;
  onCreatePingPong: (playback: TransitionPlayback) => void;
  onUseForward: () => void;
}) {
  const editor = useTransitionPlaybackEditor({
    transitionId: props.transitionId,
    playback: props.playback,
    sourceDurationMs: props.sourceDurationMs,
    onUpdate: props.onUpdate,
    onCreatePingPong: props.onCreatePingPong,
    onUseForward: props.onUseForward,
  });
  return (
    <section className="transition-playback-editor">
      <div className="transition-playback-editor__heading">
        <div><Repeat size={17} weight="fill" /><span><strong>播放编排</strong><small>运行时决定本次动作播放几轮</small></span></div>
        <em className={editor.pingPongDraftUnsaved ? "is-pending" : editor.playback.mode === "ping-pong" ? "is-ping-pong" : ""} aria-live="polite">
          {editor.pingPongDraftUnsaved ? "倒放设置未保存" : editor.playback.mode === "ping-pong" ? "倒放设置已保存" : "普通正向素材"}
        </em>
      </div>
      {props.isSelfTransition && <div className="transition-playback-editor__mode" role="group" aria-label="自循环动画播放方式">
        <button className={editor.draftMode === "forward" ? "is-active" : ""} type="button" onClick={() => editor.chooseMode("forward")}><strong>正常正向</strong><small>切换并立即保存</small></button>
        <button className={editor.draftMode === "ping-pong" ? "is-active" : ""} type="button" onClick={() => editor.chooseMode("ping-pong")}><strong>播完倒放</strong><small>选择范围后保存应用</small></button>
      </div>}
      <div className="transition-playback-editor__repeat">
        <label>重复方式
          <select value={editor.playback.repeatMode} onChange={(event) => editor.updateRepeatMode(event.target.value as TransitionPlayback["repeatMode"])}>
            <option value="fixed">固定轮数</option>
            <option value="random">随机轮数</option>
          </select>
        </label>
        <label>{editor.playback.repeatMode === "random" ? "最少" : "播放轮数"}
          <input type="number" min={1} max={12} value={editor.playback.minCycles} onChange={(event) => editor.updateMinCycles(Number(event.target.value))} />
        </label>
        {editor.playback.repeatMode === "random" && <label>最多
          <input type="number" min={editor.playback.minCycles} max={12} value={editor.playback.maxCycles} onChange={(event) => editor.updateMaxCycles(Number(event.target.value))} />
        </label>}
      </div>
      {props.isSelfTransition && editor.draftMode === "ping-pong"
        ? <form className="transition-playback-editor__ping-pong" onSubmit={editor.submitPingPong}>
            <div><ArrowsClockwise size={16} weight="fill" /><span><strong>正放 → 倒放回到起点</strong><small>适合呼吸、动耳朵、摇头、打滚和摸肚子，不依赖模型尾帧。</small></span></div>
            <div className="transition-playback-editor__segment">
              <label>截取起点
                <span><input type="number" min={0} max={props.sourceDurationMs / 1000} step={0.1} value={editor.segmentStartSeconds} onChange={(event) => editor.updateSegmentStart(Number(event.target.value))} />秒</span>
              </label>
              <i><Scissors size={14} /></i>
              <label>截取终点
                <span><input type="number" min={0.1} max={props.sourceDurationMs / 1000} step={0.1} value={editor.segmentEndSeconds} onChange={(event) => editor.updateSegmentEnd(Number(event.target.value))} />秒</span>
              </label>
            </div>
            <div className="transition-playback-editor__range" style={{ "--range-start": `${editor.segmentStartSeconds / Math.max(0.1, props.sourceDurationMs / 1000) * 100}%`, "--range-end": `${editor.segmentEndSeconds / Math.max(0.1, props.sourceDurationMs / 1000) * 100}%` } as React.CSSProperties}>
              <span aria-hidden="true" />
              <label>起点<input aria-label="往复播放起点" type="range" min={0} max={props.sourceDurationMs / 1000} step={0.05} value={editor.segmentStartSeconds} onChange={(event) => editor.updateSegmentStart(Number(event.target.value))} /></label>
              <label>终点<input aria-label="往复播放终点" type="range" min={0.1} max={props.sourceDurationMs / 1000} step={0.05} value={editor.segmentEndSeconds} onChange={(event) => editor.updateSegmentEnd(Number(event.target.value))} /></label>
            </div>
            {props.sourceVideoUri && <div className="transition-playback-editor__preview">
              <video ref={editor.previewRef} src={props.sourceVideoUri} muted playsInline preload="metadata" />
              <button type="button" onClick={editor.previewSegment}><Play size={14} weight="fill" />{editor.previewingSegment ? "正在预览所选范围" : "预览所选范围"}</button>
            </div>}
            <p className="transition-playback-editor__save-note">倒放需要先在本机生成一个可稳定播放的新版本。点击下面的保存按钮后才会应用，原视频不会被覆盖。</p>
            <small className={editor.segmentError ? "is-error" : ""}>{editor.segmentError ?? `原正向视频 ${(props.sourceDurationMs / 1000).toFixed(1)} 秒；合成后每轮 ${Math.max(0, (editor.segmentEndSeconds - editor.segmentStartSeconds) * 2).toFixed(1)} 秒。`}</small>
            <button className="secondary-button" type="submit" disabled={!props.hasVideo || props.busy || Boolean(editor.segmentError) || !editor.pingPongDraftUnsaved}>
              {props.busy ? <SpinnerGap className="spin" size={15} /> : <ArrowsClockwise size={15} weight="bold" />}
              {props.busy
                ? "正在保存倒放版本"
                : !editor.pingPongDraftUnsaved
                  ? "当前倒放设置已保存"
                  : editor.playback.mode === "ping-pong"
                    ? "保存为新的倒放版本"
                    : "保存并应用倒放版本"}
            </button>
          </form>
        : null}
    </section>
  );
}
