import { describe, it, expect } from "vitest";
import * as gaze from "./gazeSeekScheduler";
class Media extends EventTarget {
  readyState = 2;
  seeking = false;
  private time = 0;
  writes: number[] = [];
  decoded: number[] = [];
  get currentTime() {
    return this.time;
  }
  set currentTime(value: number) {
    this.time = value;
    this.writes.push(value);
    this.seeking = true;
  }
  pause() {}
  finish() {
    this.seeking = false;
    this.decoded.push(this.time);
    this.dispatchEvent(new Event("seeked"));
  }
}
function fixture(
  options: { smoothingMs?: number; scale?: { value: number } } = {},
) {
  const media = new Media();
  let time = 0;
  let serial = 0;
  const queued = new Map<number, (at: number) => void>();
  const drawn: number[] = [];
  const errors: string[] = [];
  const scheduler = gaze.createGazeSeekScheduler({
    media,
    timeForProgress: (progress) =>
      Math.round(progress * (options.scale?.value ?? 6) * 1000) / 1000,
    onFrame: () => drawn.push(media.currentTime),
    onError: (error) => errors.push(error),
    smoothingMs: options.smoothingMs ?? 0,
    now: () => time,
    requestFrame: (callback) => {
      const id = ++serial;
      queued.set(id, callback);
      return id;
    },
    cancelFrame: (id) => {
      queued.delete(id);
    },
  });
  return {
    media,
    scheduler,
    drawn,
    errors,
    queued,
    step: (at: number) => {
      time = at;
      const callbacks = [...queued.values()];
      queued.clear();
      callbacks.forEach((callback) => callback(at));
    },
  };
}
describe("gaze seek scheduling", () => {
  it("holds an in-flight decode and replaces hundreds of pending targets with only the latest", () => {
    const f = fixture();
    f.scheduler.setActive(true);
    f.scheduler.setTarget(0.1);
    f.step(0);
    for (let index = 0; index < 500; index++) {
      f.scheduler.setTarget(index / 1000);
      f.step(index + 1);
    }
    expect(f.media.writes).toEqual([0.6]);
    expect(f.drawn).toEqual([]);
    expect(f.queued.size).toBe(0);
    f.media.finish();
    expect(f.drawn).toEqual([0.6]);
    f.step(501);
    expect(f.media.writes).toEqual([0.6, 2.994]);
    f.media.finish();
    expect(f.drawn).toEqual([0.6, 2.994]);
    f.step(600);
    expect(f.queued.size).toBe(0);
  });
  it("bounds completed seek requests and settles without recurring work for an unchanged target", () => {
    const f = fixture();
    f.scheduler.setActive(true);
    f.scheduler.setTarget(0.1);
    f.step(0);
    f.media.finish();
    f.scheduler.setTarget(0.2);
    f.step(20);
    expect(f.media.writes).toHaveLength(1);
    f.step(42);
    expect(f.media.writes).toHaveLength(2);
    f.media.finish();
    f.step(84);
    f.scheduler.setTarget(0.2);
    f.step(126);
    expect(f.media.writes).toEqual([0.6, 1.2]);
    expect(f.queued.size).toBe(0);
  });
  it("preserves a pending decode on pause, does not draw it, and resumes with the latest target", () => {
    const f = fixture();
    f.scheduler.setActive(true);
    f.scheduler.setTarget(0.1);
    f.step(0);
    f.scheduler.setActive(false);
    f.scheduler.setTarget(0.4);
    f.media.finish();
    expect(f.drawn).toEqual([]);
    expect(f.queued.size).toBe(0);
    expect(f.media.writes).toEqual([0.6]);
    f.scheduler.setActive(true);
    f.step(100);
    expect(f.media.writes).toEqual([0.6, 2.4]);
    f.media.finish();
    expect(f.drawn).toEqual([2.4]);
  });
  it("cleans pending readiness, frame work and callbacks when interrupted by a transition", () => {
    const f = fixture();
    f.media.readyState = 0;
    f.scheduler.setActive(true);
    f.scheduler.setTarget(0.2);
    f.step(0);
    f.scheduler.dispose();
    f.media.readyState = 2;
    f.media.dispatchEvent(new Event("loadeddata"));
    f.media.dispatchEvent(new Event("seeked"));
    f.media.dispatchEvent(new Event("error"));
    f.scheduler.setTarget(0.8);
    f.step(100);
    expect(f.media.writes).toEqual([]);
    expect(f.drawn).toEqual([]);
    expect(f.errors).toEqual([]);
    expect(f.queued.size).toBe(0);
  });
  it("does not publish or enqueue a seek after disposal during decode", () => {
    const f = fixture();
    f.scheduler.setActive(true);
    f.scheduler.setTarget(0.2);
    f.step(0);
    f.scheduler.setTarget(0.6);
    f.scheduler.dispose();
    f.media.finish();
    f.step(500);
    expect(f.media.writes).toEqual([1.2]);
    expect(f.drawn).toEqual([]);
    expect(f.queued.size).toBe(0);
  });
  it("smooths the short circular path across the gaze seam and eventually reaches the exact target", () => {
    expect(gaze.interpolateGazeProgress(0.98, 0.02, 0.5)).toBeCloseTo(0);
    expect(gaze.interpolateGazeProgress(0.02, 0.98, 0.5)).toBeCloseTo(0);
    const f = fixture({ smoothingMs: 70 });
    f.scheduler.setActive(true);
    f.scheduler.setTarget(0.98);
    f.step(0);
    f.media.finish();
    f.scheduler.setTarget(0.02);
    f.step(70);
    expect(f.media.writes[1]).toBeLessThan(0.12);
    for (let at = 140; at < 800; at += 70) {
      f.media.finish();
      f.step(at);
    }
    expect(f.media.writes.at(-1)).toBeCloseTo(0.12);
  });
});

it("applies a changed direction calibration after an already pending decode", () => {
  const scale = { value: 6 };
  const f = fixture({ scale });
  f.scheduler.setActive(true);
  f.scheduler.setTarget(0.1);
  f.step(0);
  scale.value = 3;
  f.scheduler.setTarget(0.1);
  f.media.finish();
  f.step(100);
  expect(f.media.writes).toEqual([0.6, 0.3]);
});
it("reports a decoder failure once and stops seeking or drawing until disposal", () => {
  const f = fixture();
  f.scheduler.setActive(true);
  f.scheduler.setTarget(0.2);
  f.step(0);
  f.media.dispatchEvent(new Event("error"));
  f.media.dispatchEvent(new Event("error"));
  f.media.finish();
  f.scheduler.setTarget(0.8);
  f.step(500);
  expect(f.errors).toHaveLength(1);
  expect(f.drawn).toEqual([]);
  expect(f.media.writes).toEqual([1.2]);
  expect(f.queued.size).toBe(0);
});
