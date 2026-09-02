import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  type Edge,
} from "@xyflow/react";
import type { CharacterProject } from "@petlord/schema";
import { StateNode, type StateGraphNode } from "./StateNode";
import { IdleLoopEdge } from "./IdleLoopEdge";
import { TransitionEdge } from "./TransitionEdge";
import { useGraphWorkspaceModel } from "../hooks/useGraphWorkspaceModel";

const nodeTypes = { state: StateNode };
const edgeTypes = { idleLoop: IdleLoopEdge, transition: TransitionEdge };

type Selection = { kind: "state" | "transition"; id: string } | null;

interface GraphWorkspaceProps {
  project: CharacterProject;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onMoveState: (id: string, position: { x: number; y: number }) => void;
  onConnectStates: (sourceStateId: string, targetStateId: string) => void;
  layoutRevision: number;
}

export function GraphWorkspace({ project, selection, onSelect, onMoveState, onConnectStates, layoutRevision }: GraphWorkspaceProps) {
  const graph = useGraphWorkspaceModel(project, selection, onSelect, onConnectStates, layoutRevision);

  return (
    <section className="graph-canvas" aria-label="宠物状态图">
      <ReactFlow<StateGraphNode, Edge>
        nodes={graph.nodes}
        edges={graph.edges}
        connectionMode={ConnectionMode.Loose}
        onNodesChange={graph.onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.28 }}
        minZoom={0.45}
        maxZoom={1.45}
        onNodeClick={graph.handleNodeClick}
        onEdgeClick={(_, edge) => onSelect({ kind: "transition", id: edge.id })}
        onPaneClick={() => onSelect(null)}
        onNodeDragStop={(_, node) => onMoveState(node.id, node.position)}
        onConnect={graph.handleConnect}
        onInit={graph.handleInit}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--grid-dot)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </section>
  );
}
