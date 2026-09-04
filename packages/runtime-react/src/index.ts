import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { PetPackageManifest } from "@petlord/schema";
import { PetRuntimeCore, pointIsWithinPointerGazeRange, pointerGazeProgress, type NormalizedPoint, type PetRuntimeSnapshot, type RuntimeEvent, type RuntimePointerEvent } from "@petlord/runtime-core";

const noopSubscribe = () => () => undefined;
const emptySnapshot: PetRuntimeSnapshot = {
  revision: 0,
  currentStateId: "",
  activeTransitionId: null,
  activeTransitionRunId: 0,
  activePlaybackCycles: 1,
  queuedTransitionIds: [],
  phase: "idle",
  bridgeProgress: 0,
  stateEnteredAt: 0,
  lastInteractionAt: 0,
  nextTimedTrigger: null,
  nextIdleDueAt: null,
  nextHoverTrigger: null,
  pointerInside: false,
  lastEvent: { id: 0, type: "manifest-loaded", at: 0, stateId: "" },
  events: [],
};

export function normalizedPointFromBounds(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): NormalizedPoint {
  return {
    x: Math.max(0, Math.min(1, (clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.max(0, Math.min(1, (clientY - bounds.top) / Math.max(1, bounds.height))),
  };
}

export function relativePointFromBounds(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): NormalizedPoint {
  return {
    x: (clientX - bounds.left) / Math.max(1, bounds.width),
    y: (clientY - bounds.top) / Math.max(1, bounds.height),
  };
}

export interface PointerMoveOptions {
  gazeActivationRadius?: number;
  forceGaze?: boolean;
  trackInteractions?: boolean;
}

export function usePetRuntime(manifest: PetPackageManifest | null | undefined) {
  const core = useMemo(() => manifest ? new PetRuntimeCore(manifest) : null, [manifest]);
  const snapshot = useSyncExternalStore(
    core?.subscribe ?? noopSubscribe,
    core?.getSnapshot ?? (() => emptySnapshot),
    core?.getSnapshot ?? (() => emptySnapshot),
  );
  const clickTimerRef = useRef<number | null>(null);
  const lastInteractionSyncAtRef = useRef(0);
  const [pointerGazeState, setPointerGazeState] = useState({ active: false, progress: 0.5 });
  const [pointerGazeBlend, setPointerGazeBlend] = useState(0);
  const pointerGazeBlendRef = useRef(0);
  const [dragActive, setDragActive] = useState(false);
  const [dragReturnPending, setDragReturnPending] = useState(false);
  const dragOriginStateIdRef = useRef<string | undefined>(undefined);
  const currentState = core?.currentState();
  const currentLogicalState = manifest?.logicalStates.find((state) => state.id === currentState?.logicalStateId);

  const clearPendingClick = useCallback(() => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
  }, []);

  const recordInteraction = useCallback((force = false) => {
    if (!core) return;
    const timestamp = Date.now();
    if (!force && timestamp - lastInteractionSyncAtRef.current < 500) return;
    lastInteractionSyncAtRef.current = timestamp;
    core.recordInteraction(timestamp, force);
  }, [core]);

  useEffect(() => {
    if (!core) return;
    const active = core.activeTransition();
    const stateDisplayLoop = active && active.fromStateId === snapshot.currentStateId && active.toStateId === snapshot.currentStateId;
    const dueTimes = (snapshot.phase === "idle"
      ? [snapshot.nextTimedTrigger?.dueAt, pointerGazeState.active || pointerGazeBlend > 0 ? undefined : snapshot.nextIdleDueAt, snapshot.nextHoverTrigger?.dueAt]
      : stateDisplayLoop
        ? [snapshot.nextTimedTrigger?.dueAt, snapshot.nextHoverTrigger?.dueAt]
        : [snapshot.nextHoverTrigger?.dueAt])
      .filter((value): value is number => typeof value === "number");
    if (dueTimes.length === 0) return;
    const dueAt = Math.min(...dueTimes);
    const timer = window.setTimeout(() => core.fireDueSchedules(Date.now()), Math.max(20, dueAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [core, pointerGazeBlend, pointerGazeState.active, snapshot.nextHoverTrigger?.dueAt, snapshot.nextIdleDueAt, snapshot.nextTimedTrigger?.dueAt, snapshot.phase]);

  useEffect(() => {
    if (!core || snapshot.phase !== "bridge") return;
    let frame = 0;
    const advance = () => {
      core.advanceBridge(Date.now());
      if (core.getSnapshot().phase === "bridge") frame = window.requestAnimationFrame(advance);
    };
    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [core, snapshot.activeTransitionId, snapshot.phase]);

  useEffect(() => () => {
    if (clickTimerRef.current !== null) window.clearTimeout(clickTimerRef.current);
  }, []);

  useEffect(() => {
    lastInteractionSyncAtRef.current = 0;
    clearPendingClick();
    setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    pointerGazeBlendRef.current = 0;
    setPointerGazeBlend(0);
  }, [clearPendingClick, core]);

  useEffect(() => {
    const target = pointerGazeState.active ? 1 : 0;
    const durationMs = currentLogicalState?.pointerGaze?.blendDurationMs ?? 240;
    if (durationMs <= 0) {
      pointerGazeBlendRef.current = target;
      setPointerGazeBlend(target);
      return;
    }
    const initial = pointerGazeBlendRef.current;
    if (Math.abs(initial - target) < 0.001) return;
    const startedAt = performance.now();
    let frame = 0;
    const animate = (timestamp: number) => {
      const elapsed = timestamp - startedAt;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = progress * progress * (3 - 2 * progress);
      const value = initial + (target - initial) * eased;
      pointerGazeBlendRef.current = value;
      setPointerGazeBlend(value);
      if (progress < 1) frame = window.requestAnimationFrame(animate);
    };
    frame = window.requestAnimationFrame(animate);
    return () => window.cancelAnimationFrame(frame);
  }, [currentLogicalState?.pointerGaze?.blendDurationMs, pointerGazeState.active]);

  useEffect(() => {
    if (snapshot.activeTransitionId) {
      setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    }
  }, [snapshot.activeTransitionId]);

  useEffect(() => {
    setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    pointerGazeBlendRef.current = 0;
    setPointerGazeBlend(0);
  }, [snapshot.currentStateId]);

  useEffect(() => {
    if (!core || !dragReturnPending || snapshot.phase !== "idle") return;
    const originStateId = dragOriginStateIdRef.current;
    setDragReturnPending(false);
    dragOriginStateIdRef.current = undefined;
    if (!originStateId || snapshot.currentStateId === originStateId) return;
    const reverse = core.outgoingTransitions().find((transition) => transition.toStateId === originStateId);
    if (reverse) core.beginTransition(reverse.id, "drag", Date.now());
    else core.jumpToState(originStateId, Date.now());
  }, [core, dragReturnPending, snapshot.currentStateId, snapshot.phase]);

  const onPointerMove = useCallback((point: NormalizedPoint, options: PointerMoveOptions = {}) => {
    if (!core) return;
    const gaze = currentLogicalState?.pointerGaze;
    const timestamp = Date.now();
    const gazeInRange = options.forceGaze || pointIsWithinPointerGazeRange(point, options.gazeActivationRadius ?? gaze?.activationRadius ?? 0, gaze?.anchor);
    if (gaze?.enabled && gaze.videoUri && gazeInRange) {
      const activation = pointerGazeState.active
        ? { accepted: true }
        : core.beginPath([], "pointer", timestamp, "注视鼠标");
      if (activation.accepted) {
        setPointerGazeState((current) => ({ active: true, progress: pointerGazeProgress(point, current.progress, gaze.anchor) }));
      }
    } else {
      setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    }
    if (options.trackInteractions === false) return;
    if (timestamp - lastInteractionSyncAtRef.current < 100) return;
    lastInteractionSyncAtRef.current = timestamp;
    core.movePointer(point, timestamp);
  }, [core, currentLogicalState?.pointerGaze, pointerGazeState.active]);

  const onPointerLeave = useCallback(() => {
    if (!core) return;
    setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    core.leavePointer(Date.now());
  }, [core]);

  const onClick = useCallback((point: NormalizedPoint) => {
    if (!core) return;
    setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    recordInteraction(true);
    const single = core.pointerMatch("left-click", point);
    const double = core.pointerMatch("double-click", point);
    if (!double) {
      if (single) core.beginTransition(single.transition.id, "pointer", Date.now(), single.trigger.id);
      return;
    }
    clearPendingClick();
    clickTimerRef.current = window.setTimeout(() => {
      clickTimerRef.current = null;
      if (single) core.beginTransition(single.transition.id, "pointer", Date.now(), single.trigger.id);
    }, 260);
  }, [clearPendingClick, core, recordInteraction]);

  const onDoubleClick = useCallback((point: NormalizedPoint) => {
    if (!core) return;
    setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    recordInteraction(true);
    clearPendingClick();
    const matched = core.pointerMatch("double-click", point);
    if (matched) core.beginTransition(matched.transition.id, "pointer", Date.now(), matched.trigger.id);
  }, [clearPendingClick, core, recordInteraction]);

  const onContextMenu = useCallback((point: NormalizedPoint) => {
    if (!core) return;
    setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    recordInteraction(true);
    const matched = core.pointerMatch("right-click", point);
    if (matched) core.beginTransition(matched.transition.id, "pointer", Date.now(), matched.trigger.id);
  }, [core, recordInteraction]);

  const performAction = useCallback(async (action: string) => core?.performSemanticAction(action) ?? {
    accepted: false,
    reason: "宠物包尚未载入",
  }, [core]);

  const beginDrag = useCallback(() => {
    const drag = manifest?.dragInteraction;
    if (!core || !drag?.enabled) return { accepted: false, reason: "当前宠物没有配置拖拽姿态" };
    setPointerGazeState((current) => current.active ? { ...current, active: false } : current);
    dragOriginStateIdRef.current = core.getSnapshot().currentStateId;
    setDragReturnPending(false);
    setDragActive(true);
    const direct = core.outgoingTransitions().find((transition) => transition.toStateId === drag.targetStateId);
    return direct
      ? core.beginTransition(direct.id, "drag", Date.now())
      : core.jumpToState(drag.targetStateId, Date.now());
  }, [core, manifest?.dragInteraction]);

  const endDrag = useCallback(() => {
    if (!core || !dragActive) return;
    setDragActive(false);
    setDragReturnPending(true);
  }, [core, dragActive]);

  const activeTransition = core?.activeTransition();
  const outgoingTransitions = core?.outgoingTransitions() ?? [];
  const idleTransitions = outgoingTransitions.filter((transition) =>
    transition.toStateId === snapshot.currentStateId && transition.idleRule && transition.idleRule.enabled !== false);

  return {
    core,
    snapshot,
    currentState,
    activeTransition,
    outgoingTransitions,
    currentLogicalState,
    idleScheduler: currentLogicalState?.idleScheduler,
    pointerGaze: currentLogicalState?.pointerGaze,
    pointerGazeActive: pointerGazeState.active || pointerGazeBlend > 0.001,
    pointerGazeProgress: pointerGazeState.progress,
    pointerGazeBlendProgress: pointerGazeBlend,
    interruptPointerGaze: () => setPointerGazeState((current) => current.active ? { ...current, active: false } : current),
    idleTransitions,
    dragInteraction: manifest?.dragInteraction,
    dragActive,
    hoveredTriggerId: snapshot.nextHoverTrigger?.triggerId ?? null,
    recordInteraction,
    onPointerMove,
    onPointerLeave,
    onClick,
    onDoubleClick,
    onContextMenu,
    performAction,
    beginDrag,
    endDrag,
    videoTimeReached: (elapsedMs: number) => core?.videoTimeReached(elapsedMs),
    videoEnded: () => core?.finishVideo(),
    jumpToState: (stateId: string) => core?.jumpToState(stateId),
    replayTransition: (transitionId: string) => core?.replayTransition(transitionId),
    reset: () => core?.reset(),
    beginTransition: (transitionId: string) => core?.beginTransition(transitionId),
  };
}

export type PetRuntimeReactController = ReturnType<typeof usePetRuntime>;
export type { NormalizedPoint, RuntimeEvent, RuntimePointerEvent };
export {
  RuntimeMediaCanvas,
  type RuntimeMediaCanvasProps,
} from "./RuntimeMediaCanvas";
export {
  runtimeDisplaySizeOptions,
  runtimeFrameRateOptions,
  runtimePixelGridOptions,
  runtimeResolutionOptions,
  type RuntimeFrameRate,
  type RuntimeDisplaySize,
  type RuntimePixelGridSize,
  type RuntimeRenderResolution,
} from "./runtimeOptions";
export { pixelArtGridSize, pixelArtPaletteSize } from "./pixelArtRenderer";
