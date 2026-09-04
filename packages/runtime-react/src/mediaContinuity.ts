export interface MediaVisualStats {
  luminance: number;
  visibleWidth: number;
  visibleHeight: number;
  centerX: number;
  centerY: number;
}
export interface MediaBridgeProfile {
  brightnessGain: number;
  targetInitialScale: number;
  targetInitialOffsetX: number;
  targetInitialOffsetY: number;
  structuralMismatch: boolean;
}

export interface MediaBridgeFrame {
  sourceOpacity: number;
  targetOpacity: number;
  sourceBrightness: number;
  sourceBlurRatio: number;
  targetBlurRatio: number;
  targetScale: number;
  targetOffsetX: number;
  targetOffsetY: number;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function smoothProgress(progress: number) {
  const value = clamp(progress, 0, 1);
  return value * value * (3 - 2 * value);
}

export function overlappingMediaOpacities(progress: number) {
  const value = clamp(progress, 0, 1);
  return {
    sourceOpacity: 1 - smoothProgress((value - 0.45) / 0.55),
    targetOpacity: smoothProgress(value / 0.55),
  };
}

function mix(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

export function calculateBrightnessGain(source: MediaVisualStats | undefined, target: MediaVisualStats | undefined) {
  if (!source || !target || source.luminance <= 0.01 || target.luminance <= 0.01) return 1;
  // Large instantaneous exposure corrections look like a white or black flash,
  // especially around semi-transparent fur edges. Keep correction deliberately
  // conservative and let the overlap itself absorb the remaining difference.
  return clamp(target.luminance / source.luminance, 0.82, 1.18);
}

export function releaseEntryBrightness(initialGain: number, elapsedMs: number, releaseDurationMs = 650) {
  return mix(initialGain, 1, smoothProgress(elapsedMs / Math.max(1, releaseDurationMs)));
}

export function stabilizedTailPlaybackRate(remainingMs: number, enabled: boolean, slowWindowMs = 420) {
  if (!enabled || remainingMs >= slowWindowMs) return 1;
  const slowdown = smoothProgress(1 - remainingMs / Math.max(1, slowWindowMs));
  return mix(1, 0.36, slowdown);
}

export function createMediaBridgeProfile(source: MediaVisualStats | undefined, target: MediaVisualStats | undefined): MediaBridgeProfile {
  const brightnessGain = calculateBrightnessGain(source, target);
  if (!source || !target) {
    return { brightnessGain, targetInitialScale: 1, targetInitialOffsetX: 0, targetInitialOffsetY: 0, structuralMismatch: false };
  }
  const widthRatio = source.visibleWidth / Math.max(0.01, target.visibleWidth);
  const heightRatio = source.visibleHeight / Math.max(0.01, target.visibleHeight);
  // Generated motion can drift much farther than a normal camera wobble. A
  // narrow 0.8–1.24 clamp left obviously oversized tail frames to collapse
  // into a much smaller authority image during the last few milliseconds.
  // Stable dissolve is an explicit opt-in, so it is safe to correct the full
  // geometry mismatch here instead of preserving that visible jump.
  const targetInitialScale = clamp(Math.sqrt(widthRatio * heightRatio), 0.6, 1.75);
  const scaledTargetCenterX = 0.5 + (target.centerX - 0.5) * targetInitialScale;
  const scaledTargetCenterY = 0.5 + (target.centerY - 0.5) * targetInitialScale;
  const targetInitialOffsetX = clamp(source.centerX - scaledTargetCenterX, -0.24, 0.24);
  const targetInitialOffsetY = clamp(source.centerY - scaledTargetCenterY, -0.24, 0.24);
  const sizeMismatch = Math.max(Math.abs(Math.log(widthRatio)), Math.abs(Math.log(heightRatio)));
  const positionMismatch = Math.hypot(source.centerX - target.centerX, source.centerY - target.centerY);
  return {
    brightnessGain,
    targetInitialScale,
    targetInitialOffsetX,
    targetInitialOffsetY,
    structuralMismatch: sizeMismatch > 0.065 || positionMismatch > 0.035,
  };
}

export function mediaBridgeFrame(profile: MediaBridgeProfile, progress: number, mode: "crossfade" | "blur-dissolve" | "hard-cut"): MediaBridgeFrame {
  const eased = smoothProgress(progress);
  const stabilized = mode === "blur-dissolve";
  const alignGeometry = stabilized && profile.structuralMismatch;
  const { sourceOpacity, targetOpacity } = overlappingMediaOpacities(progress);
  // The former dissolve blurred the incoming transparent image most strongly
  // exactly while it was appearing. Light RGB hidden in transparent pixels was
  // therefore expanded into a visible white halo. Use a small bell-shaped blur
  // that is zero at both endpoints, and never blur a plain crossfade.
  const blurEnvelope = alignGeometry ? Math.sin(Math.PI * eased) * 0.55 : 0;
  return {
    sourceOpacity,
    targetOpacity,
    sourceBrightness: stabilized ? mix(1, profile.brightnessGain, smoothProgress(progress / 0.7)) : 1,
    sourceBlurRatio: blurEnvelope,
    targetBlurRatio: blurEnvelope,
    targetScale: alignGeometry ? mix(profile.targetInitialScale, 1, eased) : 1,
    targetOffsetX: alignGeometry ? mix(profile.targetInitialOffsetX, 0, eased) : 0,
    targetOffsetY: alignGeometry ? mix(profile.targetInitialOffsetY, 0, eased) : 0,
  };
}
