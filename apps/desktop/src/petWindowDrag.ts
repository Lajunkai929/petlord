export interface DragSurfaceBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NormalizedDragAnchor {
  x: number;
  y: number;
}

export function normalizedPointerAnchor(
  pointer: { x: number; y: number },
  surface: DragSurfaceBounds,
): NormalizedDragAnchor {
  return {
    x: Math.max(0, Math.min(1, (pointer.x - surface.left) / Math.max(1, surface.width))),
    y: Math.max(0, Math.min(1, (pointer.y - surface.top) / Math.max(1, surface.height))),
  };
}

export function petWindowPositionForAnchor(
  pointer: { x: number; y: number },
  surface: DragSurfaceBounds,
  anchor: NormalizedDragAnchor,
) {
  return {
    x: Math.round(pointer.x - surface.left - anchor.x * surface.width),
    y: Math.round(pointer.y - surface.top - anchor.y * surface.height),
  };
}
