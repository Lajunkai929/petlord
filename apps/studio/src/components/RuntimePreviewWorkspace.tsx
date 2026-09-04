import {
  ArrowCounterClockwise,
  CheckCircle,
  Crosshair,
  CursorClick,
  Desktop,
  Eye,
  EyeSlash,
  Graph,
  HandGrabbing,
  Lightning,
  ListBullets,
  Play,
  Pulse,
  SquaresFour,
  Timer,
} from "@phosphor-icons/react";
import type { CharacterProject, RuntimeTransition, TransitionTrigger } from "@petlord/schema";
import { RuntimeMediaCanvas, runtimeDisplaySizeOptions, runtimeFrameRateOptions, runtimePixelGridOptions, type RuntimeDisplaySize, type RuntimePixelGridSize } from "@petlord/runtime-react";
import { useRuntimePreview, type RuntimePreviewController } from "../hooks/useRuntimePreview";

const eventLabels: Record<TransitionTrigger["event"], string> = {
  hover: "悬停",
  "pointer-leave": "移出宠物",
  "left-click": "左键",
  "right-click": "右键",
  "double-click": "双击",
  inactivity: "无交互",
  "state-timeout": "进入状态后",
};

function formatDuration(durationMs: number) {
  if (durationMs >= 60_000 && durationMs % 60_000 === 0) return `${durationMs / 60_000} 分钟`;
  return `${durationMs / 1000} 秒`;
}

function triggerLabel(trigger: TransitionTrigger) {
  const duration = trigger.event === "hover"
    ? ` ${formatDuration(trigger.hoverDurationMs ?? 0)}`
    : trigger.event === "inactivity" || trigger.event === "state-timeout"
      ? ` ${formatDuration(trigger.timerDurationMs ?? 60_000)}`
      : "";
  return `${eventLabels[trigger.event]}${duration}`;
}

function isPointerTrigger(trigger: TransitionTrigger) {
  return trigger.event !== "inactivity" && trigger.event !== "state-timeout" && trigger.event !== "pointer-leave";
}

export function RuntimePreviewWorkspace({ project, onEdit }: { project: CharacterProject; onEdit: () => void }) {
  const preview = useRuntimePreview(project);
  return (
    <main className="runtime-preview-workspace">
      <PreviewToolbar preview={preview} syncedAt={project.updatedAt} />
      {preview.manifest && preview.currentState
        ? <PreviewBody preview={preview} onEdit={onEdit} />
        : <PreviewBuildError error={preview.error} onEdit={onEdit} />}
    </main>
  );
}

function PreviewToolbar({ preview, syncedAt }: { preview: RuntimePreviewController; syncedAt: string }) {
  const syncedTime = new Date(syncedAt).toLocaleTimeString("zh-CN", { hour12: false });
  return (
    <header className="runtime-preview-toolbar">
      <div className="runtime-preview-title">
        <span className="runtime-live-dot" />
        <div><strong>运行预览</strong><small>实时配置 · 已同步 {syncedTime}</small></div>
      </div>
      <div className="preview-toolbar-controls">
        <span className={`runtime-core-phase is-${preview.runtimePhase}`}><Pulse size={14} weight="fill" />{preview.runtimePhase === "idle" ? "静态" : preview.runtimePhase === "video" ? "播放视频" : "权威帧收口"}{preview.queuedTransitionIds.length > 0 && ` · 队列 ${preview.queuedTransitionIds.length}`}</span>
        <div className="preview-segmented" aria-label="预览背景">
          <button className={preview.backdrop === "desktop" ? "is-active" : ""} type="button" onClick={() => preview.setBackdrop("desktop")}><Desktop size={15} />桌面</button>
          <button className={preview.backdrop === "transparent" ? "is-active" : ""} type="button" onClick={() => preview.setBackdrop("transparent")}><SquaresFour size={15} />透明</button>
        </div>
        <label className="preview-scale-control">像素
          <select value={preview.pixelGridSize} onChange={(event) => preview.setPixelGridSize(Number(event.target.value) as RuntimePixelGridSize)}>
            {runtimePixelGridOptions.map((size) => <option value={size} key={size}>{size} 格</option>)}
          </select>
        </label>
        <label className="preview-scale-control">大小
          <select value={preview.displaySize} onChange={(event) => preview.setDisplaySize(Number(event.target.value) as RuntimeDisplaySize)}>
            {runtimeDisplaySizeOptions.map((size) => <option value={size} key={size}>{size} px</option>)}
          </select>
        </label>
        <label className="preview-scale-control">帧率
          <select value={preview.frameRate} onChange={(event) => preview.setFrameRate(Number(event.target.value) as typeof preview.frameRate)}>{runtimeFrameRateOptions.map((frameRate) => <option value={frameRate} key={frameRate}>{frameRate} FPS</option>)}</select>
        </label>
        <button className={`preview-tool-button ${preview.pixelated ? "is-active" : ""}`} type="button" onClick={() => preview.setPixelated(!preview.pixelated)} title="固定像素网格、有限色阶、Alpha 硬边与一像素轮廓">像素艺术</button>
        <button className={`preview-tool-button ${preview.showHotspots ? "is-active" : ""}`} type="button" onClick={() => preview.setShowHotspots(!preview.showHotspots)}>
          {preview.showHotspots ? <Eye size={16} /> : <EyeSlash size={16} />}触发热区
        </button>
        <button className="preview-tool-button" type="button" onClick={preview.reset}><ArrowCounterClockwise size={16} />重置</button>
      </div>
    </header>
  );
}

