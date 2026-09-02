import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import type { CharacterProject, PetPackageManifest } from "@petlord/schema";
import { buildPetPackage, findPathToLogicalState } from "@petlord/state-engine";
import { normalizedPointFromBounds, relativePointFromBounds, usePetRuntime, type RuntimeDisplaySize, type RuntimeEvent, type RuntimeFrameRate, type RuntimePixelGridSize, type RuntimeRenderResolution } from "@petlord/runtime-react";

export type PreviewBackdrop = "desktop" | "transparent";

function buildPreviewManifest(project: CharacterProject): { manifest: PetPackageManifest | null; error: string | null } {
  try {
    return { manifest: buildPetPackage(project), error: null };
  } catch (caught) {
    return {
      manifest: null,
      error: caught instanceof Error ? caught.message : "无法构建宠物发布包",
    };
  }
}

export function runtimeProjectRevision(project: CharacterProject) {
  return JSON.stringify({
    initialVariantId: project.initialVariantId,
    runtimePresentation: project.runtimePresentation,
    logicalStates: project.logicalStates,
    variants: project.variants,
    transitions: project.transitions,
    artifacts: project.artifacts,
    plugins: project.plugins,
  });
}

function runtimeStatus(event: RuntimeEvent, manifest: PetPackageManifest | null) {
  const transition = manifest?.transitions.find((candidate) => candidate.id === event.transitionId);
  const state = manifest?.states.find((candidate) => candidate.id === event.stateId);
  switch (event.type) {
    case "manifest-loaded": return "运行核心已载入发布包，等待真实触发";
    case "interaction": return "已记录用户交互，空闲计时从现在重新开始";
    case "transition-interrupted": return `用户操作已中断自动动作「${transition?.id ?? event.transitionId}」`;
    case "transition-started": {
      const source = event.source === "idle" ? "待机调度" : event.source === "timer" ? "时间规则" : event.source === "semantic" ? "插件动作" : event.source === "queue" ? "连续路径" : event.source === "pointer" ? "鼠标交互" : event.source === "drag" ? "拖拽" : "手动测试";
      return `${source}触发「${transition?.id ?? event.transitionId}」`;
    }
    case "bridge-started": return transition?.endFrameSource === "source-frame" ? "视频结束，正在回到源静态帧" : "视频结束，正在收口到权威参考图";
    case "state-entered": return transition?.idleRule ? "待机动画结束，回到完全相同的静态图" : `已进入「${state?.label ?? event.stateId}」实际状态`;
    case "state-jumped": return `调试起点已切换到「${state?.label ?? event.stateId}」`;
    case "runtime-reset": return "已重置为宠物包初始状态";
    case "action-rejected": return event.detail ?? "这次运行请求没有被接受";
    case "idle-deferred": return "刚刚发生过交互，待机动画已自动顺延";
  }
}

