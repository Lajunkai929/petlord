import { runtimeNativeAnimationSchema, type RuntimeNativeAnimation } from '@petlord/schema';
type Frame = RuntimeNativeAnimation['frames'][number];
export function nativeSpriteSample(frames: readonly Frame[], elapsedMs: number, cycles = 1) {
  const duration = frames.reduce((sum, frame) => sum + frame.durationMs, 0);
  if (!frames.length || !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(cycles) || cycles < 1) throw new Error('Invalid native playback timeline.');
  const count = Math.floor(cycles);
  const elapsed = Math.max(0, elapsedMs);
  const finished = elapsed >= duration * count;
  const cycleIndex = Math.min(count - 1, Math.floor(elapsed / duration));
  let frameIndex = frames.length - 1;
  if (!finished) {
    let boundary = 0;
    const local = elapsed % duration;
    for (let index = 0; index < frames.length; index++) {
      boundary += frames[index].durationMs;
      if (local < boundary) { frameIndex = index; break; }
    }
  }
  return {frameIndex, cycleIndex, finished, elapsedMs: Math.min(duration * count, elapsed)};
}
/** First tick starts playback after image readiness. Disposal prevents stale completion events. */
export function createNativeSpritePlayback(framesInput: readonly Frame[], cycles: number, callbacks: {onFrame: (frame: Frame) => void; onTime?: (elapsedMs: number) => void; onComplete?: () => void}) {
  const frames = runtimeNativeAnimationSchema.parse({frames: framesInput}).frames;
  let startedAt: number | undefined;
  let disposed = false;
  let finished = false;
  let previousFrame = -1;
  let previousCycle = -1;
  return {
    tick(at: number) {
      if (disposed || finished) return;
      startedAt ??= at;
      const sample = nativeSpriteSample(frames, at - startedAt, cycles);
      if (sample.frameIndex !== previousFrame || sample.cycleIndex !== previousCycle) {
        previousFrame = sample.frameIndex;
        previousCycle = sample.cycleIndex;
        callbacks.onFrame(frames[sample.frameIndex]);
      }
      finished = sample.finished;
      // Both callbacks can advance the state machine; never signal completion twice.
      if (finished && callbacks.onComplete) callbacks.onComplete();
      else callbacks.onTime?.(sample.elapsedMs);
    },
    dispose() { disposed = true; },
  };
}
