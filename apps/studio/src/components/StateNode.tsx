import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { CheckCircle, CirclesThreePlus, Eye, Heartbeat } from "@phosphor-icons/react";

export type StateNodeData = {
  label: string;
  semanticKey?: string;
  variantCount: number;
  thumbnail?: string;
  hasAuthority: boolean;
  hasActualVariant: boolean;
  idleCount: number;
  pointerGazeTarget?: "eyes" | "head";
};

export type StateGraphNode = Node<StateNodeData, "state">;

export function StateNode({ data, selected }: NodeProps<StateGraphNode>) {
  return (
    <article className={`state-node ${selected ? "is-selected" : ""}`}>
      <Handle id="top" className="node-handle node-handle--top" type="source" position={Position.Top} />
      <Handle id="right" className="node-handle node-handle--right" type="source" position={Position.Right} />
      <Handle id="bottom" className="node-handle node-handle--bottom" type="source" position={Position.Bottom} />
      <Handle id="left" className="node-handle node-handle--left" type="source" position={Position.Left} />
      <div className="state-node__media checkerboard">
        {data.thumbnail ? (
          <img src={data.thumbnail} alt={`${data.label}状态预览`} draggable={false} />
        ) : (
          <CirclesThreePlus size={30} weight="thin" aria-hidden="true" />
        )}
        <span className={`state-node__status ${data.hasAuthority ? "is-ready" : "is-draft"}`}>
          {data.hasAuthority ? "权威参考" : "缺少参考"}
        </span>
      </div>
      <div className="state-node__body">
        <div>
          <strong>{data.label}</strong>
          <span>{data.semanticKey ?? "未映射语义"}</span>
        </div>
        <div className="state-node__stats">
          <span className={`state-node__count ${data.hasActualVariant ? "is-ready" : ""}`}>
            {data.hasActualVariant ? <CheckCircle size={12} weight="fill" /> : null}{data.variantCount} 个实际展示
          </span>
          {data.idleCount > 0 && <span className="state-node__idle"><Heartbeat size={11} weight="fill" />{data.idleCount} 条待机</span>}
          {data.pointerGazeTarget && <span className="state-node__gaze"><Eye size={11} weight="fill" />{data.pointerGazeTarget === "eyes" ? "眼睛注视" : "头部注视"}</span>}
        </div>
      </div>
    </article>
  );
}