function PreviewBody({ preview, onEdit }: { preview: RuntimePreviewController; onEdit: () => void }) {
  return (
    <div className="runtime-preview-body">
      <section className={`runtime-stage runtime-stage--${preview.backdrop}`} onPointerMove={preview.onStagePointerMove} onPointerLeave={preview.onStagePointerLeave} onPointerUp={preview.onPetPointerUp} onPointerCancel={preview.onPetPointerUp}>
        {preview.backdrop === "desktop" && <DesktopBackdrop />}
        <div className="runtime-status-strip"><CheckCircle size={15} weight="fill" /><span>{preview.status}</span></div>
        <div ref={preview.petDockRef} className={`pet-dock ${preview.dragActive ? "is-dragging" : ""}`} style={{ width: `min(${preview.displaySize}px, calc(100% - 24px))`, height: `min(${preview.displaySize}px, calc(100% - 24px))`, transform: `translate3d(${preview.dragOffset.x}px, ${preview.dragOffset.y}px, 0)`, transitionDuration: `${preview.dragTransitionMs}ms` }}>
          <div
            className={`runtime-pet ${preview.activeTransition ? "is-playing" : ""}`}
            onPointerDown={preview.onPetPointerDown}
            onPointerUp={preview.onPetPointerUp}
            onPointerCancel={preview.onPetPointerUp}
            onClick={preview.onPetClick}
            onDoubleClick={preview.onPetDoubleClick}
            onContextMenu={preview.onPetContextMenu}
            role="application"
            aria-label={`${preview.currentState?.label ?? "宠物"}交互预览`}
          >
            <RuntimeMediaCanvas
              currentState={preview.currentState}
              activeTransition={preview.activeTransition}
              phase={preview.runtimePhase}
              bridgeProgress={preview.transitionBlendProgress}
              playbackRunId={preview.activeTransitionRunId}
              playbackCycleCount={preview.activePlaybackCycles}
              frameRate={preview.frameRate}
              renderResolution={preview.renderResolution}
              pixelGridSize={preview.pixelGridSize}
              pixelArtProfileKey={preview.manifest?.id}
              pixelated={preview.pixelated}
              pointerGaze={preview.pointerGaze}
              pointerGazeActive={preview.pointerGazeActive}
              pointerGazeProgress={preview.pointerGazeProgress}
              pointerGazeBlendProgress={preview.pointerGazeBlendProgress}
              muted
              className="runtime-pet-canvas"
              onVideoTimeUpdate={preview.onVideoTimeUpdate}
              onVideoEnded={preview.onVideoEnded}
              onPlaybackError={preview.onPlaybackError}
            />
            {preview.showHotspots && !preview.activeTransition && preview.outgoingTransitions.flatMap((transition) =>
              transition.triggers.filter((trigger) => trigger.enabled && isPointerTrigger(trigger)).map((trigger) => (
                <span
                  className={`runtime-hotspot runtime-hotspot--${trigger.region?.shape ?? "rectangle"} ${preview.hoveredTriggerId === trigger.id ? "is-hovering" : ""}`}
                  key={`${transition.id}-${trigger.id}`}
                  style={{
                    left: `${(trigger.region?.x ?? 0) * 100}%`,
                    top: `${(trigger.region?.y ?? 0) * 100}%`,
                    width: `${(trigger.region?.width ?? 1) * 100}%`,
                    height: `${(trigger.region?.height ?? 1) * 100}%`,
                  }}
                ><small>{triggerLabel(trigger)}</small></span>
              ))) }
            {preview.showHotspots && !preview.activeTransition && preview.pointerGaze?.enabled && <span
              className="runtime-gaze-anchor"
              style={{ left: `${preview.pointerGaze.anchor.x * 100}%`, top: `${preview.pointerGaze.anchor.y * 100}%` }}
            ><Crosshair size={18} weight="bold" /><small>注视中心</small></span>}
            <span className="runtime-state-chip">{preview.activeTransition ? `播放过渡 · ${preview.activePlaybackCycles} 轮 · ${preview.frameRate} FPS` : `${preview.currentState?.label} · ${preview.pixelated ? `${preview.pixelGridSize} 格像素` : "高清"} · ${preview.displaySize}px`}</span>
          </div>
        </div>
      </section>
      <RuntimeInspector preview={preview} onEdit={onEdit} />
    </div>
  );
}

