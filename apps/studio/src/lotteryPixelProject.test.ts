import { describe, expect, it } from "vitest";
import { characterProjectSchema } from "@petlord/schema";
import { estimateVideoGenerationCost } from "@petlord/generation";
import { lotteryPixelProject } from "./lotteryPixelProject";

describe("Lottery Stardew pixel product fixture", () => {
  it("contains the authoritative high-resolution pixel states and the complete requested behavior graph", () => {
    const project = characterProjectSchema.parse(lotteryPixelProject);
    expect(project.name).toContain("星露谷像素");
    expect(project.logicalStates.map((state) => state.semanticKey)).toEqual(["rest", "idle", "sleep", "play", "greet"]);
    expect(project.artifacts.filter((artifact) => artifact.kind === "state-draft")).toHaveLength(5);
    expect(project.artifacts.filter((artifact) => artifact.kind === "state-draft").every((artifact) => artifact.pixelWidth === 1254 && artifact.pixelHeight === 1254 && artifact.hasAlpha)).toBe(true);
    expect(project.transitions).toHaveLength(14);
  });

  it("models timed, regional, continuous-hover, leave, and sleep behaviors explicitly", () => {
    const byId = new Map(lotteryPixelProject.transitions.map((transition) => [transition.id, transition]));
    expect(byId.get("pixel-lying-sleep")?.triggers[0]).toMatchObject({ event: "inactivity", timerDurationMs: 10_000 });
    expect(byId.get("pixel-sitting-lying")?.triggers[0]).toMatchObject({ event: "inactivity", timerDurationMs: 10_000 });
    expect(byId.get("pixel-lying-ear")?.triggers[0]).toMatchObject({ event: "left-click", region: expect.any(Object) });
    expect(byId.get("pixel-lying-belly")?.triggers[0]).toMatchObject({ event: "double-click", region: expect.any(Object) });
    expect(byId.get("pixel-lying-sit")?.triggers[0]).toMatchObject({ event: "left-click", region: expect.any(Object) });
    expect(byId.get("pixel-belly-wiggle")?.triggers[0]).toMatchObject({ event: "hover", repeatWhileHovered: true });
    expect(byId.get("pixel-belly-lying")?.triggers[0]).toMatchObject({ event: "pointer-leave" });
    expect(byId.get("pixel-belly-lying")?.endFrameSource).toBe("authority-reference");
    expect(byId.get("pixel-lying-ear")?.endFrameSource).toBe("source-frame");
    expect(byId.get("pixel-lying-greet")).toMatchObject({ fromVariantId: expect.stringContaining("state-pixel-lying"), toLogicalStateId: "state-pixel-stretch" });
    expect(byId.get("pixel-greet-lying")?.triggers[0]).toMatchObject({ event: "state-timeout", timerDurationMs: 1_500 });
    expect(byId.get("pixel-sleep-breathe")?.idleRule).toMatchObject({ weight: 10, cooldownMs: 2_000 });
    expect(byId.get("pixel-sleep-dream")?.idleRule).toMatchObject({ weight: 1, cooldownMs: 60_000 });
    expect(byId.get("pixel-sleep-wake-lying")).toMatchObject({ durationSeconds: 8, guidanceArtifactIds: ["artifact-pixel-greet"] });
  });

  it("keeps the complete planned 720p video run below the project API hard budget", () => {
    const maximum = lotteryPixelProject.transitions.reduce((sum, transition) => sum + (estimateVideoGenerationCost({
      model: lotteryPixelProject.generationSettings.videoModel,
      resolution: lotteryPixelProject.generationSettings.videoResolution,
      durationMode: transition.durationMode,
      durationSeconds: transition.durationSeconds,
    })?.maximumCny ?? Number.POSITIVE_INFINITY), 0);
    expect(maximum).toBeLessThan(31);
    expect(maximum).toBeLessThan(lotteryPixelProject.generationBudgetCny);
  });
});
