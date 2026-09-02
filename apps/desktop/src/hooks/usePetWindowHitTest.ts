import { useCallback, useEffect, useRef, type RefObject } from "react";

export function pixelIsOpaque(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
  const bounds = canvas.getBoundingClientRect();
  if (clientX < bounds.left || clientX > bounds.right || clientY < bounds.top || clientY > bounds.bottom) return false;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width === 0 || canvas.height === 0 || bounds.width === 0 || bounds.height === 0) return true;
  const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((clientX - bounds.left) / bounds.width * canvas.width)));
  const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((clientY - bounds.top) / bounds.height * canvas.height)));
  try {
    return context.getImageData(x, y, 1, 1).data[3] > 18;
  } catch {
    return true;
  }
}

export function usePetWindowHitTest(surfaceRef: RefObject<HTMLDivElement | null>, forceInteractive: boolean) {
  const ignoredRef = useRef<boolean | undefined>(undefined);
  const lastSampleAtRef = useRef(0);

  const apply = useCallback((ignore: boolean) => {
    if (!window.petLordDesktop || ignoredRef.current === ignore) return;
    ignoredRef.current = ignore;
    void window.petLordDesktop.setIgnoreMouse(ignore);
  }, []);

  useEffect(() => {
    if (forceInteractive) apply(false);
  }, [apply, forceInteractive]);

  const sample = useCallback((clientX: number, clientY: number) => {
    if (forceInteractive) return apply(false);
    const now = performance.now();
    if (now - lastSampleAtRef.current < 28) return;
    lastSampleAtRef.current = now;
    const surface = surfaceRef.current;
    const canvas = surface?.querySelector("canvas");
    apply(!surface || !canvas || !pixelIsOpaque(canvas, clientX, clientY));
  }, [apply, forceInteractive, surfaceRef]);

  return {
    sample,
    leave: () => { if (!forceInteractive) apply(true); },
    interactive: () => apply(false),
  };
}
