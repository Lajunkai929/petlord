import { describe, expect, it } from "vitest";
import { lotteryHiResProject } from "../lotteryHiResProject";
import { lotteryStardewProject } from "../lotteryStardewProject";
import { lotteryClearProject } from "../lotteryClearProject";
import { refreshBundledProject } from "./useProjectWorkspace";

describe("bundled Lottery pixel project migration", () => {
  it("removes the destructive 96-to-64 double downsampling preset", () => {
    const legacy = structuredClone(lotteryStardewProject);
    legacy.runtimePresentation = {
      defaultFrameRate: 12,
      defaultRenderResolution: 96,
      defaultPixelGridSize: 64,
      defaultDisplaySize: 320,
      pixelated: true,
    };
    expect(refreshBundledProject(legacy).runtimePresentation).toMatchObject({
      defaultRenderResolution: 96,
      defaultPixelGridSize: 96,
      defaultDisplaySize: 384,
    });
  });
});

describe("bundled Lottery clear real project migration", () => {
  it("fills an earlier state-only sample with the completed interaction media", () => {
    const incomplete = structuredClone(lotteryClearProject);
    incomplete.transitions = incomplete.transitions.map((transition, index) => index === 0 ? transition : {
      ...transition,
      status: "target-ready",
      videoArtifactId: undefined,
      extractedTailArtifactId: undefined,
      activeMediaVersionId: undefined,
      mediaVersions: [],
    });
    const migrated = refreshBundledProject(incomplete);
    expect(migrated.transitions).toHaveLength(11);
    expect(migrated.transitions.every((transition) => transition.status === "approved" && transition.videoArtifactId)).toBe(true);
  });

  it("adds newly bundled sitting interactions without replacing an existing trigger", () => {
    const stored = structuredClone(lotteryClearProject);
    stored.updatedAt = "2026-09-01T10:00:00.000Z";
    const sitRest = stored.transitions.find((transition) => transition.id === "template-sit-rest")!;
    const sitBlink = stored.transitions.find((transition) => transition.id === "template-sit-blink")!;
    sitBlink.authorityBridge = { mode: "hard-cut", durationMs: 120 };
    sitRest.authorityBridge = { mode: "blur-dissolve", durationMs: 700 };
    sitRest.triggers = sitRest.triggers.filter((trigger) => trigger.event !== "double-click");
    sitBlink.triggers = [{
      id: "customer-sit-head-click",
      event: "left-click",
      enabled: true,
      region: { shape: "ellipse", x: 0.1, y: 0.05, width: 0.4, height: 0.4 },
    }];

    const migrated = refreshBundledProject(stored);
    const migratedSitRest = migrated.transitions.find((transition) => transition.id === "template-sit-rest")!;
    const migratedSitBlink = migrated.transitions.find((transition) => transition.id === "template-sit-blink")!;
    expect(migratedSitRest.triggers.some((trigger) => trigger.event === "inactivity")).toBe(true);
    expect(migratedSitRest.triggers.some((trigger) => trigger.event === "double-click")).toBe(true);
    expect(migratedSitBlink.triggers.some((trigger) => trigger.id === "customer-sit-head-click")).toBe(true);
    expect(migratedSitBlink.triggers.some((trigger) => trigger.id === "template-trigger-sit-click")).toBe(true);
    expect(migratedSitBlink.entryBlendMs).toBe(320);
    expect(migratedSitBlink.authorityBridge).toEqual({ mode: "hard-cut", durationMs: 120 });
    expect(migratedSitRest.entryBlendMs).toBe(420);
    expect(migratedSitRest.authorityBridge).toEqual({ mode: "crossfade", durationMs: 700 });
    expect(migrated.updatedAt).toBe(stored.updatedAt);
  });

  it("upgrades legacy one-second idle loops while preserving a custom interval", () => {
    const stored = structuredClone(lotteryClearProject);
    stored.logicalStates = stored.logicalStates.map((state) => state.semanticKey === "idle"
      ? { ...state, idleScheduler: { ...state.idleScheduler, minIntervalMs: 15_000, maxIntervalMs: 60_000 } }
      : state.semanticKey === "rest"
        ? { ...state, idleScheduler: { ...state.idleScheduler, playbackMode: "continuous", minIntervalMs: 8_000, maxIntervalMs: 18_000 } }
        : { ...state, idleScheduler: { ...state.idleScheduler, playbackMode: "continuous", minIntervalMs: 1_000, maxIntervalMs: 1_000 } });
    const sitRest = stored.transitions.find((transition) => transition.id === "template-sit-rest")!;
    const restSleep = stored.transitions.find((transition) => transition.id === "template-rest-sleep")!;
    sitRest.label = "坐着 1 分钟后趴下";
    restSleep.label = "趴着 1 分钟后睡觉";
    sitRest.triggers = sitRest.triggers.map((trigger) => trigger.event === "inactivity" ? { ...trigger, timerDurationMs: 60_000 } : trigger);
    restSleep.triggers = restSleep.triggers.map((trigger) => trigger.event === "inactivity" ? { ...trigger, timerDurationMs: 60_000 } : trigger);
    stored.transitions.find((transition) => transition.id === "template-sleep-breathe")!.idleRule = { enabled: true, weight: 10, cooldownMs: 0 };
    stored.transitions.find((transition) => transition.id === "template-sleep-dream")!.idleRule = { enabled: true, weight: 1, cooldownMs: 60_000 };

    const migrated = refreshBundledProject(stored);
    expect(migrated.logicalStates.find((state) => state.semanticKey === "idle")?.idleScheduler).toMatchObject({ minIntervalMs: 15_000, maxIntervalMs: 60_000 });
    expect(migrated.logicalStates.filter((state) => state.semanticKey !== "idle" && state.idleScheduler.enabled).every((state) =>
      state.idleScheduler.playbackMode === "interval" &&
      state.idleScheduler.minIntervalMs === 10_000 &&
      state.idleScheduler.maxIntervalMs === 30_000)).toBe(true);
    expect(migrated.transitions.find((transition) => transition.id === "template-sit-rest")?.triggers.find((trigger) => trigger.event === "inactivity")?.timerDurationMs).toBe(30_000);
    expect(migrated.transitions.find((transition) => transition.id === "template-rest-sleep")?.triggers[0].timerDurationMs).toBe(30_000);
    expect(migrated.transitions.find((transition) => transition.id === "template-sleep-breathe")?.idleRule?.weight).toBe(50);
    expect(migrated.transitions.find((transition) => transition.id === "template-sleep-dream")?.idleRule?.cooldownMs).toBe(30_000);
  });
});

