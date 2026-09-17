// @vitest-environment happy-dom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { runtimePointerGazeSchema } from "@petlord/schema";
import {
  RuntimeMediaCanvas,
  type RuntimeMediaCanvasProps,
} from "./RuntimeMediaCanvas";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const gaze = runtimePointerGazeSchema.parse({
  enabled: true,
  motionTarget: "head",
  activationRadius: 1.4,
  videoUri: "/gaze.webm",
  durationMs: 6000,
});
let root: Root | undefined;
let host: HTMLDivElement | undefined;
const restoreMediaProperties: Array<() => void> = [];
afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const restore of restoreMediaProperties.splice(0)) restore();
  vi.useRealTimers();
});
it("updates pointer intent without replacing an active video decode and cleans up on transition", async () => {
  vi.useFakeTimers();
  const states = new WeakMap<
    HTMLMediaElement,
    { time: number; seeking: boolean; writes: number[] }
  >();
  const state = (media: HTMLMediaElement) => {
    let s = states.get(media);
    if (!s) {
      s = { time: 0, seeking: false, writes: [] };
      states.set(media, s);
    }
    return s;
  };
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(2);
  vi.spyOn(HTMLMediaElement.prototype, "seeking", "get").mockImplementation(
    function (this: HTMLMediaElement) {
      return state(this).seeking;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(
    function (this: HTMLMediaElement) {
      return state(this).time;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "set").mockImplementation(
    function (this: HTMLMediaElement, value) {
      const s = state(this);
      s.time = value;
      s.seeking = true;
      s.writes.push(value);
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const props: RuntimeMediaCanvasProps = {
    phase: "idle",
    bridgeProgress: 0,
    frameRate: 24,
    renderResolution: 480,
    pointerGaze: gaze,
    pointerGazeActive: true,
    pointerGazeProgress: 0,
  };
  await act(async () => {
    root!.render(createElement(RuntimeMediaCanvas, props));
  });
  await act(async () => {
    vi.advanceTimersByTime(20);
  });
  const video = host.querySelector("video")!;
  expect(state(video).writes).toEqual([0.6]);
  await act(async () => {
    root!.render(
      createElement(RuntimeMediaCanvas, {
        ...props,
        pointerGazeProgress: 0.125,
      }),
    );
  });
  await act(async () => {
    vi.advanceTimersByTime(100);
  });
  await act(async () => {
    root!.render(
      createElement(RuntimeMediaCanvas, { ...props, pointerGazeProgress: 0.5 }),
    );
  });
  await act(async () => {
    vi.advanceTimersByTime(100);
  });
  expect(state(video).writes).toEqual([0.6]);
  await act(async () => {
    state(video).seeking = false;
    video.dispatchEvent(new Event("seeked"));
    vi.advanceTimersByTime(50);
  });
  expect(state(video).writes).toHaveLength(2);
  expect(state(video).writes[1]).toBeGreaterThan(2);
  await act(async () => {
    root!.render(
      createElement(RuntimeMediaCanvas, {
        ...props,
        activeTransition: {
          id: "interrupt",
          fromStateId: "a",
          toStateId: "b",
          videoUri: "/transition.webm",
          tailFrameUri: "/b.png",
          durationMs: 1000,
          endFrameSource: "video-frame",
          transparentVideo: true,
          authorityBridge: { mode: "hard-cut", durationMs: 120 },
          triggers: [],
        },
        phase: "video",
      }),
    );
  });
  await act(async () => {
    state(video).seeking = false;
    video.dispatchEvent(new Event("seeked"));
    vi.advanceTimersByTime(300);
  });
  expect(state(video).writes).toHaveLength(2);
});

// A real 2D raster backend lets this exercise the blend branch that null-context
// scheduling tests cannot reach. Only browser media decoding is represented by
// one-pixel source surfaces; drawing/compositing and React effects are real.
async function mountDrawingGaze() {
  const { createCanvas } = await import("@napi-rs/canvas");
  const red = createCanvas(1, 1),
    blue = createCanvas(1, 1);
  red.getContext("2d").fillStyle = "#FF0000";
  red.getContext("2d").fillRect(0, 0, 1, 1);
  blue.getContext("2d").fillStyle = "#0000FF";
  blue.getContext("2d").fillRect(0, 0, 1, 1);
  let serial = 0,
    time = 0,
    gazeDraws = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const schedule = (callback: FrameRequestCallback) => {
    const id = ++serial;
    frames.set(id, callback);
    return id;
  };
  const cancel = (id: number) => {
    frames.delete(id);
  };
  vi.spyOn(window, "requestAnimationFrame").mockImplementation(schedule);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(cancel);
  vi.stubGlobal("requestAnimationFrame", schedule);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  vi.spyOn(performance, "now").mockImplementation(() => time);
  vi.stubGlobal("Image", function () {
    const image = document.createElement("img");
    Object.defineProperties(image, {
      naturalWidth: { get: () => 1 },
      naturalHeight: { get: () => 1 },
      src: {
        set: () => {
          queueMicrotask(() => image.onload?.(new Event("load")));
        },
      },
    });
    return image;
  });
  const media = new WeakMap<
    HTMLMediaElement,
    { time: number; seeking: boolean }
  >();
  const status = (video: HTMLMediaElement) => {
    let value = media.get(video);
    if (!value) {
      value = { time: 0, seeking: false };
      media.set(video, value);
    }
    return value;
  };
  vi.spyOn(HTMLMediaElement.prototype, "readyState", "get").mockReturnValue(2);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "seeking", "get").mockImplementation(
    function (this: HTMLMediaElement) {
      return status(this).seeking;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "get").mockImplementation(
    function (this: HTMLMediaElement) {
      return status(this).time;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "currentTime", "set").mockImplementation(
    function (this: HTMLMediaElement, value) {
      status(this).time = value;
      status(this).seeking = true;
    },
  );
  for (const key of ["videoWidth", "videoHeight"]) {
    const previous = Object.getOwnPropertyDescriptor(
      HTMLVideoElement.prototype,
      key,
    );
    Object.defineProperty(HTMLVideoElement.prototype, key, {
      configurable: true,
      get: () => 1,
    });
    restoreMediaProperties.push(() => {
      if (previous)
        Object.defineProperty(HTMLVideoElement.prototype, key, previous);
      else Reflect.deleteProperty(HTMLVideoElement.prototype, key);
    });
  }
  const rasters = new WeakMap<HTMLCanvasElement, typeof red>();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    function (this: HTMLCanvasElement) {
      const element = this;
      let raster = rasters.get(element);
      if (!raster) {
        raster = createCanvas(element.width, element.height);
        rasters.set(element, raster);
      }
      const drawing = raster.getContext("2d");
      return new Proxy(drawing, {
        get(target, key) {
          if (key === "drawImage")
            return (source: CanvasImageSource, ...args: number[]) => {
              if (
                source instanceof HTMLVideoElement &&
                source.getAttribute("src") === "/gaze.webm" &&
                element === host?.querySelector("canvas")
              )
                gazeDraws++;
              const mapped =
                source instanceof HTMLVideoElement
                  ? blue
                  : source instanceof HTMLCanvasElement
                    ? rasters.get(source)!
                    : red;
              (target.drawImage as Function)(mapped, ...args);
            };
          const value = Reflect.get(target, key, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
        set(target, key, value) {
          return Reflect.set(target, key, value, target);
        },
      }) as unknown as CanvasRenderingContext2D;
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const props: RuntimeMediaCanvasProps = {
    currentState: {
      id: "a",
      logicalStateId: "a",
      label: "A",
      imageUri: "/a.png",
      origin: "initial",
    },
    phase: "idle",
    bridgeProgress: 0,
    frameRate: 24,
    renderResolution: 64,
    pointerGaze: gaze,
    pointerGazeActive: true,
    pointerGazeProgress: 0,
    pointerGazeBlendProgress: 1,
  };
  await act(async () => {
    root!.render(createElement(RuntimeMediaCanvas, props));
  });
  const step = async (at: number) => {
    time = at;
    const callbacks = [...frames.values()];
    frames.clear();
    await act(async () => callbacks.forEach((callback) => callback(at)));
  };
  await step(16);
  const video = host.querySelector("video")!;
  await act(async () => {
    status(video).seeking = false;
    video.dispatchEvent(new Event("seeked"));
  });
  return {
    props,
    frames,
    step,
    draws: () => gazeDraws,
    pixel: () => [
      ...rasters
        .get(host!.querySelector("canvas")!)!
        .getContext("2d")
        .getImageData(0, 0, 1, 1).data,
    ],
  };
}

it("cancels blend work at immediate gaze exit and preserves the state pixels", async () => {
  const f = await mountDrawingGaze();
  expect(f.draws()).toBe(1);
  expect(f.frames.size).toBeGreaterThan(0);
  const late = [...f.frames.values()];
  await act(async () =>
    root!.render(
      createElement(RuntimeMediaCanvas, {
        ...f.props,
        pointerGazeActive: false,
        pointerGazeBlendProgress: 0,
      }),
    ),
  );
  expect(f.frames.size).toBe(0);
  await act(async () => late.forEach((callback) => callback(32)));
  await f.step(48);
  expect(f.draws()).toBe(1);
  expect(f.frames.size).toBe(0);
  expect(f.pixel()).toEqual([255, 0, 0, 255]);
});

it.each(["state", "transition", "unmount"])(
  "prevents an already delivered blend callback from rewriting after %s change",
  async (change) => {
    const f = await mountDrawingGaze();
    const late = [...f.frames.values()];
    const before = f.draws();
    await act(async () => {
      if (change === "unmount") {
        root!.unmount();
        root = undefined;
      } else
        root!.render(
          createElement(
            RuntimeMediaCanvas,
            change === "state"
              ? {
                  ...f.props,
                  currentState: {
                    ...f.props.currentState!,
                    id: "b",
                    logicalStateId: "b",
                  },
                  pointerGazeActive: false,
                  pointerGazeBlendProgress: 0,
                }
              : {
                  ...f.props,
                  activeTransition: {
                    id: "t",
                    fromStateId: "a",
                    toStateId: "b",
                    videoUri: "/t.webm",
                    tailFrameUri: "/b.png",
                    durationMs: 1000,
                    endFrameSource: "video-frame",
                    transparentVideo: true,
                    authorityBridge: { mode: "crossfade", durationMs: 500 },
                    triggers: [],
                  },
                  phase: "bridge",
                },
          ),
        );
    });
    await act(async () => late.forEach((callback) => callback(32)));
    await f.step(48);
    expect(f.draws()).toBe(before);
    expect(f.frames.size).toBe(0);
  },
);
it("uses the newest blend value while gaze remains active during fade-out", async () => {
  const f = await mountDrawingGaze();
  const late = [...f.frames.values()];
  await act(async () =>
    root!.render(
      createElement(RuntimeMediaCanvas, {
        ...f.props,
        pointerGazeActive: true,
        pointerGazeBlendProgress: 0,
      }),
    ),
  );
  await act(async () => late.forEach((callback) => callback(32)));
  await f.step(80);
  expect(f.pixel()).toEqual([255, 0, 0, 255]);
  expect(f.frames.size).toBe(0);
});
