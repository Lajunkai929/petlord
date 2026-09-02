import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

export type TransitionEdgeData = {
  label: string;
  laneOffset: number;
  orientation: "horizontal" | "vertical";
  labelPosition: number;
  status: "draft" | "target-ready" | "generating" | "review" | "approved" | "failed";
};

function cubicPoint(start: number, controlStart: number, controlEnd: number, end: number, position: number) {
  const inverse = 1 - position;
  return inverse ** 3 * start + 3 * inverse ** 2 * position * controlStart + 3 * inverse * position ** 2 * controlEnd + position ** 3 * end;
}

export function TransitionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerEnd,
  style,
  selected,
  interactionWidth,
  data,
}: EdgeProps) {
  const route = data as TransitionEdgeData | undefined;
  const laneOffset = route?.laneOffset ?? 0;
  const horizontal = route?.orientation !== "vertical";
  const deltaX = targetX - sourceX;
  const deltaY = targetY - sourceY;
  const directionX = deltaX >= 0 ? 1 : -1;
  const directionY = deltaY >= 0 ? 1 : -1;
  const horizontalReach = Math.max(72, Math.abs(deltaX) * 0.42);
  const verticalReach = Math.max(72, Math.abs(deltaY) * 0.42);
  const controlStartX = horizontal ? sourceX + horizontalReach * directionX : sourceX + laneOffset;
  const controlStartY = horizontal ? sourceY + laneOffset : sourceY + verticalReach * directionY;
  const controlEndX = horizontal ? targetX - horizontalReach * directionX : targetX + laneOffset;
  const controlEndY = horizontal ? targetY + laneOffset : targetY - verticalReach * directionY;
  const path = `M ${sourceX} ${sourceY} C ${controlStartX} ${controlStartY}, ${controlEndX} ${controlEndY}, ${targetX} ${targetY}`;
  const labelPosition = route?.labelPosition ?? 0.5;
  const labelX = cubicPoint(sourceX, controlStartX, controlEndX, targetX, labelPosition);
  const labelY = cubicPoint(sourceY, controlStartY, controlEndY, targetY, labelPosition);
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={{ ...style, strokeWidth: selected ? 2.6 : style?.strokeWidth }}
      />
      <EdgeLabelRenderer>
        <span
          className={`transition-edge-label is-${route?.status ?? "draft"} ${selected ? "is-selected" : ""}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
        >
          {route?.label ?? "状态转换"}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
