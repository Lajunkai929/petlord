import { describe, expect, it } from "vitest";
import { defaultTransitionPlayback } from "@petlord/schema";
import { hasUnsavedPingPongDraft, normalizePingPongSegment } from "./useTransitionPlaybackEditor";

describe("ping-pong playback range", () => {
  it("keeps the selected range inside the original clip", () => {
    expect(normalizePingPongSegment(-1, 9, 4)).toEqual({ startSeconds: 0, endSeconds: 4 });
  });

  it("always preserves at least one tenth of a second", () => {
    expect(normalizePingPongSegment(3.98, 3.99, 4)).toEqual({ startSeconds: 3.9, endSeconds: 4 });
  });

  it("marks a newly selected reverse range as unsaved", () => {
    expect(hasUnsavedPingPongDraft(defaultTransitionPlayback, "ping-pong", 0, 1.6)).toBe(true);
  });

  it("recognizes a persisted reverse range and detects later edits", () => {
    const playback = { ...defaultTransitionPlayback, mode: "ping-pong" as const, segmentEndMs: 1_600 };
    expect(hasUnsavedPingPongDraft(playback, "ping-pong", 0, 1.6)).toBe(false);
    expect(hasUnsavedPingPongDraft(playback, "ping-pong", 0.2, 1.6)).toBe(true);
  });
});
