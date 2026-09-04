import { useEffect, useLayoutEffect, useRef } from "react";
import type { RuntimePointerGaze, RuntimeState, RuntimeTransition } from "@petlord/schema";
import { pointerGazeTimeMs, type RuntimePhase } from "@petlord/runtime-core";
import {
  calculateBrightnessGain,
  createMediaBridgeProfile,
  mediaBridgeFrame,
  overlappingMediaOpacities,
  releaseEntryBrightness,
  stabilizedTailPlaybackRate,
  type MediaBridgeProfile,
  type MediaVisualStats,
} from "./mediaContinuity";
import { applyPixelArtPostprocess, pixelArtGridSize } from "./pixelArtRenderer";
import type { RuntimeFrameRate, RuntimePixelGridSize, RuntimeRenderResolution } from "./runtimeOptions";

export interface RuntimeMediaCanvasProps {
  currentState?: RuntimeState | null;
  activeTransition?: RuntimeTransition | null;
  phase: RuntimePhase;
  bridgeProgress: number;
  playbackRunId?: number;
  playbackCycleCount?: number;
  frameRate: RuntimeFrameRate;
  renderResolution: RuntimeRenderResolution;
  pixelGridSize?: RuntimePixelGridSize;
  pixelArtProfileKey?: string;
  muted?: boolean;
  pixelated?: boolean;
  pointerGaze?: RuntimePointerGaze | null;
  pointerGazeActive?: boolean;
  pointerGazeProgress?: number;
  pointerGazeBlendProgress?: number;
  className?: string;
  onVideoTimeUpdate?: (elapsedMs: number) => void;
  onVideoEnded?: () => void;
  onPlaybackError?: (message: string) => void;
}

function loadImage(uri: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`无法读取运行时图片：${uri}`));
    image.src = uri;
  });
}

