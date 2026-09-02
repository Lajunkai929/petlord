import { useState, type PointerEvent } from "react";

function normalizedAnchor(event: PointerEvent<HTMLElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width))),
    y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / Math.max(1, bounds.height))),
  };
}

export function useDragAnchorEditor(onChange: (anchor: { x: number; y: number }) => void) {
  const [dragging, setDragging] = useState(false);
  function begin(event: PointerEvent<HTMLElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    onChange(normalizedAnchor(event));
  }
  function move(event: PointerEvent<HTMLElement>) {
    if (dragging) onChange(normalizedAnchor(event));
  }
  function end(event: PointerEvent<HTMLElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }
  return { dragging, begin, move, end };
}
