import { expect, it } from "vitest";
import type { PersistentJobCost } from "@petlord/generation";
import { styleExperimentCostLabel } from "./StyleLibraryWorkspace";
const estimate: PersistentJobCost = { status: "estimated", source: "estimate", estimatedMinCny: 0.25, estimatedMaxCny: 0.5, basis: "用户预估" };
it("labels an unsettled style experiment as an estimate", () => {
  expect(styleExperimentCostLabel(estimate)).toBe("预估 ¥0.50");
});
it("labels only an actual amount as spend, including a zero actual amount", () => {
  expect(styleExperimentCostLabel({ ...estimate, actualCny: 0.4 })).toBe("实耗 ¥0.40");
  expect(styleExperimentCostLabel({ ...estimate, actualCny: 0 })).toBe("实耗 ¥0.00");
});
it("keeps a style experiment with no price visibly unknown", () => {
  expect(styleExperimentCostLabel()).toBe("费用未知");
});
