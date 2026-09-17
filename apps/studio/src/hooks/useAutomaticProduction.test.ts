import { describe, expect, it } from "vitest";
import { seedProject } from "../seed";
import { findNextAutomaticApproval, estimateAutomaticProductionCost } from "./useAutomaticProduction";

describe("automatic production completion", () => {
  it("keeps a generated review transition in the run until it is enabled for preview", () => {
    const project = structuredClone(seedProject);
    project.transitions = project.transitions.map((transition, index) => index === 0
      ? { ...transition, status: "review", videoArtifactId: "generated-video" }
      : { ...transition, status: "approved" });

    expect(findNextAutomaticApproval(project)?.id).toBe(project.transitions[0].id);
  });

  it("does not treat a review transition without generated media as ready to enable", () => {
    const project = structuredClone(seedProject);
    project.transitions = project.transitions.map((transition, index) => index === 0
      ? { ...transition, status: "review", videoArtifactId: undefined }
      : { ...transition, status: "approved" });

    expect(findNextAutomaticApproval(project)).toBeUndefined();
  });
});

it("blocks unpriced generation while permitting a fully generated project to finish local approvals", () => {
  const project = structuredClone(seedProject);
  project.generationSettings.videoModel = "private-video";
  expect(estimateAutomaticProductionCost(project).unknownPrice).toBe(true);
  const snapshot = { serviceAvailable: true as const, catalog: [], defaults: { video: "video" }, providers: [{ id: "video", type: "volcengine-ark" as const, capability: "video" as const, name: "Video", baseUrl: "https://example.com/v1", enabled: true, credentialHint: "saved", createdAt: "now", updatedAt: "now", models: [{ id: "private-video", label: "Private", description: "", estimatedUnitCostCny: 0.2 }] }] };
  expect(estimateAutomaticProductionCost(project, snapshot)).toMatchObject({ unknownPrice: false });
  expect(estimateAutomaticProductionCost(project, snapshot).maximumCny).toBeGreaterThan(0);
  project.logicalStates = project.logicalStates.map(state => ({ ...state, referenceArtifactId: "ready" }));
  project.transitions = project.transitions.map(transition => ({ ...transition, videoArtifactId: "ready", status: "review" }));
  expect(estimateAutomaticProductionCost(project)).toEqual({ minimumCny: 0, maximumCny: 0, unknownPrice: false });
});
