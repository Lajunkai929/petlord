import { useEffect, useMemo, useRef } from "react";
import { MarkerType, useNodesState, type Connection, type Edge, type NodeMouseHandler, type ReactFlowInstance } from "@xyflow/react";
import type { CharacterProject } from "@petlord/schema";
import type { StudioSelection } from "../studioTypes";
import type { StateGraphNode } from "../components/StateNode";
import { sourceStateIdFromVariant } from "../projectTemplates";

const statusLabel = {
  draft: "等待权威参考",
  "target-ready": "参考就绪",
  generating: "视频生成中",
  review: "选择展示帧",
  approved: "已批准",
  failed: "生成失败",
} as const;

const eventLabel = {
  hover: "Hover",
  "pointer-leave": "移出",
  "left-click": "左键",
  "right-click": "右键",
  "double-click": "双击",
  inactivity: "无交互",
  "state-timeout": "进入后",
} as const;

function formatDuration(durationMs: number) {
  if (durationMs >= 60_000 && durationMs % 60_000 === 0) return `${durationMs / 60_000}m`;
  return `${durationMs / 1000}s`;
}

export function useGraphWorkspaceModel(
  project: CharacterProject,
  selection: StudioSelection,
  onSelect: (selection: StudioSelection) => void,
  onConnectStates: (sourceStateId: string, targetStateId: string) => void,
  layoutRevision: number,
) {
  const artifacts = useMemo(() => new Map(project.artifacts.map((artifact) => [artifact.id, artifact])), [project.artifacts]);

  const projectedNodes = useMemo<StateGraphNode[]>(() => project.logicalStates.map((state) => {
    const variants = project.variants.filter((variant) => variant.logicalStateId === state.id);
    const defaultVariant = variants.find((variant) => variant.id === state.defaultVariantId) ?? variants[0];
    const incomingDraft = project.transitions.find((transition) => transition.toLogicalStateId === state.id);
    const imageArtifactId = defaultVariant?.imageArtifactId ?? state.referenceArtifactId ?? incomingDraft?.targetDraftArtifactId;
    const idleCount = project.transitions.filter((transition) => {
      return transition.idleRule && sourceStateIdFromVariant(project, transition.fromVariantId) === state.id && transition.toLogicalStateId === state.id;
    }).length;
    return {
      id: state.id,
      type: "state",
      position: state.position,
      selected: selection?.kind === "state" && selection.id === state.id,
      data: {
        label: state.label,
        semanticKey: state.semanticKey,
        variantCount: variants.length,
        thumbnail: imageArtifactId ? artifacts.get(imageArtifactId)?.uri : undefined,
        hasAuthority: Boolean(state.referenceArtifactId),
        hasActualVariant: variants.length > 0,
        idleCount,
        pointerGazeTarget: state.pointerGaze?.enabled ? state.pointerGaze.motionTarget : undefined,
      },
    };
  }), [artifacts, project.logicalStates, project.transitions, project.variants, selection]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StateGraphNode>(projectedNodes);

  useEffect(() => {
    setNodes((current) => projectedNodes.map((projected) => {
      const live = current.find((node) => node.id === projected.id);
      return live?.dragging ? { ...projected, position: live.position, dragging: true } : projected;
    }));
  }, [projectedNodes, setNodes]);

  const edges = useMemo<Edge[]>(() => project.transitions.map((transition) => {
    const sourceStateId = sourceStateIdFromVariant(project, transition.fromVariantId) ?? "";
    const targetStateId = transition.toLogicalStateId;
    const isSelfTransition = sourceStateId === targetStateId;
    const sourceState = project.logicalStates.find((state) => state.id === sourceStateId);
    const targetState = project.logicalStates.find((state) => state.id === targetStateId);
    const selfSiblings = project.transitions.filter((candidate) => {
      const candidateSource = sourceStateIdFromVariant(project, candidate.fromVariantId);
      return candidateSource === sourceStateId && candidate.toLogicalStateId === targetStateId;
    });
    const idleLoopIndex = selfSiblings.findIndex((candidate) => candidate.id === transition.id);
    const trigger = transition.triggers.find((candidate) => candidate.enabled);
    const triggerText = transition.idleRule
      ? `待机 ${transition.idleRule.weight ?? 1} 权重`
      : trigger
      ? `${eventLabel[trigger.event]}${trigger.event === "hover"
        ? ` ${formatDuration(trigger.hoverDurationMs ?? 0)}`
        : trigger.event === "inactivity" || trigger.event === "state-timeout"
          ? ` ${formatDuration(trigger.timerDurationMs ?? 60_000)}`
          : ""}`
      : "未配置触发";
    if (isSelfTransition) return {
      id: transition.id,
      source: sourceStateId,
      target: targetStateId,
      sourceHandle: "right",
      targetHandle: "left",
      type: "idleLoop",
      data: { loopIndex: Math.max(0, idleLoopIndex), label: triggerText },
      selected: selection?.kind === "transition" && selection.id === transition.id,
      animated: transition.status === "generating",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      interactionWidth: 28,
      style: { stroke: transition.status === "approved" ? "var(--accent)" : "var(--edge)", strokeWidth: 1.6 },
    };
    const deltaX = (targetState?.position.x ?? 0) - (sourceState?.position.x ?? 0);
    const deltaY = (targetState?.position.y ?? 0) - (sourceState?.position.y ?? 0);
    const orientation = Math.abs(deltaX) >= Math.abs(deltaY) ? "horizontal" as const : "vertical" as const;
    const sourceHandle = orientation === "horizontal" ? deltaX >= 0 ? "right" : "left" : deltaY >= 0 ? "bottom" : "top";
    const targetHandle = orientation === "horizontal" ? deltaX >= 0 ? "left" : "right" : deltaY >= 0 ? "top" : "bottom";
    const pairTransitions = project.transitions.filter((candidate) => {
      if (candidate.idleRule) return false;
      const candidateSource = sourceStateIdFromVariant(project, candidate.fromVariantId);
      return [candidateSource, candidate.toLogicalStateId].sort().join("::") === [sourceStateId, targetStateId].sort().join("::");
    }).sort((left, right) => left.id.localeCompare(right.id));
    const pairIndex = pairTransitions.findIndex((candidate) => candidate.id === transition.id);
    const laneOffset = (pairIndex - (pairTransitions.length - 1) / 2) * 80;
    const hasReciprocal = pairTransitions.some((candidate) => {
      const candidateSource = sourceStateIdFromVariant(project, candidate.fromVariantId);
      return candidateSource === targetStateId && candidate.toLogicalStateId === sourceStateId;
    });
    const labelPosition = hasReciprocal
      ? 0.34
      : pairTransitions.length > 1
        ? 0.34 + pairIndex * 0.32 / (pairTransitions.length - 1)
        : 0.5;
    return {
      id: transition.id,
      source: sourceStateId,
      target: targetStateId,
      sourceHandle,
      targetHandle,
      type: "transition",
      data: {
        label: `${triggerText} · ${statusLabel[transition.status]}`,
        laneOffset,
        orientation,
        labelPosition,
        status: transition.status,
      },
      selected: selection?.kind === "transition" && selection.id === transition.id,
      animated: transition.status === "generating",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      interactionWidth: 28,
      style: { stroke: transition.status === "approved" ? "var(--accent)" : "var(--edge)", strokeWidth: 1.6 },
    };
  }), [project.logicalStates, project.transitions, project.variants, selection]);

  const handleNodeClick: NodeMouseHandler<StateGraphNode> = (_, node) => onSelect({ kind: "state", id: node.id });
  const handleConnect = (connection: Connection) => {
    if (connection.source && connection.target) {
      onConnectStates(connection.source, connection.target);
    }
  };

  const flowRef = useRef<ReactFlowInstance<StateGraphNode, Edge> | null>(null);
  const handleInit = (instance: ReactFlowInstance<StateGraphNode, Edge>) => {
    flowRef.current = instance;
  };

  useEffect(() => {
    if (layoutRevision <= 0 || !flowRef.current) return;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        void flowRef.current?.fitView({ padding: 0.24, duration: 420, maxZoom: 1.05 });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [layoutRevision]);

  return { nodes, edges, onNodesChange, handleNodeClick, handleConnect, handleInit };
}
