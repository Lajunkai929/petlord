import { describe, expect, it } from "vitest";
import { characterProjectSchema } from "@petlord/schema";
import { PetRuntimeCore } from "@petlord/runtime-core";
import { buildPetPackage } from "@petlord/state-engine";
import { lotteryClearProject, lotteryRealIdentityProfileId } from "./lotteryClearProject";

describe("Lottery clear real-photo project", () => {
  it("uses real photographs as the top-level identity and keeps four complete states", () => {
    const project = characterProjectSchema.parse(lotteryClearProject);
    expect(project.identityProfileId).toBe(lotteryRealIdentityProfileId);
    expect(project.referenceArtifactIds).toHaveLength(6);
    expect(project.referenceArtifactIds.every((id) => project.artifacts.find((artifact) => artifact.id === id)?.provenance === "user-upload")).toBe(true);
    expect(project.logicalStates.map((state) => state.semanticKey)).toEqual(["idle", "rest", "sleep", "play"]);
    expect(project.runtimePresentation).toMatchObject({ defaultRenderResolution: 480, pixelated: false });
    expect(project.imageStylePrompt).toContain("清透自然的高清宠物摄影母版");
  });

  it("preserves all final candidates and publishes every configured interaction", () => {
    expect(lotteryClearProject.artifacts.filter((artifact) => artifact.kind === "state-draft")).toHaveLength(12);
    const manifest = buildPetPackage(lotteryClearProject);
    expect(manifest.states).toHaveLength(4);
    expect(manifest.transitions).toHaveLength(11);
    expect(manifest.transitions.every((transition) => transition.transparentVideo)).toBe(true);
    expect(manifest.transitions.filter((transition) => transition.fromStateId === transition.toStateId)
      .every((transition) => transition.authorityBridge.mode !== "hard-cut")).toBe(true);
    expect(lotteryClearProject.transitions.every((transition) => transition.status === "approved")).toBe(true);
  });

  it("publishes a configured drag anchor against the target state's actual runtime variant", () => {
    const project = characterProjectSchema.parse({
      ...lotteryClearProject,
      dragInteraction: {
        enabled: true,
        targetLogicalStateId: "state-lying",
        anchor: { x: 0.5, y: 0.18 },
        alignmentDurationMs: 600,
        returnDurationMs: 500,
      },
    });
    expect(buildPetPackage(project).dragInteraction).toEqual({
      enabled: true,
      targetStateId: "variant-clear-authority-state-lying",
      anchor: { x: 0.5, y: 0.18 },
      alignmentDurationMs: 600,
      returnDurationMs: 500,
    });
  });

  it("settles the selected project media well below the authorized budget", () => {
    const actualCost = lotteryClearProject.jobs.reduce((sum, job) => sum + (job.cost?.actualCny ?? 0), 0);
    expect(actualCost).toBeCloseTo(12.6772, 4);
    expect(actualCost).toBeLessThanOrEqual(30);
  });

  it("lets a belly click interrupt a scheduled lying idle animation", () => {
    let now = 0;
    const manifest = buildPetPackage(lotteryClearProject);
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    core.jumpToState("variant-clear-authority-state-lying", now);
    now = 10_000;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("template-rest-ear");
    now = 10_100;
    expect(core.activatePointer("left-click", { x: 0.5, y: 0.55 }, now)).toEqual({ accepted: true });
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "variant-clear-authority-state-lying", activeTransitionId: "template-rest-belly", phase: "video" });
  });

  it("lets sitting respond to head and body clicks while its idle animation is playing", () => {
    let now = 0;
    const manifest = buildPetPackage(lotteryClearProject);
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    now = 10_000;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("template-sit-blink");

    now = 10_100;
    expect(core.activatePointer("left-click", { x: 0.2, y: 0.18 }, now)).toEqual({ accepted: true });
    expect(core.getSnapshot().activeTransitionId).toBe("template-sit-blink");

    now = 10_200;
    expect(core.activatePointer("left-click", { x: 0.5, y: 0.55 }, now)).toEqual({ accepted: true });
    expect(core.getSnapshot()).toMatchObject({
      currentStateId: "variant-clear-authority-state-sitting",
      activeTransitionId: "template-sit-rest",
      phase: "video",
    });
  });

  it("triggers template-belly-wiggle after entering belly and never restarts it on pointer movement", () => {
    let now = 0;
    const manifest = buildPetPackage(lotteryClearProject);
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    const finish = (transitionId: string) => {
      const transition = manifest.transitions.find((candidate) => candidate.id === transitionId)!;
      now += transition.durationMs;
      core.finishVideo(now);
      if (core.getSnapshot().phase === "bridge") {
        now += transition.authorityBridge.durationMs;
        core.advanceBridge(now);
      }
    };

    core.jumpToState("variant-clear-authority-state-lying", now);
    core.movePointer({ x: 0.5, y: 0.5 }, now);
    expect(core.activatePointer("left-click", { x: 0.5, y: 0.5 }, now)).toEqual({ accepted: true });
    finish("template-rest-belly");
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "variant-clear-authority-state-belly", activeTransitionId: null });
    expect(core.getSnapshot().nextHoverTrigger).toMatchObject({ transitionId: "template-belly-wiggle", dueAt: now + 500 });

    now += 500;
    expect(core.fireDueSchedules(now)).toBe(true);
    const runId = core.getSnapshot().activeTransitionRunId;
    core.movePointer({ x: 0.51, y: 0.5 }, now + 100);
    core.movePointer({ x: 0.49, y: 0.51 }, now + 400);
    expect(core.getSnapshot()).toMatchObject({ activeTransitionId: "template-belly-wiggle", activeTransitionRunId: runId });
    expect(core.getSnapshot().nextHoverTrigger).toBeNull();
  });
});
