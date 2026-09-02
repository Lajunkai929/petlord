import { describe, expect, it } from "vitest";
import { characterProjectSchema } from "@petlord/schema";
import { buildPetPackage } from "@petlord/state-engine";
import { lotteryStardewProject } from "./lotteryStardewProject";

describe("Lottery cozy farm RPG pixel project", () => {
  it("contains four complete authority states and separate image/video style prompts", () => {
    const project = characterProjectSchema.parse(lotteryStardewProject);
    expect(project.logicalStates.map((state) => state.semanticKey)).toEqual(["idle", "rest", "sleep", "greet"]);
    expect(project.logicalStates.every((state) => state.referenceArtifactId && state.defaultVariantId)).toBe(true);
    expect(project.imageStylePrompt).toContain("2×2 或 2×3 高对比纯色色块");
    expect(project.imageStylePrompt).toContain("四肢长度");
    expect(project.videoStylePrompt).toContain("小眼睛必须作为刚性 sprite 原样复制");
    expect(project.videoStylePrompt).not.toContain("暖琥珀");
    expect(project.imageStylePrompt).not.toBe(project.videoStylePrompt);
    expect(project.runtimePresentation).toMatchObject({
      defaultRenderResolution: 96,
      defaultPixelGridSize: 96,
      defaultDisplaySize: 384,
      pixelated: true,
    });
  });

  it("ships a stable sitting idle and a real rest-to-sleep transition", () => {
    const manifest = buildPetPackage(lotteryStardewProject);
    expect(manifest.states.length).toBeGreaterThanOrEqual(5);
    expect(manifest.transitions).toHaveLength(2);
    expect(manifest.transitions.every((transition) => transition.transparentVideo && transition.durationMs === 4000)).toBe(true);
    expect(lotteryStardewProject.transitions.find((transition) => transition.id === "template-rest-sleep")).toMatchObject({ status: "approved", endFrameSource: "video-frame", toVariantId: "variant-stardew-sleep-video-tail" });
  });

  it("preserves every candidate and remains under the authorized generation budget", () => {
    expect(lotteryStardewProject.artifacts.filter((artifact) => artifact.kind === "state-draft")).toHaveLength(12);
    const actualCost = lotteryStardewProject.jobs.reduce((sum, job) => sum + (job.cost?.actualCny ?? 0), 0);
    expect(actualCost).toBeCloseTo(4.4248, 4);
    expect(actualCost).toBeLessThanOrEqual(30);
  });
});
