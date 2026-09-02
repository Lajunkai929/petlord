import type { CharacterProject } from "@petlord/schema";
import { sourceStateIdFromVariant } from "./projectTemplates";

export const stateGraphLayoutMetrics = {
  originX: 96,
  originY: 96,
  columnGap: 420,
  rowGap: 320,
} as const;

type GraphPosition = { x: number; y: number };

function sourceLogicalStateId(project: CharacterProject, fromVariantId: string) {
  return sourceStateIdFromVariant(project, fromVariantId);
}

function initialLogicalStateId(project: CharacterProject) {
  return project.variants.find((variant) => variant.id === project.initialVariantId)?.logicalStateId;
}

function stateOrder(project: CharacterProject, leftId: string, rightId: string) {
  const left = project.logicalStates.find((state) => state.id === leftId);
  const right = project.logicalStates.find((state) => state.id === rightId);
  return (left?.position.y ?? 0) - (right?.position.y ?? 0) ||
    (left?.position.x ?? 0) - (right?.position.x ?? 0) ||
    (left?.label ?? leftId).localeCompare(right?.label ?? rightId, "zh-CN") ||
    leftId.localeCompare(rightId);
}

export function calculateStateGraphLayout(project: CharacterProject): Record<string, GraphPosition> {
  if (project.logicalStates.length === 0) return {};
  const stateIds = new Set(project.logicalStates.map((state) => state.id));
  const adjacency = new Map([...stateIds].map((id) => [id, new Set<string>()]));
  for (const transition of project.transitions) {
    const sourceId = sourceLogicalStateId(project, transition.fromVariantId);
    const targetId = transition.toLogicalStateId;
    if (!sourceId || sourceId === targetId || !stateIds.has(targetId)) continue;
    adjacency.get(sourceId)?.add(targetId);
    adjacency.get(targetId)?.add(sourceId);
  }

  const levels = new Map<string, number>();
  const remaining = new Set(stateIds);
  let componentOffset = 0;
  const preferredRoot = initialLogicalStateId(project);
  while (remaining.size > 0) {
    const root = preferredRoot && remaining.has(preferredRoot)
      ? preferredRoot
      : [...remaining].sort((left, right) =>
          (adjacency.get(right)?.size ?? 0) - (adjacency.get(left)?.size ?? 0) || stateOrder(project, left, right))[0];
    const queue: Array<{ id: string; distance: number }> = [{ id: root, distance: 0 }];
    let maxDistance = 0;
    remaining.delete(root);
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      levels.set(current.id, componentOffset + current.distance);
      maxDistance = Math.max(maxDistance, current.distance);
      const neighbors = [...(adjacency.get(current.id) ?? [])]
        .filter((id) => remaining.has(id))
        .sort((left, right) => stateOrder(project, left, right));
      for (const id of neighbors) {
        remaining.delete(id);
        queue.push({ id, distance: current.distance + 1 });
      }
    }
    componentOffset += maxDistance + 2;
  }

  const columns = new Map<number, string[]>();
  for (const state of project.logicalStates) {
    const level = levels.get(state.id) ?? 0;
    columns.set(level, [...(columns.get(level) ?? []), state.id]);
  }
  for (const ids of columns.values()) ids.sort((left, right) => stateOrder(project, left, right));
  const maxRows = Math.max(...[...columns.values()].map((ids) => ids.length));
  const graphHeight = (maxRows - 1) * stateGraphLayoutMetrics.rowGap;
  const positions: Record<string, GraphPosition> = {};
  for (const [level, ids] of columns) {
    const columnHeight = (ids.length - 1) * stateGraphLayoutMetrics.rowGap;
    const startY = stateGraphLayoutMetrics.originY + (graphHeight - columnHeight) / 2;
    ids.forEach((id, index) => {
      positions[id] = {
        x: stateGraphLayoutMetrics.originX + level * stateGraphLayoutMetrics.columnGap,
        y: startY + index * stateGraphLayoutMetrics.rowGap,
      };
    });
  }
  return positions;
}