function pointFromEvent(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
  return normalizedPointFromBounds(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
}

export function useRuntimePreview(project: CharacterProject) {
  const runtimeRevision = useMemo(() => runtimeProjectRevision(project), [project]);
  const result = useMemo(() => buildPreviewManifest(project), [runtimeRevision]);
  const runtime = usePetRuntime(result.manifest);
  const [backdrop, setBackdrop] = useState<PreviewBackdrop>("desktop");
  const [displaySize, setDisplaySize] = useState<RuntimeDisplaySize>(project.runtimePresentation?.defaultDisplaySize ?? 320);
  const [pixelGridSize, setPixelGridSize] = useState<RuntimePixelGridSize>(project.runtimePresentation?.defaultPixelGridSize ?? 64);
  const [showHotspots, setShowHotspots] = useState(false);
  const [frameRate, setFrameRate] = useState<RuntimeFrameRate>(project.runtimePresentation?.defaultFrameRate ?? 24);
  const [renderResolution, setRenderResolution] = useState<RuntimeRenderResolution>(project.runtimePresentation?.defaultRenderResolution ?? 480);
  const [pixelated, setPixelated] = useState(project.runtimePresentation?.pixelated ?? false);
  const [mediaNotice, setMediaNotice] = useState<string>();
  const [clockNow, setClockNow] = useState(Date.now());
  const petDockRef = useRef<HTMLDivElement>(null);
  const dragGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
    bounds: DOMRect;
    capturer: HTMLDivElement;
  } | undefined>(undefined);
  const suppressClickUntilRef = useRef(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragTransitionMs, setDragTransitionMs] = useState(0);

  useEffect(() => {
    setMediaNotice(undefined);
  }, [runtime.snapshot.lastEvent.id]);

  useEffect(() => {
    setFrameRate(project.runtimePresentation?.defaultFrameRate ?? 24);
    setRenderResolution(project.runtimePresentation?.defaultRenderResolution ?? 480);
    setPixelGridSize(project.runtimePresentation?.defaultPixelGridSize ?? 64);
    setDisplaySize(project.runtimePresentation?.defaultDisplaySize ?? 320);
    setPixelated(project.runtimePresentation?.pixelated ?? false);
  }, [project.id, project.runtimePresentation?.defaultDisplaySize, project.runtimePresentation?.defaultFrameRate, project.runtimePresentation?.defaultPixelGridSize, project.runtimePresentation?.defaultRenderResolution, project.runtimePresentation?.pixelated]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  function onStagePointerMove(event: PointerEvent<HTMLElement>) {
    const dock = petDockRef.current;
    if (dock) runtime.onPointerMove(relativePointFromBounds(event.clientX, event.clientY, dock.getBoundingClientRect()));
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !runtime.dragInteraction) return;
    const moved = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (!gesture.dragging && moved < 6) return;
    if (!gesture.dragging) {
      gesture.dragging = runtime.beginDrag().accepted;
      if (!gesture.dragging) return;
      setDragTransitionMs(runtime.dragInteraction.alignmentDurationMs);
    } else {
      setDragTransitionMs(48);
    }
    setDragOffset({
      x: event.clientX - (gesture.bounds.left + runtime.dragInteraction.anchor.x * gesture.bounds.width),
      y: event.clientY - (gesture.bounds.top + runtime.dragInteraction.anchor.y * gesture.bounds.height),
    });
  }

  function onStagePointerLeave() {
    if (dragGestureRef.current?.dragging) return;
    runtime.onPointerLeave();
    if (!runtime.activeTransition) setMediaNotice("已取消悬停触发");
  }

  function onPetPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !runtime.dragInteraction || !petDockRef.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      bounds: petDockRef.current.getBoundingClientRect(),
      capturer: event.currentTarget,
    };
  }

  function onPetPointerUp(event: PointerEvent<HTMLElement>) {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.capturer.hasPointerCapture(event.pointerId)) gesture.capturer.releasePointerCapture(event.pointerId);
    if (gesture.dragging && runtime.dragInteraction) {
      suppressClickUntilRef.current = Date.now() + 350;
      setDragTransitionMs(runtime.dragInteraction.returnDurationMs);
      setDragOffset({ x: 0, y: 0 });
      runtime.endDrag();
    }
    dragGestureRef.current = undefined;
  }

  function onPetClick(event: MouseEvent<HTMLDivElement>) {
    if (Date.now() < suppressClickUntilRef.current) return;
    runtime.onClick(pointFromEvent(event));
  }

  function onPetDoubleClick(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    runtime.onDoubleClick(pointFromEvent(event));
  }

  function onPetContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    runtime.onContextMenu(pointFromEvent(event));
  }

  const hoveredTrigger = runtime.outgoingTransitions
    .flatMap((transition) => transition.triggers)
    .find((trigger) => trigger.id === runtime.hoveredTriggerId);
  const status = runtime.pointerGazeActive
    ? `持续注视鼠标 · ${runtime.pointerGaze?.motionTarget === "eyes" ? "只动眼睛" : "转动头部"}`
    : mediaNotice ?? (hoveredTrigger?.event === "hover"
    ? `保持悬停 ${((hoveredTrigger.hoverDurationMs ?? 100) / 1000).toFixed(1)} 秒以触发动作`
    : runtimeStatus(runtime.snapshot.lastEvent, result.manifest));

  return {
    manifest: result.manifest,
    error: result.error,
    currentState: runtime.currentState ?? null,
    currentStateId: runtime.snapshot.currentStateId,
    outgoingTransitions: runtime.outgoingTransitions,
    idleTransitions: runtime.idleTransitions,
    idleScheduler: runtime.idleScheduler ?? null,
    pointerGaze: runtime.pointerGaze ?? null,
    pointerGazeActive: runtime.pointerGazeActive,
    pointerGazeProgress: runtime.pointerGazeProgress,
    dragInteraction: runtime.dragInteraction,
    dragActive: runtime.dragActive,
    nextIdleDueAt: runtime.snapshot.nextIdleDueAt,
    nextTimedTrigger: runtime.snapshot.nextTimedTrigger,
    activeTransition: runtime.activeTransition ?? null,
    activeTransitionId: runtime.snapshot.activeTransitionId,
    activeTransitionRunId: runtime.snapshot.activeTransitionRunId,
    activePlaybackCycles: runtime.snapshot.activePlaybackCycles,
    runtimePhase: runtime.snapshot.phase,
    queuedTransitionIds: runtime.snapshot.queuedTransitionIds,
    runtimeEvents: runtime.snapshot.events.map((event) => ({
      ...event,
      label: runtimeStatus(event, result.manifest),
    })),
    semanticActions: Object.entries(result.manifest?.semanticActions ?? {}).map(([action, logicalStateId]) => {
      const path = result.manifest ? findPathToLogicalState(result.manifest, runtime.snapshot.currentStateId, logicalStateId) : null;
      return { action, logicalStateId, reachable: path !== null, stepCount: path?.length ?? 0 };
    }),
    nextTimedRemainingMs: runtime.snapshot.nextTimedTrigger ? Math.max(0, runtime.snapshot.nextTimedTrigger.dueAt - clockNow) : null,
    nextIdleRemainingMs: runtime.snapshot.nextIdleDueAt ? Math.max(0, runtime.snapshot.nextIdleDueAt - clockNow) : null,
    backdrop,
    displaySize,
    pixelGridSize,
    showHotspots,
    frameRate,
    renderResolution,
    pixelated,
    petDockRef,
    dragOffset,
    dragTransitionMs,
    hoveredTriggerId: runtime.hoveredTriggerId,
    transitionBlendProgress: runtime.snapshot.bridgeProgress,
    status,
    setBackdrop,
    setDisplaySize,
    setPixelGridSize,
    setShowHotspots,
    setFrameRate,
    setRenderResolution,
    setPixelated,
    onStagePointerMove,
    onStagePointerLeave,
    onPetPointerDown,
    onPetPointerUp,
    onPetClick,
    onPetDoubleClick,
    onPetContextMenu,
    onVideoTimeUpdate: runtime.videoTimeReached,
    onVideoEnded: runtime.videoEnded,
    onPlaybackError: setMediaNotice,
    jumpToState: runtime.jumpToState,
    replayTransition: runtime.replayTransition,
    performSemanticAction: runtime.performAction,
    reset: runtime.reset,
  };
}

export type RuntimePreviewController = ReturnType<typeof useRuntimePreview>;
