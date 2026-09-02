import { describe, expect, it } from "vitest";
import type { CharacterProject } from "@petlord/schema";
import { seedProject } from "./seed";
import { buildOrderDeliveryItems, generationBudgetAllows, summarizeGenerationBudget, summarizeOrderEconomics } from "./orderOperations";

function projectWithCosts(): CharacterProject {
  const project = structuredClone(seedProject);
  project.order.quotedPriceCny = 699;
  project.order.depositCny = 300;
  project.order.finalPaymentCny = 399;
  project.order.manualCosts = [{
    id: "manual-1",
    label: "客户交付 U 盘",
    category: "delivery",
    amountCny: 18,
    note: "",
    createdAt: "2026-08-30T10:00:00.000Z",
  }];
  project.jobs = [{
    id: "image-job",
    kind: "state-draft",
    status: "succeeded",
    progress: 100,
    prompt: "趴着参考图",
    provider: "volcengine-ark",
    model: "doubao-seedream-5-0-260128",
    createdAt: "2026-08-30T09:00:00.000Z",
    outputArtifactIds: ["one", "two", "three"],
    cost: { status: "settled", source: "unit-output", estimatedMinCny: 0.66, estimatedMaxCny: 0.66, actualCny: 0.66, basis: "3 张" },
  }, {
    id: "video-job",
    kind: "transition",
    status: "running",
    progress: 66,
    prompt: "坐着到趴着",
    provider: "volcengine-ark",
    model: "doubao-seedance-2-0-mini-260615",
    createdAt: "2026-08-30T11:00:00.000Z",
    outputArtifactIds: [],
    cost: { status: "estimated", source: "estimate", estimatedMinCny: 0.89, estimatedMaxCny: 3.35, basis: "智能时长" },
  }];
  return project;
}

describe("order economics and delivery", () => {
  it("separates settled costs from pending estimates and calculates projected margin", () => {
    const economics = summarizeOrderEconomics(projectWithCosts());
    expect(economics.receivedCny).toBe(699);
    expect(economics.actualCostCny).toBeCloseTo(18.66, 2);
    expect(economics.projectedCostCny).toBeCloseTo(22.01, 2);
    expect(economics.projectedProfitCny).toBeCloseTo(676.99, 2);
    expect(economics.projectedMarginRatio).toBeGreaterThan(0.96);
  });

  it("keeps manual approval and delivery gates distinct from automatic production checks", () => {
    const project = projectWithCosts();
    const items = buildOrderDeliveryItems(project);
    expect(items.find((item) => item.id === "payment")?.complete).toBe(true);
    expect(items.find((item) => item.id === "customer")?.manualKey).toBe("customerApproved");
    expect(items.find((item) => item.id === "customer")?.complete).toBe(false);
  });

  it("treats settled, pending, and failed provider estimates as committed hard-budget spend", () => {
    const project = projectWithCosts();
    project.generationBudgetCny = 5;
    project.jobs.push({
      id: "failed-video",
      kind: "transition",
      status: "failed",
      progress: 95,
      prompt: "可能已产生供应商费用",
      provider: "volcengine-ark",
      model: "doubao-seedance-2-0-mini-260615",
      createdAt: "2026-08-30T12:00:00.000Z",
      outputArtifactIds: [],
      cost: { status: "estimated", source: "estimate", estimatedMinCny: 0.89, estimatedMaxCny: 0.99, basis: "失败任务保守占用" },
    });
    expect(summarizeGenerationBudget(project)).toMatchObject({ limitCny: 5, committedCny: 5 });
    expect(generationBudgetAllows(project, 0.01).allowed).toBe(false);
    expect(generationBudgetAllows(project, 0).allowed).toBe(true);
  });
});
