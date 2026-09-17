import { describe, expect, it } from "vitest";
import { characterProjectSchema } from "@petlord/schema";
import { PetRuntimeCore } from "@petlord/runtime-core";
import { buildPetPackage } from "@petlord/state-engine";
import { lotteryHiResProject } from "./lotteryHiResProject";

describe("Lottery high-resolution master sample", () => {
  it("keeps a high-resolution, low-detail master and applies the pixel grid only at runtime", () => {
    const project = characterProjectSchema.parse(lotteryHiResProject);
    expect(project.stylePrompt).toContain("当前输出保持 2K 高清、干净、非像素化");
    expect(project.stylePrompt).toContain("使用 7–10 个稳定绘画色");
    expect(project.runtimePresentation).toEqual({
      defaultFrameRate: 12,
      defaultRenderResolution: 96,
      defaultPixelGridSize: 64,
      defaultDisplaySize: 320,
      pixelated: true,
    });
    expect(project.generationSettings).toMatchObject({ imageResolution: "2K", videoResolution: "720p", ratio: "1:1" });
    expect(project.logicalStates
      .filter((state) => ["idle", "rest", "sleep", "play"].includes(state.semanticKey ?? ""))
      .every((state) => state.idleScheduler.enabled &&
        state.idleScheduler.playbackMode === (state.semanticKey === "play" ? "continuous" : "interval") &&
        state.idleScheduler.minIntervalMs === 10_000 &&
        state.idleScheduler.maxIntervalMs === 30_000)).toBe(true);
    expect(project.transitions.filter((transition) => transition.idleRule)).toHaveLength(5);
  });

  it("preserves every generated candidate and settles below the authorized budget", () => {
    const imageJobs = lotteryHiResProject.jobs.filter((job) => job.kind === "state-draft");
    const videoJobs = lotteryHiResProject.jobs.filter((job) => job.kind === "transition");
    const actualCost = lotteryHiResProject.jobs.reduce((sum, job) => sum + (job.cost?.actualCny ?? 0), 0);
    expect(imageJobs).toHaveLength(7);
    expect(videoJobs).toHaveLength(13);
    expect(actualCost).toBeCloseTo(28.1395, 4);
    expect(actualCost).toBeLessThanOrEqual(lotteryHiResProject.generationBudgetCny);
    expect(lotteryHiResProject.logicalStates.find((state) => state.semanticKey === "greet")?.referenceArtifactIds).toHaveLength(2);
    expect(lotteryHiResProject.logicalStates.find((state) => state.semanticKey === "play")?.referenceArtifactIds).toHaveLength(2);
  });

  it("publishes all interaction media as silent transparent 720p versions", () => {
    const manifest = buildPetPackage(lotteryHiResProject);
    expect(manifest.states).toHaveLength(5);
    expect(manifest.transitions).toHaveLength(13);
    expect(manifest.transitions.every((transition) => transition.transparentVideo)).toBe(true);
    expect(lotteryHiResProject.transitions.every((transition) => transition.status === "approved")).toBe(true);
    expect(lotteryHiResProject.transitions.filter((transition) => transition.playback?.mode === "ping-pong")).toHaveLength(5);
    expect(lotteryHiResProject.transitions.filter((transition) => transition.playback?.mode === "ping-pong").every((transition) => transition.mediaVersions.length === 2)).toBe(true);
    expect(lotteryHiResProject.transitions.find((transition) => transition.id === "recipe-companion-belly-wiggle")?.playback).toMatchObject({ repeatMode: "random", minCycles: 2, maxCycles: 4 });
    expect(lotteryHiResProject.transitions.every((transition) => transition.lastGenerationPrompt?.includes("摄影机安装在固定三脚架上"))).toBe(true);
    const transitionVideoIds = new Set(lotteryHiResProject.transitions.map((transition) => transition.videoArtifactId));
    expect(lotteryHiResProject.artifacts
      .filter((artifact) => transitionVideoIds.has(artifact.id))
      .every((artifact) => artifact.pixelWidth === 720 && artifact.pixelHeight === 720 && artifact.silent && artifact.hasAlpha)).toBe(true);
  });

  it("runs click, hover, inactivity and ToDo paths in the shared runtime", () => {
    let now = 0;
    const manifest = buildPetPackage(lotteryHiResProject);
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    const transition = (id: string) => manifest.transitions.find((candidate) => candidate.id === id)!;
    const finish = (id: string) => {
      now += transition(id).durationMs;
      core.finishVideo(now);
      if (core.getSnapshot().phase === "bridge") {
        now += transition(id).authorityBridge.durationMs;
        core.advanceBridge(now);
      }
    };

    expect(core.activatePointer("left-click", { x: 0.15, y: 0.15 }, now)).toEqual({ accepted: true });
    expect(core.getSnapshot().activeTransitionId).toBe("recipe-companion-rest-ear");
    finish("recipe-companion-rest-ear");

    expect(core.activatePointer("left-click", { x: 0.5, y: 0.5 }, now)).toEqual({ accepted: true });
    finish("recipe-companion-rest-belly");
    core.movePointer({ x: 0.5, y: 0.5 }, now);
    now += 500;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("recipe-companion-belly-wiggle");
    core.leavePointer(now + 1);
    finish("recipe-companion-belly-wiggle");
    expect(core.getSnapshot().activeTransitionId).toBe("recipe-companion-belly-rest");
    finish("recipe-companion-belly-rest");

    now += 60_000;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("recipe-companion-rest-sleep");
    finish("recipe-companion-rest-sleep");

    expect(core.activatePointer("left-click", { x: 0.5, y: 0.5 }, now)).toEqual({ accepted: true });
    finish("recipe-companion-sleep-wake");
    expect(core.performSemanticAction("greet", now)).toEqual({ accepted: true });
    expect(core.getSnapshot().activeTransitionId).toBe("recipe-companion-rest-greet");
  });
});
