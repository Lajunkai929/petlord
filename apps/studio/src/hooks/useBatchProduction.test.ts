import { describe, expect, it } from "vitest";
import { seedProject } from "../seed";
import { createBlankProject } from "../projectTemplate";
import { buildBatchProductionItems } from "./useBatchProduction";

const order = {
  customerName: "小林",
  contact: "闲鱼",
  characterName: "奶盖",
  quotedPriceCny: 699,
  depositCny: 300,
  revisionLimit: 2,
  notes: "",
};

describe("batch production planning", () => {
  it("plans only missing state references after real identity material exists", () => {
    const project = createBlankProject(order);
    project.artifacts.push({ id: "identity", kind: "identity-reference", uri: "data:image/png;base64,AA==", mimeType: "image/png", createdAt: "2026-08-31T00:00:00.000Z", provenance: "user-upload" });
    project.referenceArtifactIds = ["identity"];
    const items = buildBatchProductionItems(project);
    expect(items).toHaveLength(5);
    expect(items.every((item) => item.action === "generate-state")).toBe(true);
    expect(items.reduce((sum, item) => sum + (item.cost?.maximumCny ?? 0), 0)).toBeCloseTo(3.3, 2);
  });

  it("moves a transition through video generation, transparency, and approval as separate quality gates", () => {
    const project = structuredClone(seedProject);
    expect(buildBatchProductionItems(project).filter((item) => item.action === "generate-transition")).toHaveLength(5);
    const transition = project.transitions[0]!;
    transition.videoArtifactId = "normal-video";
    transition.extractedTailArtifactId = "tail";
    transition.status = "review";
    project.artifacts.push(
      { id: "normal-video", kind: "transition-video", uri: "video.mp4", mimeType: "video/mp4", createdAt: "2026-08-31T00:00:00.000Z", hasAlpha: false },
      { id: "tail", kind: "state-actual", uri: "tail.png", mimeType: "image/png", createdAt: "2026-08-31T00:00:00.000Z" },
    );
    expect(buildBatchProductionItems(project).find((item) => item.entityId === transition.id)?.action).toBe("transparentize");
    project.artifacts = project.artifacts.map((artifact) => artifact.id === "normal-video" ? { ...artifact, hasAlpha: true } : artifact);
    expect(buildBatchProductionItems(project).find((item) => item.entityId === transition.id)?.action).toBe("approve");
  });
});