function drawContained(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  resolution: number,
) {
  const scale = Math.min(resolution / Math.max(1, sourceWidth), resolution / Math.max(1, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  context.drawImage(source, Math.round((resolution - width) / 2), Math.round((resolution - height) / 2), width, height);
}

function analyzeVisualSource(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): MediaVisualStats | undefined {
  if (typeof document === "undefined" || sourceWidth <= 0 || sourceHeight <= 0) return undefined;
  const sampleSize = 48;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;
  context.clearRect(0, 0, sampleSize, sampleSize);
  drawContained(context, source, sourceWidth, sourceHeight, sampleSize);
  let pixels: ImageData;
  try {
    pixels = context.getImageData(0, 0, sampleSize, sampleSize);
  } catch {
    return undefined;
  }
  let weightedLuminance = 0;
  let alphaWeight = 0;
  let minX = sampleSize;
  let minY = sampleSize;
  let maxX = -1;
  let maxY = -1;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index + 3] / 255;
    if (alpha < 0.08) continue;
    const pixel = index / 4;
    const x = pixel % sampleSize;
    const y = Math.floor(pixel / sampleSize);
    weightedLuminance += (0.2126 * pixels.data[index] + 0.7152 * pixels.data[index + 1] + 0.0722 * pixels.data[index + 2]) * alpha;
    alphaWeight += alpha;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (alphaWeight <= 0 || maxX < minX || maxY < minY) return undefined;
  return {
    luminance: weightedLuminance / alphaWeight / 255,
    visibleWidth: (maxX - minX + 1) / sampleSize,
    visibleHeight: (maxY - minY + 1) / sampleSize,
    centerX: (minX + maxX + 1) / (sampleSize * 2),
    centerY: (minY + maxY + 1) / (sampleSize * 2),
  };
}

function drawContainedStyled(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  resolution: number,
  style: {
    opacity?: number;
    brightness?: number;
    blurPx?: number;
    scale?: number;
    offsetX?: number;
    offsetY?: number;
  } = {},
) {
  context.save();
  context.globalAlpha = style.opacity ?? 1;
  const filters = [];
  if (style.brightness !== undefined && Math.abs(style.brightness - 1) > 0.005) filters.push(`brightness(${style.brightness})`);
  if (style.blurPx !== undefined && style.blurPx > 0.05) filters.push(`blur(${style.blurPx}px)`);
  if (filters.length > 0) context.filter = filters.join(" ");
  context.translate((style.offsetX ?? 0) * resolution, (style.offsetY ?? 0) * resolution);
  const scale = style.scale ?? 1;
  if (Math.abs(scale - 1) > 0.002) {
    context.translate(resolution / 2, resolution / 2);
    context.scale(scale, scale);
    context.translate(-resolution / 2, -resolution / 2);
  }
  drawContained(context, source, sourceWidth, sourceHeight, resolution);
  context.restore();
}

export function RuntimeMediaCanvas({
  currentState,
  activeTransition,
  phase,
  bridgeProgress,
  playbackRunId = 0,
  playbackCycleCount = 1,
  frameRate,
  renderResolution,
  pixelGridSize = 64,
  pixelArtProfileKey,
  muted = true,
  pixelated = false,
  pointerGaze,
  pointerGazeActive = false,
  pointerGazeProgress = 0.5,
  pointerGazeBlendProgress = 1,
  className,
  onVideoTimeUpdate,
  onVideoEnded,
  onPlaybackError,
}: RuntimeMediaCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const gazeVideoRef = useRef<HTMLVideoElement | null>(null);
  const stateImageRef = useRef<HTMLImageElement | undefined>(undefined);
  const bridgeImageRef = useRef<HTMLImageElement | undefined>(undefined);
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const lastDrawAtRef = useRef(0);
  const playbackCycleIndexRef = useRef(0);
  const entryBrightnessGainRef = useRef(1);
  const interruptionFrameRef = useRef<HTMLCanvasElement | undefined>(undefined);
  const previousPlaybackRef = useRef({ transitionId: activeTransition?.id, runId: playbackRunId });
  const bridgeProfileRef = useRef<MediaBridgeProfile | undefined>(undefined);
  const gazeAlignmentRef = useRef<MediaBridgeProfile | undefined>(undefined);
  const gazeFrameReadyRef = useRef(false);
  const gazeVisualBlendRef = useRef(0);
  const gazeBlendFrameRef = useRef(0);
  const frameRateRef = useRef(frameRate);
  const timeUpdateCallbackRef = useRef(onVideoTimeUpdate);
  const endedCallbackRef = useRef(onVideoEnded);
  const playbackErrorCallbackRef = useRef(onPlaybackError);
  const effectivePixelArtProfileKey = [pixelArtProfileKey, currentState?.id, currentState?.imageUri].filter(Boolean).join(":");
  frameRateRef.current = frameRate;
  timeUpdateCallbackRef.current = onVideoTimeUpdate;
  endedCallbackRef.current = onVideoEnded;
  playbackErrorCallbackRef.current = onPlaybackError;

  useLayoutEffect(() => {
    const previous = previousPlaybackRef.current;
    const next = { transitionId: activeTransition?.id, runId: playbackRunId };
    const replacesPlayingTransition = Boolean(
      previous.transitionId &&
      next.transitionId &&
      (previous.transitionId !== next.transitionId || previous.runId !== next.runId),
    );
    if (replacesPlayingTransition && canvasRef.current && typeof document !== "undefined") {
      const snapshot = document.createElement("canvas");
      snapshot.width = canvasRef.current.width;
      snapshot.height = canvasRef.current.height;
      snapshot.getContext("2d")?.drawImage(canvasRef.current, 0, 0);
      interruptionFrameRef.current = snapshot;
    } else if (!next.transitionId) {
      interruptionFrameRef.current = undefined;
    }
    previousPlaybackRef.current = next;
  }, [activeTransition?.id, playbackRunId]);

  function context() {
    const canvas = canvasRef.current;
    const drawing = canvas?.getContext("2d");
    if (!canvas || !drawing) return null;
    // Pixel-art sources must reach the logical grid without a bilinear pass.
    // Otherwise tiny eyes are blended into the surrounding dark fur before the
    // postprocessor gets a chance to preserve them.
    drawing.imageSmoothingEnabled = !pixelated;
    drawing.clearRect(0, 0, renderResolution, renderResolution);
    return drawing;
  }

  function finalizeFrame(drawing: CanvasRenderingContext2D) {
    const canvas = canvasRef.current;
    if (pixelated && canvas) applyPixelArtPostprocess(canvas, drawing, renderResolution, { gridSize: pixelGridSize, profileKey: effectivePixelArtProfileKey });
  }

  function drawState(image = stateImageRef.current) {
    if (!image) return;
    const drawing = context();
    if (!drawing) return;
    drawContained(drawing, image, image.naturalWidth, image.naturalHeight, renderResolution);
    finalizeFrame(drawing);
  }

  function drawTransitionFrame() {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const drawing = context();
    if (!drawing) return;
    const configuredEntryBlendMs = playbackCycleIndexRef.current === 0 ? activeTransition?.entryBlendMs ?? 0 : 0;
    const entryBlendMs = interruptionFrameRef.current ? Math.max(120, configuredEntryBlendMs) : configuredEntryBlendMs;
    const entryProgress = entryBlendMs > 0 ? Math.min(1, video.currentTime * 1000 / entryBlendMs) : 1;
    const entryBrightness = releaseEntryBrightness(
      entryBrightnessGainRef.current,
      video.currentTime * 1000,
      Math.max(650, entryBlendMs + 360),
    );
    if (phase === "bridge" && bridgeImageRef.current) {
      if (!bridgeProfileRef.current) {
        bridgeProfileRef.current = createMediaBridgeProfile(
          analyzeVisualSource(video, video.videoWidth, video.videoHeight),
          analyzeVisualSource(bridgeImageRef.current, bridgeImageRef.current.naturalWidth, bridgeImageRef.current.naturalHeight),
        );
      }
      const profile = bridgeProfileRef.current;
      const bridgeMode = activeTransition?.authorityBridge.mode ?? "crossfade";
      const frame = mediaBridgeFrame(profile, bridgeProgress, bridgeMode);
      const maxBlur = pixelated || bridgeMode !== "blur-dissolve"
        ? 0
        : activeTransition?.transparentVideo
          ? Math.min(0.8, renderResolution * 0.0015)
          : Math.min(2.4, renderResolution * 0.004);
      if (frame.sourceOpacity > 0) drawContainedStyled(drawing, video, video.videoWidth, video.videoHeight, renderResolution, {
        opacity: frame.sourceOpacity,
        brightness: frame.sourceBrightness,
        blurPx: frame.sourceBlurRatio * maxBlur,
      });
      if (frame.targetOpacity > 0) drawContainedStyled(
        drawing,
        bridgeImageRef.current,
        bridgeImageRef.current.naturalWidth,
        bridgeImageRef.current.naturalHeight,
        renderResolution,
        {
          opacity: frame.targetOpacity,
          blurPx: frame.targetBlurRatio * maxBlur,
          scale: frame.targetScale,
          offsetX: frame.targetOffsetX,
          offsetY: frame.targetOffsetY,
        },
      );
      finalizeFrame(drawing);
      return;
    }
    const entrySource = interruptionFrameRef.current ?? stateImageRef.current;
    if (phase === "video" && entryProgress < 1 && entrySource) {
      const sourceWidth = entrySource instanceof HTMLCanvasElement ? entrySource.width : entrySource.naturalWidth;
      const sourceHeight = entrySource instanceof HTMLCanvasElement ? entrySource.height : entrySource.naturalHeight;
      const opacity = overlappingMediaOpacities(entryProgress);
      drawContainedStyled(drawing, entrySource, sourceWidth, sourceHeight, renderResolution, { opacity: opacity.sourceOpacity });
      drawContainedStyled(drawing, video, video.videoWidth, video.videoHeight, renderResolution, { opacity: opacity.targetOpacity, brightness: entryBrightness });
      finalizeFrame(drawing);
      return;
    }
    if (entryProgress >= 1) interruptionFrameRef.current = undefined;
    drawContainedStyled(drawing, video, video.videoWidth, video.videoHeight, renderResolution, { brightness: entryBrightness });
    finalizeFrame(drawing);
  }

  function drawPointerGazeFrame() {
    const video = gazeVideoRef.current;
    if (!video || video.readyState < 2 || video.seeking || !gazeFrameReadyRef.current) return;
    const drawing = context();
    if (!drawing) return;
    const stateImage = stateImageRef.current;
    if (!gazeAlignmentRef.current && stateImage) {
      gazeAlignmentRef.current = createMediaBridgeProfile(
        analyzeVisualSource(stateImage, stateImage.naturalWidth, stateImage.naturalHeight),
        analyzeVisualSource(video, video.videoWidth, video.videoHeight),
      );
    }
    const requestedBlend = Math.max(0, Math.min(1, pointerGazeBlendProgress));
    const blendDelta = requestedBlend - gazeVisualBlendRef.current;
    const visualBlend = Math.abs(blendDelta) <= 0.08
      ? requestedBlend
      : gazeVisualBlendRef.current + Math.sign(blendDelta) * 0.08;
    gazeVisualBlendRef.current = visualBlend;
    const opacity = overlappingMediaOpacities(visualBlend);
    if (stateImage && opacity.sourceOpacity > 0) {
      drawContainedStyled(drawing, stateImage, stateImage.naturalWidth, stateImage.naturalHeight, renderResolution, { opacity: opacity.sourceOpacity });
    }
    const alignment = gazeAlignmentRef.current;
    drawContainedStyled(drawing, video, video.videoWidth, video.videoHeight, renderResolution, {
      opacity: opacity.targetOpacity,
      scale: alignment?.structuralMismatch ? alignment.targetInitialScale : 1,
      offsetX: alignment?.structuralMismatch ? alignment.targetInitialOffsetX : 0,
      offsetY: alignment?.structuralMismatch ? alignment.targetInitialOffsetY : 0,
    });
    finalizeFrame(drawing);
    if (Math.abs(requestedBlend - visualBlend) > 0.001 && !gazeBlendFrameRef.current) {
      gazeBlendFrameRef.current = window.requestAnimationFrame(() => {
        gazeBlendFrameRef.current = 0;
        drawPointerGazeFrame();
      });
    }
  }

  function cachedImage(uri: string) {
    return imageCacheRef.current.get(uri);
  }

  function loadCachedImage(uri: string) {
    const cached = cachedImage(uri);
    if (cached) return Promise.resolve(cached);
    return loadImage(uri).then((image) => {
      imageCacheRef.current.set(uri, image);
      return image;
    });
  }

  useEffect(() => {
    let cancelled = false;
    if (!currentState?.imageUri) return;
    const cached = cachedImage(currentState.imageUri);
    if (cached) {
      stateImageRef.current = cached;
      if (activeTransition) drawTransitionFrame();
      else drawState(cached);
      return;
    }
    void loadCachedImage(currentState.imageUri).then((image) => {
      if (cancelled) return;
      stateImageRef.current = image;
      if (activeTransition) drawTransitionFrame();
      else drawState(image);
    }).catch((caught) => playbackErrorCallbackRef.current?.(caught instanceof Error ? caught.message : "运行时图片加载失败"));
    return () => { cancelled = true; };
  }, [activeTransition, currentState?.imageUri, effectivePixelArtProfileKey, pixelated, pixelGridSize, renderResolution]);

  useEffect(() => {
    let cancelled = false;
    bridgeImageRef.current = undefined;
    bridgeProfileRef.current = undefined;
    if (!activeTransition) return;
    const cached = cachedImage(activeTransition.tailFrameUri);
    if (cached) {
      bridgeImageRef.current = cached;
      if (phase === "bridge") drawTransitionFrame();
      return;
    }
    void loadCachedImage(activeTransition.tailFrameUri).then((image) => {
      if (cancelled) return;
      bridgeImageRef.current = image;
      if (phase === "bridge") drawTransitionFrame();
    }).catch((caught) => playbackErrorCallbackRef.current?.(caught instanceof Error ? caught.message : "过渡结束帧加载失败"));
    return () => { cancelled = true; };
  }, [activeTransition?.id, activeTransition?.tailFrameUri]);

  useEffect(() => {
    gazeAlignmentRef.current = undefined;
    gazeFrameReadyRef.current = false;
    gazeVisualBlendRef.current = 0;
    if (gazeBlendFrameRef.current) window.cancelAnimationFrame(gazeBlendFrameRef.current);
    gazeBlendFrameRef.current = 0;
  }, [currentState?.imageUri, pointerGaze?.videoUri]);

  useEffect(() => {
    const video = videoRef.current;
    if (!activeTransition || !video) return;
    if (phase !== "video") {
      video.pause();
      drawTransitionFrame();
      return;
    }
    let cancelled = false;
    let animationFrame = 0;
    let videoFrame = 0;
    let framePending = false;
    let completingCycle = false;
    lastDrawAtRef.current = 0;
    playbackCycleIndexRef.current = 0;
    entryBrightnessGainRef.current = 1;
    bridgeProfileRef.current = undefined;
    video.currentTime = 0;
    const scheduleDraw = () => {
      if (cancelled || framePending) return;
      framePending = true;
      if (video.requestVideoFrameCallback) videoFrame = video.requestVideoFrameCallback(draw);
      else animationFrame = window.requestAnimationFrame(draw);
    };
    const draw = (timestamp: number) => {
      if (cancelled) return;
      framePending = false;
      const interval = 1000 / frameRateRef.current;
      if (timestamp - lastDrawAtRef.current >= interval - 1) {
        lastDrawAtRef.current = timestamp;
        drawTransitionFrame();
      }
      const isFinalCycle = playbackCycleIndexRef.current >= Math.max(1, playbackCycleCount) - 1;
      const remainingMs = Math.max(0, activeTransition.durationMs - video.currentTime * 1000);
      video.playbackRate = stabilizedTailPlaybackRate(
        remainingMs,
        isFinalCycle && activeTransition.endFrameSource !== "video-frame",
      );
      const completedCycles = playbackCycleIndexRef.current * activeTransition.durationMs;
      timeUpdateCallbackRef.current?.(completedCycles + video.currentTime * 1000);
      if (video.currentTime * 1000 >= activeTransition.durationMs) {
        completeCycle();
        return;
      }
      if (!video.ended) scheduleDraw();
    };
    const start = () => {
      video.playbackRate = 1;
      scheduleDraw();
      void video.play().catch(() => playbackErrorCallbackRef.current?.("浏览器阻止了视频播放，请与宠物交互后重试。"));
    };
    const completeCycle = () => {
      if (completingCycle) return;
      completingCycle = true;
      const completedCycles = playbackCycleIndexRef.current + 1;
      timeUpdateCallbackRef.current?.(completedCycles * activeTransition.durationMs);
      if (completedCycles >= Math.max(1, playbackCycleCount)) {
        endedCallbackRef.current?.();
        return;
      }
      playbackCycleIndexRef.current = completedCycles;
      video.currentTime = 0;
      video.playbackRate = 1;
      completingCycle = false;
      start();
    };
    video.addEventListener("ended", completeCycle);
    const prepare = async () => {
      try {
        const sourceImage = currentState?.imageUri ? await loadCachedImage(currentState.imageUri) : undefined;
        if (cancelled) return;
        if (sourceImage) stateImageRef.current = sourceImage;
        if (video.readyState < 2) {
          await new Promise<void>((resolve, reject) => {
            const loaded = () => { cleanup(); resolve(); };
            const failed = () => { cleanup(); reject(new Error("过渡视频首帧解码失败")); };
            const cleanup = () => {
              video.removeEventListener("loadeddata", loaded);
              video.removeEventListener("error", failed);
            };
            video.addEventListener("loadeddata", loaded, { once: true });
            video.addEventListener("error", failed, { once: true });
          });
        }
        if (cancelled) return;
        entryBrightnessGainRef.current = calculateBrightnessGain(
          analyzeVisualSource(video, video.videoWidth, video.videoHeight),
          sourceImage ? analyzeVisualSource(sourceImage, sourceImage.naturalWidth, sourceImage.naturalHeight) : undefined,
        );
        drawTransitionFrame();
        start();
      } catch (caught) {
        playbackErrorCallbackRef.current?.(caught instanceof Error ? caught.message : "过渡媒体准备失败");
      }
    };
    void prepare();
    return () => {
      cancelled = true;
      video.removeEventListener("ended", completeCycle);
      if (video.cancelVideoFrameCallback && videoFrame) video.cancelVideoFrameCallback(videoFrame);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      video.pause();
      video.playbackRate = 1;
    };
  }, [activeTransition?.id, currentState?.imageUri, phase, playbackCycleCount, playbackRunId]);

  useEffect(() => {
    const video = gazeVideoRef.current;
    if (!pointerGaze?.videoUri || !video || activeTransition || !pointerGazeActive) return;
    let cancelled = false;
    const draw = () => {
      if (!cancelled) {
        gazeFrameReadyRef.current = true;
        drawPointerGazeFrame();
      }
    };
    const seek = async () => {
      if (video.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const loaded = () => { cleanup(); resolve(); };
          const failed = () => { cleanup(); reject(new Error("注视视频解码失败")); };
          const cleanup = () => {
            video.removeEventListener("loadeddata", loaded);
            video.removeEventListener("error", failed);
          };
          video.addEventListener("loadeddata", loaded, { once: true });
          video.addEventListener("error", failed, { once: true });
        });
      }
      if (cancelled) return;
      video.pause();
      const durationMs = pointerGaze.durationMs ?? Math.max(1, video.duration * 1000);
      const targetSeconds = pointerGazeTimeMs({ ...pointerGaze, durationMs }, pointerGazeProgress) / 1000;
      if (Math.abs(video.currentTime - targetSeconds) < 0.018) draw();
      else {
        gazeFrameReadyRef.current = false;
        video.currentTime = targetSeconds;
      }
    };
    video.addEventListener("seeked", draw);
    void seek().catch((caught) => playbackErrorCallbackRef.current?.(caught instanceof Error ? caught.message : "注视媒体准备失败"));
    return () => {
      cancelled = true;
      video.removeEventListener("seeked", draw);
    };
  }, [activeTransition, pointerGaze?.directionKeyframesMs, pointerGaze?.durationMs, pointerGaze?.segmentEndMs, pointerGaze?.segmentStartMs, pointerGaze?.videoUri, pointerGazeActive, pointerGazeProgress, renderResolution]);

  useEffect(() => {
    if (activeTransition) drawTransitionFrame();
    else if (pointerGazeActive && pointerGaze?.videoUri) drawPointerGazeFrame();
    else {
      const cached = currentState?.imageUri ? cachedImage(currentState.imageUri) : undefined;
      if (cached) stateImageRef.current = cached;
      drawState(cached);
    }
  }, [activeTransition, bridgeProgress, currentState?.imageUri, effectivePixelArtProfileKey, phase, pixelated, pixelGridSize, pointerGaze?.videoUri, pointerGazeActive, pointerGazeBlendProgress, renderResolution]);

  useEffect(() => () => {
    if (gazeBlendFrameRef.current) window.cancelAnimationFrame(gazeBlendFrameRef.current);
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className}
        width={renderResolution}
        height={renderResolution}
        data-pixel-art={pixelated ? "true" : "false"}
        data-pixel-grid={pixelated ? pixelArtGridSize(renderResolution, pixelGridSize) : undefined}
        role="img"
        aria-label={`${activeTransition ? `正在播放 ${activeTransition.id}` : pointerGazeActive ? "正在注视鼠标" : currentState?.label ?? "桌面宠物"}${pixelated ? ` · ${pixelArtGridSize(renderResolution, pixelGridSize)} 格像素艺术` : ""}`}
        style={{ imageRendering: pixelated ? "pixelated" : "auto" }}
      />
      {activeTransition && <video
        ref={videoRef}
        src={activeTransition.videoUri}
        muted={muted}
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />}
      {pointerGaze?.videoUri && <video
        ref={gazeVideoRef}
        src={pointerGaze.videoUri}
        muted
        playsInline
        preload="auto"
        aria-hidden="true"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />}
    </>
  );
}
