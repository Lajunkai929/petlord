import { describe, expect, it } from "vitest";
import { lotteryHiResProject } from "./lotteryHiResProject";
import { calculateStateGraphLayout, stateGraphLayoutMetrics } from "./graphLayout";

describe("state graph automatic layout", () => {
  it("centers the initial hub and gives every connected edge an adjacent routing column", () => {
    const positions = calculateStateGraphLayout(lotteryHiResProject);
    const initialVariant = lotteryHiResProject.variants.find((variant) => variant.id === lotteryHiResProject.initialVariantId)!;
    const initial = positions[initialVariant.logicalStateId];
    expect(initial.x).toBe(stateGraphLayoutMetrics.originX);
    expect(Object.keys(positions)).toHaveLength(lotteryHiResProject.logicalStates.length);

    for (const transition of lotteryHiResProject.transitions) {
      const source = lotteryHiResProject.variants.find((variant) => variant.id === transition.fromVariantId)!;
      const sourcePosition = positions[source.logicalStateId];
      const targetPosition = positions[transition.toLogicalStateId];
      expect(Math.abs(targetPosition.x - sourcePosition.x)).toBeLessThanOrEqual(stateGraphLayoutMetrics.columnGap);
    }
  });

  it("keeps nodes in the same column far enough apart for cards and idle-loop labels", () => {
    const positions = calculateStateGraphLayout(lotteryHiResProject);
    const byColumn = Object.entries(positions).reduce<Record<number, number[]>>((columns, [, position]) => {
      columns[position.x] = [...(columns[position.x] ?? []), position.y];
      return columns;
    }, {});
    for (const rows of Object.values(byColumn)) {
      rows.sort((left, right) => left - right);
      for (let index = 1; index < rows.length; index += 1) {
        expect(rows[index] - rows[index - 1]).toBeGreaterThanOrEqual(stateGraphLayoutMetrics.rowGap);
      }
    }
  });

  it("is stable when the project state array is reordered", () => {
    const reversed = { ...lotteryHiResProject, logicalStates: [...lotteryHiResProject.logicalStates].reverse() };
    expect(calculateStateGraphLayout(reversed)).toEqual(calculateStateGraphLayout(lotteryHiResProject));
  });
});

