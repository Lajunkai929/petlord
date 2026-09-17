import { useEffect, useRef } from 'react';
import type { RuntimeMediaCanvasProps } from './RuntimeMediaCanvas';
import { createNativeSpritePlayback } from './nativeSpritePlayback';
import { createNativeGazeMotion } from './nativeGazeMotion';
export { nativeGazeDirectionIndex } from './nativeGazeMotion';

/** Draws original image pixels 1:1 into a native-sized backing canvas. CSS alone scales display. */
export function NativeSpriteCanvas({currentState, activeTransition, phase, playbackRunId = 0, playbackCycleCount = 1, className, onVideoTimeUpdate, onVideoEnded, onPlaybackError, pointerGaze, pointerGazeActive = false, pointerGazeProgress = .5}: RuntimeMediaCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const callbacks = useRef({onVideoTimeUpdate, onVideoEnded, onPlaybackError});
  callbacks.current = {onVideoTimeUpdate, onVideoEnded, onPlaybackError};
  const width = currentState?.nativePixel?.width ?? 1;
  const height = currentState?.nativePixel?.height ?? 1;
  const frames = activeTransition?.nativeAnimation?.frames;
  const gazeUris = pointerGaze?.nativeImageUris;
  const gaze = useRef({active:false, index:0});
  const gazeInput = useRef({active:false,progress:0});
  gazeInput.current = {active:Boolean(pointerGaze?.enabled && pointerGazeActive && !activeTransition && phase === 'idle'),progress:pointerGazeProgress};
  const gazeMotion = useRef<ReturnType<typeof createNativeGazeMotion> | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let request = 0;
    let completed = false;
    let player: ReturnType<typeof createNativeSpritePlayback> | undefined;
    const images = new Map<string, HTMLImageElement>();
    const pending = new Map<string, Promise<void>>();
    const source = currentState?.imageUri;
    const context = canvas.current?.getContext('2d');
    context?.clearRect(0, 0, width, height);
    const draw = (uri: string) => {
      const context = canvas.current?.getContext('2d');
      const image = images.get(uri);
      if (!context || !image || cancelled) return;
      context.imageSmoothingEnabled = false;
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0);
    };
    const drawIdle = () => {
      if (activeTransition || phase !== 'idle') return;
      const direction = gaze.current.active ? gazeUris?.[gaze.current.index] : undefined;
      if (direction && images.has(direction)) draw(direction);
      else if (source) draw(source);
    };
    gaze.current = {active:false,index:0};
    const motion = createNativeGazeMotion({onDirection:index=>{gaze.current={active:index!==null,index:index??0};drawIdle();}});
    gazeMotion.current=motion;
    motion.update(gazeInput.current.active,gazeInput.current.progress);
    const load = (uri: string) => {
      const existing = pending.get(uri);
      if (existing) return existing;
      const promise = new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => {
          if (cancelled) { resolve(); return; }
          if (image.naturalWidth !== width || image.naturalHeight !== height) { reject(new Error(`Native image dimensions do not match ${width}×${height}: ${uri}`)); return; }
          images.set(uri, image);
          if (phase === 'idle') drawIdle();
          else if (uri === source && !player) draw(uri);
          resolve();
        };
        image.onerror = () => reject(new Error(`Cannot load native frame: ${uri}`));
        image.src = uri;
      });
      pending.set(uri,promise);
      return promise;
    };
    const report = (error: unknown) => {
      if (!cancelled) callbacks.current.onPlaybackError?.(error instanceof Error ? error.message : String(error));
    };
    // Gaze is exactly eight PNGs. Its preload cannot hold up or fail an action's playback.
    if (!activeTransition && phase === 'idle') for (const uri of new Set(gazeUris ?? [])) void load(uri).catch(report);
    const uris = [...new Set([...(source ? [source] : []), ...(frames?.map(frame => frame.imageUri) ?? [])])];
    void Promise.all(uris.map(load)).then(() => {
      if (cancelled) return;
      if (!frames || phase !== 'video') { drawIdle(); return; }
      player = createNativeSpritePlayback(frames, playbackCycleCount, {
        onFrame: frame => draw(frame.imageUri),
        onTime: elapsed => callbacks.current.onVideoTimeUpdate?.(elapsed),
        onComplete: () => {
          completed = true;
          if (callbacks.current.onVideoEnded) callbacks.current.onVideoEnded();
          else callbacks.current.onVideoTimeUpdate?.(frames.reduce((sum, frame) => sum + frame.durationMs, 0) * playbackCycleCount);
        },
      });
      const tick = (at: number) => {
        if (cancelled) return;
        player?.tick(at);
        if (!completed) request = requestAnimationFrame(tick);
      };
      request = requestAnimationFrame(tick);
    }).catch(report);
    return () => { cancelled = true; player?.dispose(); cancelAnimationFrame(request); images.clear(); motion.dispose(); gazeMotion.current=undefined; };
  }, [currentState?.imageUri, frames, width, height, phase, playbackRunId, playbackCycleCount, gazeUris, activeTransition]);
  useEffect(() => { gazeMotion.current?.update(gazeInput.current.active,gazeInput.current.progress); }, [pointerGazeActive, pointerGazeProgress, pointerGaze?.enabled]);
  return <canvas ref={canvas} width={width} height={height} className={className} data-native-pixel="true" role="img" aria-label={pointerGazeActive && pointerGaze?.nativeImageUris && !activeTransition ? `${currentState?.label ?? '桌面宠物'} · 正在注视鼠标` : currentState?.label ?? '桌面宠物'} style={{imageRendering:'pixelated',objectFit:'contain'}} />;
}
