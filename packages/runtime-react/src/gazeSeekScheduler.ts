/** A video seek is a decode operation: keep one in flight and at most one latest intent. */
export interface GazeSeekMedia {
  readonly readyState: number;
  readonly seeking: boolean;
  currentTime: number;
  pause(): void;
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}
export function circularGazeDelta(from: number, to: number) {
  const delta = to - from;
  return delta > 0.5 ? delta - 1 : delta < -0.5 ? delta + 1 : delta;
}
function wrap(value: number) {
  return value >= 0 && value < 1 ? value : ((value % 1) + 1) % 1;
}
export function interpolateGazeProgress(
  from: number,
  to: number,
  amount: number,
) {
  return wrap(
    from + circularGazeDelta(from, to) * Math.max(0, Math.min(1, amount)),
  );
}
export function createGazeSeekScheduler(options: {
  media: GazeSeekMedia;
  timeForProgress: (progress: number) => number;
  onFrame: () => void;
  onError?: (message: string) => void;
  maxSeekHz?: number;
  smoothingMs?: number;
  now?: () => number;
  requestFrame?: (callback: (at: number) => void) => number;
  cancelFrame?: (id: number) => void;
}) {
  const { media } = options;
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  const interval = 1000 / Math.max(1, Math.min(60, options.maxSeekHz ?? 24));
  const smoothingMs = Math.max(0, options.smoothingMs ?? 70);
  let active = false;
  let disposed = false;
  let failed = false;
  let latest: number | undefined;
  let position: number | undefined;
  let inFlight = false;
  let scheduled: number | undefined;
  let lastSeekAt = -Infinity;
  let lastStepAt = now();
  let lastDrawnTime: number | undefined;

  function schedule() {
    if (
      disposed ||
      failed ||
      !active ||
      latest === undefined ||
      inFlight ||
      media.seeking ||
      media.readyState < 2 ||
      scheduled !== undefined
    )
      return;
    scheduled = requestFrame(pump);
  }
  function draw() {
    if (
      !disposed &&
      !failed &&
      active &&
      !media.seeking &&
      media.readyState >= 2 &&
      lastDrawnTime !== media.currentTime
    ) {
      lastDrawnTime = media.currentTime;
      options.onFrame();
    }
  }
  function pump(at: number) {
    scheduled = undefined;
    if (
      disposed ||
      !active ||
      latest === undefined ||
      inFlight ||
      media.seeking ||
      media.readyState < 2
    )
      return;
    if (at - lastSeekAt < interval) {
      schedule();
      return;
    }
    const delta =
      position === undefined ? 0 : circularGazeDelta(position, latest);
    const amount =
      smoothingMs === 0
        ? 1
        : 1 - Math.exp(-Math.max(1, at - lastStepAt) / smoothingMs);
    const next =
      position === undefined || Math.abs(delta) < 0.0025
        ? latest
        : interpolateGazeProgress(position, latest, amount);
    const seconds = options.timeForProgress(next);
    if (!Number.isFinite(seconds) || seconds < 0) return;
    position = next;
    lastStepAt = at;
    if (
      Math.abs(media.currentTime - seconds) < (next === latest ? 0.001 : 0.018)
    ) {
      draw();
      if (Math.abs(circularGazeDelta(position, latest)) >= 0.0025) schedule();
      return;
    }
    inFlight = true;
    lastSeekAt = at;
    media.pause();
    try {
      media.currentTime = seconds;
    } catch (error) {
      inFlight = false;
      fail(error instanceof Error ? error.message : "注视视频跳转失败");
    }
  }
  function fail(message: string) {
    if (disposed || failed) return;
    failed = true;
    if (scheduled !== undefined) cancelFrame(scheduled);
    scheduled = undefined;
    if (active) options.onError?.(message);
  }
  const seeked = () => {
    if (disposed) return;
    inFlight = false;
    draw();
    schedule();
  };
  const ready = () => schedule();
  const error = () => fail("注视视频解码失败");
  media.addEventListener("seeked", seeked);
  media.addEventListener("loadeddata", ready);
  media.addEventListener("error", error);
  return {
    setTarget(progress: number) {
      if (disposed || !Number.isFinite(progress)) return;
      const target = wrap(progress);
      if (latest === target) {
        schedule();
        return;
      }
      latest = target;
      schedule();
    },
    setActive(value: boolean) {
      if (disposed || active === value) return;
      active = value;
      if (!value) {
        if (scheduled !== undefined) cancelFrame(scheduled);
        scheduled = undefined;
        media.pause();
      } else {
        lastDrawnTime = undefined;
        schedule();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (scheduled !== undefined) cancelFrame(scheduled);
      scheduled = undefined;
      media.removeEventListener("seeked", seeked);
      media.removeEventListener("loadeddata", ready);
      media.removeEventListener("error", error);
      media.pause();
    },
  };
}
