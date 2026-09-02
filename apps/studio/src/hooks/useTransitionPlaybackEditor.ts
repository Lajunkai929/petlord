import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { defaultTransitionPlayback, type TransitionPlayback } from "@petlord/schema";

export function normalizePingPongSegment(startSeconds: number, endSeconds: number, durationSeconds: number) {
  const safeDuration = Math.max(0.1, durationSeconds);
  const start = Math.max(0, Math.min(Number.isFinite(startSeconds) ? startSeconds : 0, safeDuration - 0.1));
  const end = Math.max(start + 0.1, Math.min(Number.isFinite(endSeconds) ? endSeconds : safeDuration, safeDuration));
  return { startSeconds: Math.round(start * 1000) / 1000, endSeconds: Math.round(end * 1000) / 1000 };
}

export function hasUnsavedPingPongDraft(
  playback: TransitionPlayback,
  draftMode: TransitionPlayback["mode"],
  segmentStartSeconds: number,
  segmentEndSeconds: number,
) {
  if (draftMode !== "ping-pong") return false;
  return playback.mode !== "ping-pong" ||
    playback.segmentStartMs !== Math.round(segmentStartSeconds * 1000) ||
    playback.segmentEndMs !== Math.round(segmentEndSeconds * 1000);
}

export function useTransitionPlaybackEditor(input: {
  transitionId: string;
  playback?: TransitionPlayback;
  sourceDurationMs: number;
  onUpdate: (playback: TransitionPlayback) => void;
  onCreatePingPong: (playback: TransitionPlayback) => void;
  onUseForward: () => void;
}) {
  const playback: TransitionPlayback = input.playback ?? defaultTransitionPlayback;
  const defaultEndSeconds = Math.min(1.6, input.sourceDurationMs / 1000);
  const [draftMode, setDraftMode] = useState<TransitionPlayback["mode"]>(playback.mode);
  const [segmentStartSeconds, setSegmentStartSeconds] = useState(playback.segmentStartMs / 1000);
  const [segmentEndSeconds, setSegmentEndSeconds] = useState((playback.segmentEndMs ?? defaultEndSeconds * 1000) / 1000);
  const [previewingSegment, setPreviewingSegment] = useState(false);
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setDraftMode(playback.mode);
    setSegmentStartSeconds(playback.segmentStartMs / 1000);
    setSegmentEndSeconds((playback.segmentEndMs ?? defaultEndSeconds * 1000) / 1000);
    setPreviewingSegment(false);
  }, [defaultEndSeconds, input.transitionId, playback.mode, playback.segmentEndMs, playback.segmentStartMs]);

  useEffect(() => {
    const video = previewRef.current;
    if (!video) return;
    const finishPreview = () => {
      if (!previewingSegment || video.currentTime < segmentEndSeconds) return;
      video.pause();
      video.currentTime = segmentStartSeconds;
      setPreviewingSegment(false);
    };
    video.addEventListener("timeupdate", finishPreview);
    return () => video.removeEventListener("timeupdate", finishPreview);
  }, [previewingSegment, segmentEndSeconds, segmentStartSeconds]);

  const segmentError = useMemo(() => {
    if (segmentStartSeconds < 0) return "片段起点不能小于 0 秒";
    if (segmentEndSeconds > input.sourceDurationMs / 1000 + 0.001) return "片段终点不能超过原视频时长";
    if (segmentEndSeconds - segmentStartSeconds < 0.1) return "往复片段至少保留 0.1 秒";
    return null;
  }, [input.sourceDurationMs, segmentEndSeconds, segmentStartSeconds]);
  const pingPongDraftUnsaved = hasUnsavedPingPongDraft(
    playback,
    draftMode,
    segmentStartSeconds,
    segmentEndSeconds,
  );

  function updateRepeatMode(repeatMode: TransitionPlayback["repeatMode"]) {
    input.onUpdate({ ...playback, repeatMode, maxCycles: repeatMode === "fixed" ? playback.minCycles : Math.max(playback.maxCycles, playback.minCycles) });
  }

  function updateMinCycles(minCycles: number) {
    const safeMin = Math.max(1, Math.min(12, minCycles));
    input.onUpdate({ ...playback, minCycles: safeMin, maxCycles: Math.max(safeMin, playback.maxCycles) });
  }

  function updateMaxCycles(maxCycles: number) {
    const safeMax = Math.max(playback.minCycles, Math.min(12, maxCycles));
    input.onUpdate({ ...playback, maxCycles: safeMax });
  }

  function chooseMode(mode: TransitionPlayback["mode"]) {
    setDraftMode(mode);
    setPreviewingSegment(false);
    previewRef.current?.pause();
    if (mode === "forward" && playback.mode !== "forward") input.onUseForward();
  }

  function updateSegmentStart(seconds: number) {
    const normalized = normalizePingPongSegment(seconds, segmentEndSeconds, input.sourceDurationMs / 1000);
    setSegmentStartSeconds(normalized.startSeconds);
    setSegmentEndSeconds(normalized.endSeconds);
    if (previewRef.current) previewRef.current.currentTime = normalized.startSeconds;
  }

  function updateSegmentEnd(seconds: number) {
    const normalized = normalizePingPongSegment(segmentStartSeconds, seconds, input.sourceDurationMs / 1000);
    setSegmentStartSeconds(normalized.startSeconds);
    setSegmentEndSeconds(normalized.endSeconds);
    if (previewRef.current) previewRef.current.currentTime = normalized.endSeconds;
  }

  function previewSegment() {
    const video = previewRef.current;
    if (!video || segmentError) return;
    video.currentTime = segmentStartSeconds;
    setPreviewingSegment(true);
    void video.play().catch(() => setPreviewingSegment(false));
  }

  function submitPingPong(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (segmentError || !pingPongDraftUnsaved) return;
    input.onCreatePingPong({
      ...playback,
      mode: "ping-pong",
      segmentStartMs: Math.round(segmentStartSeconds * 1000),
      segmentEndMs: Math.round(segmentEndSeconds * 1000),
    });
  }

  return {
    playback,
    draftMode,
    segmentStartSeconds,
    segmentEndSeconds,
    segmentError,
    pingPongDraftUnsaved,
    previewRef,
    previewingSegment,
    chooseMode,
    updateSegmentStart,
    updateSegmentEnd,
    previewSegment,
    updateRepeatMode,
    updateMinCycles,
    updateMaxCycles,
    submitPingPong,
  };
}