describe("bundled high-resolution project migration", () => {
  it("migrates legacy idle defaults to random intervals and removes duplicate authority variants", () => {
    const project = structuredClone(lotteryHiResProject);
    const replacements = new Map<string, string>();
    const alternativeVariants = project.variants.map((variant) => {
      const id = `live-${variant.id}`;
      replacements.set(variant.id, id);
      return { ...variant, id };
    });
    project.variants.push(...alternativeVariants);
    project.logicalStates = project.logicalStates.map((state) => ({
      ...state,
      defaultVariantId: replacements.get(state.defaultVariantId ?? "") ?? state.defaultVariantId,
      preferredOutboundVariantId: replacements.get(state.preferredOutboundVariantId ?? "") ?? state.preferredOutboundVariantId,
      idleScheduler: { ...state.idleScheduler, playbackMode: undefined, minIntervalMs: 8_000, maxIntervalMs: 18_000 },
    }));
    project.initialVariantId = replacements.get(project.initialVariantId ?? "") ?? project.initialVariantId;
    project.transitions = project.transitions.map((transition) => ({
      ...transition,
      fromVariantId: replacements.get(transition.fromVariantId) ?? transition.fromVariantId,
      toVariantId: replacements.get(transition.toVariantId ?? "") ?? transition.toVariantId,
      entryBlendMs: transition.idleRule ? 180 : transition.entryBlendMs,
      authorityBridge: transition.idleRule
        ? { ...transition.authorityBridge, durationMs: 420 }
        : transition.endFrameSource !== "video-frame"
          ? { mode: "crossfade" as const, durationMs: 420 }
          : transition.authorityBridge,
    }));

    const migrated = refreshBundledProject(project);
    expect(migrated.variants).toHaveLength(5);
    expect(migrated.logicalStates.filter((state) => state.idleScheduler.enabled)
      .every((state) => state.idleScheduler.playbackMode === "interval" &&
        state.idleScheduler.minIntervalMs === 10_000 &&
        state.idleScheduler.maxIntervalMs === 30_000)).toBe(true);
    expect(migrated.transitions.filter((transition) => transition.idleRule)
      .every((transition) => transition.entryBlendMs === 320 && transition.authorityBridge.durationMs === 360)).toBe(true);
    expect(migrated.transitions.filter((transition) => !transition.idleRule && transition.endFrameSource !== "video-frame")
      .every((transition) => transition.authorityBridge.mode === "crossfade" && transition.authorityBridge.durationMs === 700)).toBe(true);
    expect(migrated.transitions.every((transition) =>
      migrated.variants.some((variant) => variant.id === transition.fromVariantId) &&
      (!transition.toVariantId || migrated.variants.some((variant) => variant.id === transition.toVariantId)))).toBe(true);
  });

  it("upgrades bundled ping-pong clips to return all the way to video time zero", () => {
    const project = structuredClone(lotteryHiResProject);
    const legacy = project.transitions.find((transition) => transition.id === "recipe-companion-belly-wiggle")!;
    legacy.playback = { ...legacy.playback!, segmentStartMs: 200, segmentEndMs: 1_800 };
    legacy.mediaVersions = legacy.mediaVersions.map((version) => version.id === legacy.activeMediaVersionId
      ? { ...version, playback: legacy.playback }
      : version);

    const migrated = refreshBundledProject(project);
    const transition = migrated.transitions.find((candidate) => candidate.id === legacy.id)!;
    const activeVersion = transition.mediaVersions.find((version) => version.id === transition.activeMediaVersionId)!;
    expect(transition.playback).toMatchObject({ mode: "ping-pong", segmentStartMs: 0, segmentEndMs: 1_600 });
    expect(activeVersion.playback).toMatchObject({ mode: "ping-pong", segmentStartMs: 0, segmentEndMs: 1_600 });
  });
});
