import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { NativePixelDocument } from "@petlord/schema";
import { renderPixelFrame } from "@petlord/pixel-art";
import { canvasPixel } from "./pixelEditing";
export function NativePixelCanvas({
  document,
  frameId,
  zoom = 8,
  grid = false,
  editable = false,
  onPaint,
  onStrokeEnd,
  label = "原生像素画布",
}: {
  document: NativePixelDocument;
  frameId: string;
  zoom?: number;
  grid?: boolean;
  editable?: boolean;
  onPaint?: (x: number, y: number) => void;
  onStrokeEnd?: () => void;
  label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const frame = renderPixelFrame(document, frameId);
    const data = context.createImageData(frame.width, frame.height);
    data.data.set(frame.rgba);
    context.imageSmoothingEnabled = false;
    context.putImageData(data, 0, 0);
  }, [document, frameId]);
  function point(event: PointerEvent<HTMLCanvasElement>) {
    const next = canvasPixel(
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      document.width,
      document.height,
    );
    if (next) {
      setCursor(next);
      if (drawing.current && editable) onPaint?.(next.x, next.y);
    }
  }
  return (
    <div
      className="pixel-canvas-wrap checkerboard"
      style={{ width: document.width * zoom, height: document.height * zoom }}
    >
      <canvas
        ref={canvasRef}
        width={document.width}
        height={document.height}
        style={{
          width: "100%",
          height: "100%",
          imageRendering: "pixelated",
          touchAction: "none",
        }}
        role="img"
        aria-label={label}
        tabIndex={editable ? 0 : undefined}
        onPointerDown={(event) => {
          if (!editable || event.button !== 0) return;
          drawing.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          point(event);
        }}
        onPointerMove={point}
        onPointerUp={() => {
          drawing.current = false;
          onStrokeEnd?.();
        }}
        onPointerCancel={() => {
          drawing.current = false;
          onStrokeEnd?.();
        }}
        onKeyDown={(event) => {
          if (!editable) return;
          const offsets: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          if (offsets[event.key]) {
            event.preventDefault();
            const [dx, dy] = offsets[event.key];
            setCursor((p) => ({
              x: Math.max(0, Math.min(document.width - 1, p.x + dx)),
              y: Math.max(0, Math.min(document.height - 1, p.y + dy)),
            }));
          } else if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            onPaint?.(cursor.x, cursor.y);
            onStrokeEnd?.();
          }
        }}
      />
      {grid && zoom >= 4 && (
        <div
          className="pixel-grid-overlay"
          aria-hidden="true"
          style={{ backgroundSize: `${zoom}px ${zoom}px` }}
        />
      )}
      {editable && (
        <span
          className="pixel-cursor"
          aria-hidden="true"
          style={{
            left: cursor.x * zoom,
            top: cursor.y * zoom,
            width: zoom,
            height: zoom,
          }}
        />
      )}
    </div>
  );
}