function DesktopBackdrop() {
  return <div className="desktop-simulation" aria-hidden="true" />;
}

function RuntimeInspector({ preview, onEdit }: { preview: RuntimePreviewController; onEdit: () => void }) {
  const currentState = preview.currentState;
  const interactiveTransitions = preview.outgoingTransitions.filter((transition) =>
    !transition.idleRule || transition.triggers.some((trigger) => trigger.enabled));
  return (
    <aside className="runtime-inspector">
      <div className="runtime-inspector-heading"><span>运行时检查器</span><small>core 0.1 · {preview.runtimePhase}</small></div>
      <section className="runtime-current-state">
        <div className="runtime-state-thumb checkerboard"><img src={currentState?.imageUri} alt="当前实际展示帧" /></div>
        <div><small>当前实际状态 · {currentState?.logicalStateId}</small><strong>{currentState?.label}</strong><code>{currentState?.id}</code></div>
      </section>
      <section className="runtime-inspector-section">
        <div className="runtime-section-label"><span>可用转换规则</span><b>{interactiveTransitions.length}</b></div>
        {preview.nextTimedTrigger && (
          <div className="runtime-timed-summary">
            <Timer size={16} weight="fill" />
            <div><small>当前正在计时 · 还剩 {formatDuration(preview.nextTimedRemainingMs ?? 0)}</small><strong>{preview.nextTimedTrigger.event === "inactivity" ? `${formatDuration(preview.nextTimedTrigger.durationMs)}无交互` : `进入状态 ${formatDuration(preview.nextTimedTrigger.durationMs)}后`}</strong><span>将触发 {preview.nextTimedTrigger.transitionId}</span></div>
          </div>
        )}
        {interactiveTransitions.length > 0
          ? <div className="runtime-transition-list">{interactiveTransitions.map((transition) => <TransitionTester key={transition.id} transition={transition} onPlay={preview.replayTransition} />)}</div>
          : <div className="runtime-empty"><CursorClick size={23} weight="thin" /><strong>没有可用过渡</strong><button type="button" onClick={onEdit}><Graph size={13} />回到创作</button></div>}
      </section>
      {preview.pointerGaze?.enabled && (
        <section className="runtime-inspector-section runtime-gaze-preview">
          <div className="runtime-section-label"><span>注视鼠标</span><b>{preview.pointerGaze.videoUri ? "已绑定可交互素材" : "素材待制作"}</b></div>
          <div className="runtime-gaze-summary"><Eye size={16} weight="fill" /><strong>{preview.pointerGaze.motionTarget === "eyes" ? "只动眼睛" : "转动头部"}</strong></div>
        </section>
      )}
      {preview.dragInteraction?.enabled && (
        <section className="runtime-inspector-section runtime-gaze-preview">
          <div className="runtime-section-label"><span>拖拽锚点</span><b>{preview.dragActive ? "拖动中" : "可测试"}</b></div>
          <div className="runtime-gaze-summary"><HandGrabbing size={16} weight="fill" /><strong>{preview.manifest?.states.find((state) => state.id === preview.dragInteraction?.targetStateId)?.label ?? "拖拽姿态"}</strong></div>
        </section>
      )}
      {preview.idleScheduler && (
        <section className="runtime-inspector-section runtime-idle-preview">
          <div className="runtime-section-label"><span>待机调度</span><b>{preview.idleTransitions.length}</b></div>
          <div className="runtime-idle-summary"><strong>{preview.idleScheduler.enabled ? preview.idleScheduler.playbackMode === "continuous" ? "连续播放" : preview.idleScheduler.strategy === "weighted-random" ? "加权随机" : "加权轮询" : "已暂停"}</strong><span>{preview.idleScheduler.playbackMode === "continuous" ? `每段结束立即${preview.idleScheduler.strategy === "weighted-random" ? "随机抽取" : "轮询选择"}下一版本` : `${preview.idleScheduler.minIntervalMs / 1000}–${preview.idleScheduler.maxIntervalMs / 1000} 秒触发一次`}</span></div>
          {preview.nextIdleDueAt !== null && <p>{preview.idleScheduler.playbackMode === "continuous" ? "下一段待机动画已进入即时调度" : `预计约 ${Math.max(1, Math.ceil((preview.nextIdleRemainingMs ?? 0) / 1000))} 秒后尝试播放`}</p>}
          <div className="runtime-transition-list">{preview.idleTransitions.map((transition) => <TransitionTester key={transition.id} transition={transition} onPlay={preview.replayTransition} />)}</div>
        </section>
      )}
      {preview.semanticActions.length > 0 && (
        <section className="runtime-inspector-section runtime-semantic-actions">
          <div className="runtime-section-label"><span>插件语义动作</span><b>{preview.semanticActions.length}</b></div>
          <div>{preview.semanticActions.map(({ action, logicalStateId, reachable, stepCount }) => <button className={reachable ? "" : "is-unreachable"} type="button" key={action} onClick={() => preview.performSemanticAction(action)}><Lightning size={13} weight="fill" /><span><strong>{action}</strong><small>{reachable ? stepCount === 0 ? "当前已处于目标状态" : `${stepCount} 段路径 → ${logicalStateId}` : `当前变体不可达 → ${logicalStateId}`}</small></span></button>)}</div>
        </section>
      )}
      <section className="runtime-inspector-section runtime-state-jump">
        <div className="runtime-section-label"><span>测试起点</span><small>调试工具</small></div>
        <div>{preview.manifest?.states.map((state) => (
          <button className={preview.currentStateId === state.id ? "is-active" : ""} key={state.id} type="button" onClick={() => preview.jumpToState(state.id)}>{state.label}</button>
        ))}</div>
      </section>
      <section className="runtime-inspector-section runtime-event-log">
        <div className="runtime-section-label"><span>核心事件</span><ListBullets size={15} /></div>
        <div>{preview.runtimeEvents.slice(0, 8).map((event) => <article key={event.id}><i className={`is-${event.type}`} /><span><strong>{event.label}</strong><small>{new Date(event.at).toLocaleTimeString("zh-CN", { hour12: false })}{event.transitionId ? ` · ${event.transitionId}` : ""}</small></span></article>)}</div>
      </section>
    </aside>
  );
}

