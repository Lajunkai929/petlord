import { describe, expect, it } from "vitest";
import {
  calculateBrightnessGain,
  createMediaBridgeProfile,
  mediaBridgeFrame,
  overlappingMediaOpacities,
  releaseEntryBrightness,
  stabilizedTailPlaybackRate,
  type MediaVisualStats,
} from "./mediaContinuity";

const lyingImage: MediaVisualStats = { luminance: 0.309, visibleWidth: 0.906, visibleHeight: 0.797, centerX: 0.5, centerY: 0.492 };
const lyingVideo: MediaVisualStats = { luminance: 0.268, visibleWidth: 0.906, visibleHeight: 0.797, centerX: 0.5, centerY: 0.492 };
const sleepVideo: MediaVisualStats = { luminance: 0.221, visibleWidth: 0.969, visibleHeight: 0.531, centerX: 0.5, centerY: 0.594 };
const sleepImage: MediaVisualStats = { luminance: 0.243, visibleWidth: 0.938, visibleHeight: 0.484, centerX: 0.5, centerY: 0.539 };

describe("media continuity correction", () => {
  it("matches a darker first video frame and releases the gain gradually", () => {
    const gain = calculateBrightnessGain(lyingVideo, lyingImage);
    expect(gain).toBeCloseTo(1.153, 2);
    expect(releaseEntryBrightness(gain, 0)).toBeCloseTo(gain);
    expect(releaseEntryBrightness(gain, 325)).toBeGreaterThan(1);
    expect(releaseEntryBrightness(gain, 650)).toBe(1);
  });

  it("slows only the final unstable tail window", () => {
    expect(stabilizedTailPlaybackRate(800, true)).toBe(1);
    expect(stabilizedTailPlaybackRate(210, true)).toBeCloseTo(0.68, 2);
    expect(stabilizedTailPlaybackRate(0, true)).toBeCloseTo(0.36, 2);
    expect(stabilizedTailPlaybackRate(0, false)).toBe(1);
  });

  it("aligns brightness, size and center before dissolving a mismatched tail", () => {
    const profile = createMediaBridgeProfile(sleepVideo, sleepImage);
    expect(profile.structuralMismatch).toBe(true);
    expect(profile.brightnessGain).toBeCloseTo(1.1, 1);
    expect(profile.targetInitialScale).toBeGreaterThan(1);
    expect(profile.targetInitialOffsetY).toBeGreaterThan(0);
    const start = mediaBridgeFrame(profile, 0, "blur-dissolve");
    const middle = mediaBridgeFrame(profile, 0.5, "blur-dissolve");
    const end = mediaBridgeFrame(profile, 1, "blur-dissolve");
    expect(start.sourceOpacity).toBe(1);
    expect(start.targetOpacity).toBe(0);
    expect(start.targetBlurRatio).toBe(0);
    expect(middle.sourceBlurRatio).toBeGreaterThan(0);
    expect(middle.sourceBlurRatio).toBeLessThan(0.6);
    expect(middle.targetOpacity).toBeGreaterThan(0);
    expect(end.sourceBlurRatio).toBeCloseTo(0);
    expect(end.targetOpacity).toBe(1);
    expect(end.targetScale).toBe(1);
    expect(end.targetOffsetY).toBe(0);
  });

  it("keeps ordinary crossfade free of blur, exposure and geometry correction", () => {
    const profile = createMediaBridgeProfile(sleepVideo, sleepImage);
    const middle = mediaBridgeFrame(profile, 0.5, "crossfade");
    expect(middle).toMatchObject({
      sourceBrightness: 1,
      sourceBlurRatio: 0,
      targetBlurRatio: 0,
      targetScale: 1,
      targetOffsetX: 0,
      targetOffsetY: 0,
    });
  });

  it("caps extreme exposure correction to prevent a flash", () => {
    const dark = { ...lyingVideo, luminance: 0.08 };
    const bright = { ...lyingImage, luminance: 0.5 };
    expect(calculateBrightnessGain(dark, bright)).toBe(1.18);
    expect(calculateBrightnessGain(bright, dark)).toBe(0.82);
  });

  it("can align a strongly oversized video tail before the authority image settles", () => {
    const oversizedTail = { ...sleepVideo, visibleWidth: 0.96, visibleHeight: 0.88, centerY: 0.62 };
    const compactAuthority = { ...sleepImage, visibleWidth: 0.58, visibleHeight: 0.5, centerY: 0.54 };
    const profile = createMediaBridgeProfile(oversizedTail, compactAuthority);
    expect(profile.structuralMismatch).toBe(true);
    expect(profile.targetInitialScale).toBeGreaterThan(1.5);
    expect(Math.abs(profile.targetInitialOffsetY)).toBeGreaterThan(0.02);
  });

  it("keeps one media layer effectively opaque throughout the overlap", () => {
    const samples = Array.from({ length: 21 }, (_, index) => overlappingMediaOpacities(index / 20));
    expect(samples[0]).toEqual({ sourceOpacity: 1, targetOpacity: 0 });
    expect(samples.at(-1)).toEqual({ sourceOpacity: 0, targetOpacity: 1 });
    expect(samples.every((sample) => Math.max(sample.sourceOpacity, sample.targetOpacity) >= 0.97)).toBe(true);
    expect(samples[10].sourceOpacity).toBeGreaterThan(0.95);
    expect(samples[10].targetOpacity).toBeGreaterThan(0.95);
  });
});
