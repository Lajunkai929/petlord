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