function TransitionTester({ transition, onPlay }: { transition: RuntimeTransition; onPlay: (id: string) => void }) {
  const playback = transition.playback;
  const cycleLabel = playback?.repeatMode === "random"
    ? `${playback.minCycles}–${playback.maxCycles} 轮随机`
    : `${playback?.minCycles ?? 1} 轮`;
  const interactionLabels = [...new Set(transition.triggers
    .filter((trigger) => trigger.enabled && !["inactivity", "state-timeout"].includes(trigger.event))
    .map(triggerLabel))];
  const ruleLabel = [
    transition.idleRule ? `权重 ${transition.idleRule.weight ?? 1} · 冷却 ${(transition.idleRule.cooldownMs ?? 0) / 1000}s` : undefined,
    ...interactionLabels,
  ].filter(Boolean).join(" · ") || transition.triggers.filter((trigger) => trigger.enabled).map(triggerLabel).join(" · ") || "无自动触发";
  const playbackRange = playback?.mode === "ping-pong" && playback.segmentEndMs !== undefined
    ? ` · 原片 ${(playback.segmentStartMs / 1000).toFixed(1)}–${(playback.segmentEndMs / 1000).toFixed(1)}s`
    : "";
  return (
    <div className="runtime-transition-row">
      <div><strong>{transition.id}</strong><span>{ruleLabel}</span><small>{playback?.mode === "ping-pong" ? "正反往复" : "正向播放"}{playbackRange} · {cycleLabel} · 起始融合 {transition.entryBlendMs ?? 0}ms · {transition.endFrameSource === "video-frame" ? "结束于视频选帧" : transition.endFrameSource === "authority-reference" ? `${transition.authorityBridge.mode} 收口到权威图` : "回到同一源帧"} · {transition.transparentVideo ? "透明" : "普通"}</small></div>
      <button type="button" title="直接测试这段过渡" onClick={() => onPlay(transition.id)}><Play size={14} weight="fill" /></button>
    </div>
  );
}

function PreviewBuildError({ error, onEdit }: { error: string | null; onEdit: () => void }) {
  return (
    <div className="preview-build-error"><EyeSlash size={34} weight="thin" /><h1>还不能运行预览</h1><p>{error ?? "宠物包没有可用的实际展示状态。"}</p><span>请先在创作模式中批准必要内容，再回来验证最终效果。</span><button className="secondary-button" type="button" onClick={onEdit}><Graph size={15} />回到创作</button></div>
  );
}
