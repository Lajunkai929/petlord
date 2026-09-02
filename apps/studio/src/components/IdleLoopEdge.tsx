import { BaseEdge, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

type IdleLoopData = {
  loopIndex?: number;
  label?: string;
};

export function IdleLoopEdge({
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
  const loop = (data as IdleLoopData | undefined)?.loopIndex ?? 0;
  const lift = 150 + loop * 52;
  const spread = 66 + loop * 16;
  const path = `M ${sourceX} ${sourceY} C ${sourceX + spread} ${sourceY - lift}, ${targetX - spread} ${targetY - lift}, ${targetX} ${targetY}`;
  const labelX = (sourceX + targetX) / 2;
  const labelY = Math.min(sourceY, targetY) - lift * 0.74;
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} interactionWidth={interactionWidth} style={{ ...style, strokeWidth: selected ? 2.4 : style?.strokeWidth }} />
      <EdgeLabelRenderer>
        <span className={`idle-loop-label ${selected ? "is-selected" : ""}`} style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}>
          {(data as IdleLoopData | undefined)?.label ?? "待机动画"}
        </span>
      </EdgeLabelRenderer>
    </>
  );
}
