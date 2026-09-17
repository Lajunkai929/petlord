/** Left → upper-left → up → upper-right → right → lower-right → down → lower-left. */
export function nativeGazeDirectionIndex(progress: number) {
  return Number.isFinite(progress) ? Math.round((((progress % 1) + 1) % 1) * 8) % 8 : 0;
}

/** Discrete head poses: no blended pixels, boundary chatter, or multi-sector frame jumps. */
export function createNativeGazeMotion(options: {
  onDirection: (index: number | null) => void;
  now?: () => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (id: number) => void;
}) {
  const now = options.now ?? (() => performance.now());
  const requestFrame = options.requestFrame ?? requestAnimationFrame;
  const cancelFrame = options.cancelFrame ?? cancelAnimationFrame;
  // 45° sectors with an extra 6.75° of hysteresis; one neighboring pose per 75ms.
  const threshold = .65 / 8;
  const stepMs = 75;
  let shown: number | null = null, target = 0, turn = 1, lastStepAt = 0;
  let request: number | undefined, disposed = false;
  function cancel() { if (request !== undefined) cancelFrame(request); request = undefined; }
  function schedule() {
    if (!disposed && shown !== null && shown !== target && request === undefined) request = requestFrame(tick);
  }
  function tick(at: number) {
    request = undefined;
    if (disposed || shown === null || shown === target) return;
    if (at - lastStepAt >= stepMs) {
      let delta = ((target - shown + 12) % 8) - 4;
      if (Math.abs(delta) === 4) delta = 4 * turn;
      turn = Math.sign(delta);
      shown = (shown + turn + 8) % 8;
      lastStepAt = at;
      options.onDirection(shown);
    }
    schedule();
  }
  return {
    update(active: boolean, progress: number) {
      if (disposed) return;
      if (!active) {
        cancel();
        if (shown !== null) { shown = null; options.onDirection(null); }
        return;
      }
      if (shown === null) {
        shown = target = nativeGazeDirectionIndex(progress);
        lastStepAt = now(); turn = 1;
        options.onDirection(shown);
        return;
      }
      if (Number.isFinite(progress)) {
        const wrapped = ((progress % 1) + 1) % 1;
        const delta = ((wrapped - target / 8 + 1.5) % 1) - .5;
        if (Math.abs(delta) > threshold) target = nativeGazeDirectionIndex(wrapped);
      }
      if (shown === target) cancel();
      else schedule();
    },
    dispose() { disposed = true; cancel(); },
  };
}
