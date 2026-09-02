import { useEffect, useRef, useState } from "react";
import type { AuthorityBridge, RuntimeState, RuntimeTransition, TransitionPlayback } from "@petlord/schema";
import type { RuntimePixelGridSize } from "@petlord/runtime-react";
import { selectTransitionPlaybackCycles } from "@petlord/runtime-core";
import { computeAuthorityBridgeProgress } from "@petlord/state-engine";

export type TransitionPreviewPhase = "source" | "video" | "target";

export interface TransitionPreviewData {
  id: string;
  label: string;
  sourceUri: string;
  videoUri: string;
  targetUri: string;
  targetMode: "authority-reference" | "video-frame" | "source-frame";
  stopAtMs: number;
  transparentVideo: boolean;
  authorityBridge: AuthorityBridge;
  entryBlendMs?: number;
  playback?: TransitionPlayback;
  pixelSize?: number;
  pixelated?: boolean;
  pixelGridSize?: RuntimePixelGridSize;
  pixelArtProfileKey?: string;
}

export function useTransitionContinuityPreview(data: TransitionPreviewData, onClose: () => void) {
  const [phase, setPhase] = useState<TransitionPreviewPhase>("source");
  const [videoProgress, setVideoProgress] = useState(0);
  const [bridgeProgress, setBridgeProgress] = useState(0);
  const [bridging, setBridging] = useState(false);
  const [playbackError, setPlaybackError] = useState<string>();
  const [cycleCount, setCycleCount] = useState(() => selectTransitionPlaybackCycles({ playback: data.playback }, Math.random()));
  const [playbackRunId, setPlaybackRunId] = useState(1);
  const bridgeAnimationFrameRef = useRef<number | null>(null);
  const bridgeStartedRef = useRef(false);

  useEffect(() => {
    if (phase !== "source") return;
    const timer = window.setTimeout(() => setPhase("video"), 900);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => () => {
    if (bridgeAnimationFrameRef.current !== null) window.cancelAnimationFrame(bridgeAnimationFrameRef.current);
  }, []);

  function finishVideo() {
    if (bridgeStartedRef.current) return;
    setVideoProgress(1);
    if (data.authorityBridge.mode === "hard-cut") {
      setPhase("target");
      return;
    }
    bridgeStartedRef.current = true;
    setBridging(true);
    const startedAt = performance.now();
    const updateBridge = (timestamp: number) => {
      const progress = computeAuthorityBridgeProgress({
        elapsedMs: timestamp - startedAt,
        bridge: data.authorityBridge,
      });
      setBridgeProgress(progress);
      if (progress >= 1) {
        bridgeAnimationFrameRef.current = null;
        bridgeStartedRef.current = false;
        setBridging(false);
        setPhase("target");
        return;
      }
      bridgeAnimationFrameRef.current = window.requestAnimationFrame(updateBridge);
    };
    bridgeAnimationFrameRef.current = window.requestAnimationFrame(updateBridge);
  }

  function onVideoTimeUpdate(elapsedMs: number) {
    setVideoProgress(Math.min(1, elapsedMs / Math.max(1, data.stopAtMs * cycleCount)));
  }

  function replay() {
    if (bridgeAnimationFrameRef.current !== null) window.cancelAnimationFrame(bridgeAnimationFrameRef.current);
    bridgeAnimationFrameRef.current = null;
    bridgeStartedRef.current = false;
    setCycleCount(selectTransitionPlaybackCycles({ playback: data.playback }, Math.random()));
    setPlaybackRunId((runId) => runId + 1);
    setPlaybackError(undefined);
    setVideoProgress(0);
    setBridgeProgress(0);
    setBridging(false);
    setPhase("source");
  }

  const sourceState: RuntimeState = {
    id: `${data.id}-preview-source`,
    logicalStateId: `${data.id}-preview-source`,
    label: "起始实际展示图",
    imageUri: data.sourceUri,
    origin: "reference",
  };
  const targetState: RuntimeState = {
    id: `${data.id}-preview-target`,
    logicalStateId: `${data.id}-preview-target`,
    label: "结束实际展示图",
    imageUri: data.targetUri,
    origin: data.targetMode === "video-frame" ? "transition-tail" : "reference",
  };
  const runtimeTransition: RuntimeTransition = {
    id: data.id,
    fromStateId: sourceState.id,
    toStateId: targetState.id,
    videoUri: data.videoUri,
    tailFrameUri: data.targetUri,
    durationMs: data.stopAtMs,
    entryBlendMs: data.entryBlendMs ?? 420,
    endFrameSource: data.targetMode,
    transparentVideo: data.transparentVideo,
    authorityBridge: data.authorityBridge,
    playback: data.playback,
    triggers: [],
  };
  const runtimePhase = bridging ? "bridge" as const : phase === "video" ? "video" as const : "idle" as const;

  return {
    phase,
    videoProgress,
    bridgeProgress,
    bridging,
    playbackError,
    playbackRunId,
    onVideoTimeUpdate,
    finishVideo,
    cycleCount,
    setPlaybackError,
    currentState: phase === "target" ? targetState : sourceState,
    activeTransition: phase === "video" ? runtimeTransition : null,
    runtimePhase,
    replay,
  };
}

export type TransitionContinuityPreviewController = ReturnType<typeof useTransitionContinuityPreview>;
