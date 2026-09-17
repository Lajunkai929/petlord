import { describe, expect, it } from "vitest";
import { estimateVideoGenerationCost } from "@petlord/generation";
import { lotteryPixelProject } from "./lotteryPixelProject";
import { applyCompanionInteractionRecipe } from "./interactionRecipes";

describe("companion interaction recipe", () => {
  it("creates the complete interactive graph from authority states", () => {
    const project = applyCompanionInteractionRecipe({ ...lotteryPixelProject, transitions: [] });
    expect(project.transitions).toHaveLength(13);
    expect(project.transitions.find((transition) => transition.id.endsWith("rest-belly"))?.triggers[0]).toMatchObject({
      event: "left-click",
      region: { shape: "ellipse", x: 0.04, y: 0.04, width: 0.92, height: 0.92 },
    });
    expect(project.transitions.find((transition) => transition.id.endsWith("belly-wiggle"))?.triggers[0]).toMatchObject({ event: "hover", repeatWhileHovered: true });
    expect(project.transitions.find((transition) => transition.id.endsWith("sleep-wake"))).toMatchObject({ durationSeconds: 5 });
    expect(project.transitions.find((transition) => transition.id.endsWith("rest-sleep"))?.triggers[0]).toMatchObject({ event: "inactivity", timerDurationMs: 30_000 });
    expect(project.logicalStates.find((state) => state.semanticKey === "sleep")?.idleScheduler).toMatchObject({
      enabled: true,
      playbackMode: "interval",
      strategy: "weighted-random",
      minIntervalMs: 10_000,
      maxIntervalMs: 30_000,
      avoidImmediateRepeat: false,
    });
    expect(project.logicalStates.find((state) => state.semanticKey === "play")?.idleScheduler).toMatchObject({
      enabled: true,
      playbackMode: "continuous",
      strategy: "weighted-random",
    });
    expect(project.transitions.find((transition) => transition.id.endsWith("sleep-breathe"))?.idleRule).toMatchObject({ weight: 50, cooldownMs: 0 });
    expect(project.transitions.find((transition) => transition.id.endsWith("sleep-dream"))?.idleRule).toMatchObject({ weight: 1, cooldownMs: 30_000 });
  });

  it("keeps thirteen 720p animations plus seven Seedream outputs below the extra ¥30 cap", () => {
    const project = applyCompanionInteractionRecipe({
      ...lotteryPixelProject,
      transitions: [],
      generationSettings: { ...lotteryPixelProject.generationSettings, videoResolution: "720p" },
    });
    const videoMaximum = project.transitions.reduce((sum, transition) => sum + (estimateVideoGenerationCost({
      model: project.generationSettings.videoModel,
      resolution: project.generationSettings.videoResolution,
      durationMode: transition.durationMode,
      durationSeconds: transition.durationSeconds,
    })?.maximumCny ?? Number.POSITIVE_INFINITY), 0);
    expect(videoMaximum + 7 * 0.22).toBeLessThan(30);
  });
});
