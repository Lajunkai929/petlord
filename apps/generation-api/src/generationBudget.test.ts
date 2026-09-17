import { expect, it } from "vitest";
import type { CharacterProject } from "@petlord/schema";
import type { PersistentGenerationJob } from "@petlord/generation";
import { assertGenerationBudget } from "./generationBudget";
const project = { id: "fixture", generationBudgetCny: 50 } as CharacterProject;
it.each([NaN, Infinity, -Infinity, -1])("rejects invalid additional generation estimate %s", value => {
  expect(() => assertGenerationBudget(project, [], value)).toThrow();
});
it("rejects invalid cumulative recorded cost and retains zero-cost retry polling", () => {
  const job = { trigger: { projectId: "fixture" }, cost: { estimatedMaxCny: NaN } } as PersistentGenerationJob;
  expect(() => assertGenerationBudget(project, [job], 1)).toThrow();
  expect(() => assertGenerationBudget(project, [], 0)).not.toThrow();
});
