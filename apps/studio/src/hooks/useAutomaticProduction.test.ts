import { describe, expect, it } from "vitest";
import { seedProject } from "../seed";
import { findNextAutomaticApproval } from "./useAutomaticProduction";

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
