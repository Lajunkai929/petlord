import { Crosshair, HandGrabbing } from "@phosphor-icons/react";
import type { DragInteraction } from "@petlord/schema";
import { Switch } from "antd";
import { useDragAnchorEditor } from "../hooks/useDragAnchorEditor";

const defaultDragInteraction = (stateId: string): DragInteraction => ({
  enabled: true,
  targetLogicalStateId: stateId,
  anchor: { x: 0.46, y: 0.28 },
  alignmentDurationMs: 600,
  returnDurationMs: 500,
});

export function DragAnchorEditor({
  stateId,
  stateLabel,
  sourceImage,
  value,
  onChange,
}: {
  stateId: string;
  stateLabel: string;
  sourceImage?: string;
  value?: DragInteraction;
  onChange: (value?: DragInteraction) => void;
}) {
  const isTarget = Boolean(value?.enabled && value.targetLogicalStateId === stateId);
  const config = isTarget && value ? value : defaultDragInteraction(stateId);
  const anchorEditor = useDragAnchorEditor((anchor) => onChange({ ...config, anchor }));
  return (
    <section className={`drag-anchor-editor ${isTarget ? "is-enabled" : ""}`}>
      <header>
        <span><HandGrabbing size={18} weight="fill" /><strong>拖拽锚点</strong></span>
        <Switch
          size="small"
          checked={isTarget}
          aria-label={`将${stateLabel}设为拖拽姿态`}
          onChange={(enabled) => onChange(enabled ? defaultDragInteraction(stateId) : value?.targetLogicalStateId === stateId ? undefined : value)}
        />
      </header>
      {isTarget && (
        <div className="drag-anchor-editor__controls">
          <div
            className={`drag-anchor-editor__canvas checkerboard ${anchorEditor.dragging ? "is-dragging" : ""}`}
            onPointerDown={anchorEditor.begin}
            onPointerMove={anchorEditor.move}
            onPointerUp={anchorEditor.end}
            onPointerCancel={anchorEditor.end}
          >
            {sourceImage && <img src={sourceImage} alt={`${stateLabel}拖拽锚点配置`} draggable={false} />}
            <span className="drag-anchor-editor__anchor" style={{ left: `${config.anchor.x * 100}%`, top: `${config.anchor.y * 100}%` }}><Crosshair size={18} weight="bold" /></span>
          </div>
          <div className="drag-anchor-editor__timing">
            <label><span>对齐</span><select value={config.alignmentDurationMs} onChange={(event) => onChange({ ...config, alignmentDurationMs: Number(event.target.value) })}><option value={250}>0.25 秒</option><option value={400}>0.4 秒</option><option value={600}>0.6 秒</option><option value={800}>0.8 秒</option><option value={1000}>1 秒</option></select></label>
            <label><span>回位</span><select value={config.returnDurationMs} onChange={(event) => onChange({ ...config, returnDurationMs: Number(event.target.value) })}><option value={250}>0.25 秒</option><option value={500}>0.5 秒</option><option value={800}>0.8 秒</option><option value={1000}>1 秒</option><option value={1500}>1.5 秒</option></select></label>
          </div>
          <button className="drag-anchor-editor__pose-preset" type="button" onClick={() => onChange(config)}>应用侧视拎后颈规范</button>
        </div>
      )}
    </section>
  );
}
