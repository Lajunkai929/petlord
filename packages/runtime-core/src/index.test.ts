import { describe, expect, it } from "vitest";
import type { PetPackageManifest } from "@petlord/schema";
import { PetRuntimeCore, pointIsWithinPointerGazeRange, pointerGazeProgress, pointerGazeTimeMs } from "./index";

describe("pointer gaze mapping", () => {
  it("maps a circular pointer direction to a stable scrub position", () => {
    expect(pointerGazeProgress({ x: -0.5, y: 0.5 })).toBeCloseTo(0);
    expect(pointerGazeProgress({ x: 0.5, y: -0.5 })).toBeCloseTo(0.25);
    expect(pointerGazeProgress({ x: 1.5, y: 0.5 })).toBeCloseTo(0.5);
    expect(pointerGazeProgress({ x: 0.5, y: 1.5 })).toBeCloseTo(0.75);
  });

  it("uses eight calibrated direction frames instead of assuming uniform video timing", () => {
    const gaze = {
      durationMs: 6000,
      segmentStartMs: 0,
      segmentEndMs: 6000,
      directionKeyframesMs: [500, 1100, 1750, 2350, 3050, 3650, 4300, 4925] as [number, number, number, number, number, number, number, number],
    };
    expect(pointerGazeTimeMs(gaze, 0)).toBe(500);
    expect(pointerGazeTimeMs(gaze, 0.25)).toBe(1750);
    expect(pointerGazeTimeMs(gaze, 0.5)).toBe(3050);
    expect(pointerGazeTimeMs(gaze, 0.75)).toBe(4300);
    expect(pointerGazeTimeMs(gaze, 0.125 + 0.0625)).toBeCloseTo(1425);
    expect(pointerGazeTimeMs(gaze, 0.9375)).toBeCloseTo(5712.5);
    expect(pointerGazeTimeMs(gaze, 0.99)).toBeCloseTo(374);
  });

  it("keeps the previous gaze frame while the pointer is stationary near the center", () => {
    expect(pointerGazeProgress({ x: 0.52, y: 0.51 }, 0.72)).toBe(0.72);
    expect(pointIsWithinPointerGazeRange({ x: 1.6, y: 0.5 }, 1.4)).toBe(true);
    expect(pointIsWithinPointerGazeRange({ x: 2.1, y: 0.5 }, 1.4)).toBe(false);
  });
});

function runtimeManifest(): PetPackageManifest {
  const idleScheduler = { enabled: false, strategy: "weighted-random" as const, minIntervalMs: 1000, maxIntervalMs: 1000, avoidImmediateRepeat: true };
  return {
    manifestVersion: 1,
    id: "runtime-test",
    name: "Runtime test",
    characterName: "Lottery",
    initialStateId: "sit",
    states: [
      { id: "sit", logicalStateId: "idle", label: "坐着", imageUri: "/sit.png", origin: "reference" },
      { id: "lie", logicalStateId: "rest", label: "趴着", imageUri: "/lie.png", origin: "transition-tail" },
      { id: "belly", logicalStateId: "play", label: "翻肚皮", imageUri: "/belly.png", origin: "transition-tail" },
    ],
    transitions: [
      {
        id: "sit-lie",
        fromStateId: "sit",
        toStateId: "lie",
        videoUri: "/sit-lie.webm",
        tailFrameUri: "/lie.png",
        durationMs: 800,
        endFrameSource: "video-frame",
        transparentVideo: true,
        authorityBridge: { mode: "crossfade", durationMs: 500 },
        triggers: [{ id: "double", event: "double-click", enabled: true }],
      },
      {
        id: "lie-belly",
        fromStateId: "lie",
        toStateId: "belly",
        videoUri: "/lie-belly.webm",
        tailFrameUri: "/belly.png",
        durationMs: 900,
        endFrameSource: "video-frame",
        transparentVideo: true,
        authorityBridge: { mode: "crossfade", durationMs: 500 },
        triggers: [],
      },
    ],
    logicalStates: [
      { id: "idle", label: "坐着", variantIds: ["sit"], idleScheduler },
      { id: "rest", label: "趴着", variantIds: ["lie"], idleScheduler },
      { id: "play", label: "翻肚皮", variantIds: ["belly"], idleScheduler },
    ],
    semanticActions: { rest: "rest", play: "play" },
    plugins: [],
  };
}

describe("PetRuntimeCore", () => {
  it("runs a semantic multi-transition path through one exact queue", () => {
    let now = 0;
    const core = new PetRuntimeCore(runtimeManifest(), { now: () => now, random: () => 0 });
    expect(core.performSemanticAction("play", now)).toEqual({ accepted: true });
    expect(core.getSnapshot()).toMatchObject({ activeTransitionId: "sit-lie", queuedTransitionIds: ["lie-belly"], phase: "video" });
    now = 800;
    core.finishVideo(now);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "sit", activeTransitionId: "sit-lie", phase: "bridge" });
    now = 1300;
    core.advanceBridge(now);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "lie", activeTransitionId: "lie-belly", queuedTransitionIds: [], phase: "video" });
    now = 2200;
    core.finishVideo(now);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "lie", activeTransitionId: "lie-belly", phase: "bridge" });
    now = 2700;
    core.advanceBridge(now);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "belly", activeTransitionId: null, phase: "idle" });
    expect(core.getSnapshot().events.filter((event) => event.type === "transition-started").map((event) => event.transitionId)).toEqual(["lie-belly", "sit-lie"]);
  });

  it("uses the same authority bridge state for preview and desktop adapters", () => {
    const manifest = runtimeManifest();
    manifest.states[1] = { ...manifest.states[1], imageUri: "/lie-authority.png", origin: "reference" };
    manifest.transitions[0] = {
      ...manifest.transitions[0],
      tailFrameUri: "/lie-authority.png",
      endFrameSource: "authority-reference",
    };
    let now = 0;
    const core = new PetRuntimeCore(manifest, { now: () => now });
    core.beginTransition("sit-lie", "manual", now);
    now = 800;
    core.finishVideo(now);
    expect(core.getSnapshot()).toMatchObject({ phase: "bridge", bridgeProgress: 0, currentStateId: "sit" });
    now = 1050;
    core.advanceBridge(now);
    expect(core.getSnapshot().bridgeProgress).toBeCloseTo(0.5);
    now = 1300;
    core.advanceBridge(now);
    expect(core.getSnapshot()).toMatchObject({ phase: "idle", currentStateId: "lie", activeTransitionId: null });
  });

  it("overlaps a video-selected end frame instead of cutting directly to the image", () => {
    let now = 0;
    const core = new PetRuntimeCore(runtimeManifest(), { now: () => now });
    core.beginTransition("sit-lie", "manual", now);
    now = 800;
    core.finishVideo(now);
    expect(core.getSnapshot()).toMatchObject({ phase: "bridge", currentStateId: "sit", activeTransitionId: "sit-lie" });
    now = 1_300;
    core.advanceBridge(now);
    expect(core.getSnapshot()).toMatchObject({ phase: "idle", currentStateId: "lie", activeTransitionId: null });
  });

  it("matches pointer rules and fires inactivity schedules deterministically", () => {
    const manifest = runtimeManifest();
    manifest.transitions[0].triggers.push({ id: "sleep-after-idle", event: "inactivity", enabled: true, timerDurationMs: 60_000 });
    let now = 1000;
    const core = new PetRuntimeCore(manifest, { now: () => now });
    expect(core.pointerMatch("double-click", { x: 0.5, y: 0.5 })?.transition.id).toBe("sit-lie");
    expect(core.getSnapshot().nextTimedTrigger?.dueAt).toBe(61_000);
    now = 30_000;
    core.recordInteraction(now);
    expect(core.getSnapshot().nextTimedTrigger?.dueAt).toBe(90_000);
    now = 89_999;
    expect(core.fireDueSchedules(now)).toBe(false);
    now = 90_000;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot()).toMatchObject({ activeTransitionId: "sit-lie", phase: "video" });
  });

  it("owns weighted idle scheduling and can reset without UI state", () => {
    const manifest = runtimeManifest();
    manifest.logicalStates[0].idleScheduler = { enabled: true, strategy: "weighted-random", minIntervalMs: 1000, maxIntervalMs: 1000, avoidImmediateRepeat: true };
    manifest.transitions.push({
      id: "idle-breathe",
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: "/breathe.webm",
      tailFrameUri: "/sit.png",
      durationMs: 600,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      idleRule: { enabled: true, weight: 1, cooldownMs: 0 },
      triggers: [],
    });
    let now = 0;
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    expect(core.getSnapshot().nextIdleDueAt).toBe(1000);
    now = 1000;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("idle-breathe");
    now = 1600;
    core.finishVideo(now);
    expect(core.getSnapshot().currentStateId).toBe("sit");
    core.jumpToState("belly", 2000);
    expect(core.getSnapshot().currentStateId).toBe("belly");
    core.reset(3000);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "sit", activeTransitionId: null, phase: "idle" });
  });

  it("chooses one random playback cycle count per activation and waits for the full run", () => {
    const manifest = runtimeManifest();
    manifest.transitions[0].playback = {
      mode: "ping-pong",
      repeatMode: "random",
      minCycles: 2,
      maxCycles: 4,
      segmentStartMs: 200,
      segmentEndMs: 1_800,
    };
    const core = new PetRuntimeCore(manifest, { now: () => 0, random: () => 0.6 });
    core.beginTransition("sit-lie", "manual", 0);
    expect(core.getSnapshot()).toMatchObject({ activeTransitionRunId: 1, activePlaybackCycles: 3, phase: "video" });
    expect(core.videoTimeReached(2_399, 2_399)).toBe(false);
    expect(core.videoTimeReached(2_400, 2_400)).toBe(true);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "sit", activeTransitionId: "sit-lie", phase: "bridge" });
    core.advanceBridge(2_900);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "lie", activeTransitionId: null, phase: "idle" });
  });

  it("lets direct interaction interrupt a self idle animation without interrupting normal transitions", () => {
    const manifest = runtimeManifest();
    manifest.transitions.push({
      id: "idle-breathe",
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: "/breathe.webm",
      tailFrameUri: "/sit.png",
      durationMs: 600,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      idleRule: { enabled: true, weight: 1, cooldownMs: 0 },
      triggers: [],
    });
    const core = new PetRuntimeCore(manifest, { now: () => 0 });
    expect(core.beginTransition("idle-breathe", "idle", 0)).toEqual({ accepted: true });
    expect(core.activatePointer("double-click", { x: 0.5, y: 0.5 }, 100)).toEqual({ accepted: true });
    expect(core.getSnapshot()).toMatchObject({ activeTransitionId: "sit-lie", phase: "video" });
    expect(core.getSnapshot().events.some((event) => event.type === "transition-interrupted" && event.transitionId === "idle-breathe")).toBe(true);
    expect(core.beginTransition("lie-belly", "manual", 200)).toMatchObject({ accepted: false });
    expect(core.getSnapshot().activeTransitionId).toBe("sit-lie");
  });

  it("treats a pointer-started self-loop as the current static state for other interactions", () => {
    const manifest = runtimeManifest();
    manifest.transitions.push({
      id: "sit-pet-loop",
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: "/sit-pet.webm",
      tailFrameUri: "/sit.png",
      durationMs: 4_000,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      triggers: [{ id: "pet", event: "left-click", enabled: true }],
    });
    const core = new PetRuntimeCore(manifest, { now: () => 0 });
    expect(core.activatePointer("left-click", { x: 0.5, y: 0.5 }, 100)).toEqual({ accepted: true });
    expect(core.getSnapshot().activeTransitionId).toBe("sit-pet-loop");
    expect(core.pointerMatch("double-click", { x: 0.5, y: 0.5 })?.transition.id).toBe("sit-lie");
    expect(core.activatePointer("double-click", { x: 0.5, y: 0.5 }, 200)).toEqual({ accepted: true });
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "sit", activeTransitionId: "sit-lie", phase: "video" });
    expect(core.getSnapshot().events.some((event) => event.type === "transition-interrupted" && event.transitionId === "sit-pet-loop")).toBe(true);
  });

  it("keeps inactivity timers alive while a long self-loop is playing", () => {
    const manifest = runtimeManifest();
    manifest.transitions[0].triggers = [{ id: "sit-timeout", event: "inactivity", enabled: true, timerDurationMs: 1_000 }];
    manifest.transitions.push({
      id: "sit-long-loop",
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: "/sit-long.webm",
      tailFrameUri: "/sit.png",
      durationMs: 10_000,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      triggers: [],
    });
    const core = new PetRuntimeCore(manifest, { now: () => 0 });
    expect(core.beginTransition("sit-long-loop", "manual", 0)).toEqual({ accepted: true });
    expect(core.getSnapshot().nextTimedTrigger).toMatchObject({ transitionId: "sit-lie", dueAt: 1_000 });
    expect(core.fireDueSchedules(1_000)).toBe(true);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "sit", activeTransitionId: "sit-lie", phase: "video" });
  });

  it("lets plugin semantic actions interrupt a self-loop from the same static state", () => {
    const manifest = runtimeManifest();
    manifest.transitions.push({
      id: "sit-loop",
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: "/sit-loop.webm",
      tailFrameUri: "/sit.png",
      durationMs: 4_000,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      triggers: [],
    });
    const core = new PetRuntimeCore(manifest, { now: () => 0 });
    core.beginTransition("sit-loop", "manual", 0);
    expect(core.performSemanticAction("rest", 100)).toEqual({ accepted: true });
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "sit", activeTransitionId: "sit-lie", phase: "video" });
  });

  it("lets a semantic user action supersede an automatic timer transition", () => {
    const manifest = runtimeManifest();
    manifest.states.push({ id: "sleep", logicalStateId: "sleep", label: "睡觉", imageUri: "/sleep.png", origin: "reference" });
    manifest.logicalStates.push({
      id: "sleep",
      label: "睡觉",
      variantIds: ["sleep"],
      idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 1000, maxIntervalMs: 1000, avoidImmediateRepeat: true },
    });
    manifest.transitions.push({
      id: "sit-sleep",
      fromStateId: "sit",
      toStateId: "sleep",
      videoUri: "/sit-sleep.webm",
      tailFrameUri: "/sleep.png",
      durationMs: 4_000,
      endFrameSource: "authority-reference",
      transparentVideo: true,
      authorityBridge: { mode: "crossfade", durationMs: 300 },
      triggers: [{ id: "sleep-timer", event: "inactivity", enabled: true, timerDurationMs: 10_000 }],
    });
    const core = new PetRuntimeCore(manifest, { now: () => 0 });
    expect(core.beginTransition("sit-sleep", "timer", 10_000)).toEqual({ accepted: true });
    expect(core.performSemanticAction("rest", 11_000)).toEqual({ accepted: true });
    expect(core.getSnapshot()).toMatchObject({ activeTransitionId: "sit-lie", queuedTransitionIds: [] });
    expect(core.getSnapshot().events.some((event) => event.type === "transition-interrupted" && event.transitionId === "sit-sleep")).toBe(true);
  });

  it("does not let self idle animations postpone an inactivity transition", () => {
    const manifest = runtimeManifest();
    manifest.transitions[0].triggers = [{ id: "sit-timeout", event: "inactivity", enabled: true, timerDurationMs: 10_000 }];
    manifest.transitions.push({
      id: "idle-blink",
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: "/blink.webm",
      tailFrameUri: "/sit.png",
      durationMs: 4_000,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      idleRule: { enabled: true, weight: 1, cooldownMs: 0 },
      triggers: [],
    });
    const core = new PetRuntimeCore(manifest, { now: () => 0 });
    core.beginTransition("idle-blink", "idle", 4_000);
    core.finishVideo(8_000);
    expect(core.getSnapshot().nextTimedTrigger?.dueAt).toBe(10_000);
    expect(core.fireDueSchedules(10_000)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("sit-lie");
  });

  it("continuously rotates idle versions and still yields to a due timer", () => {
    const manifest = runtimeManifest();
    manifest.logicalStates[0].idleScheduler = {
      enabled: true,
      playbackMode: "continuous",
      strategy: "weighted-round-robin",
      minIntervalMs: 1000,
      maxIntervalMs: 1000,
      avoidImmediateRepeat: true,
    };
    manifest.transitions[0].triggers = [{ id: "sit-timeout", event: "inactivity", enabled: true, timerDurationMs: 1000 }];
    for (const id of ["idle-breathe", "idle-ear"] as const) manifest.transitions.push({
      id,
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: `/${id}.webm`,
      tailFrameUri: "/sit.png",
      durationMs: 600,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      idleRule: { enabled: true, weight: 1, cooldownMs: 60_000 },
      triggers: [],
    });
    let now = 0;
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    expect(core.getSnapshot().nextIdleDueAt).toBe(0);
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("idle-breathe");
    now = 600;
    core.finishVideo(now);
    expect(core.getSnapshot().nextIdleDueAt).toBe(600);
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("idle-ear");
    now = 1200;
    core.finishVideo(now);
    expect(core.getSnapshot().nextTimedTrigger?.dueAt).toBe(1000);
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("sit-lie");
  });

  it("lets a timed hover interrupt a continuously playing idle animation", () => {
    const manifest = runtimeManifest();
    manifest.logicalStates[0].idleScheduler = {
      enabled: true,
      playbackMode: "continuous",
      strategy: "weighted-random",
      minIntervalMs: 1000,
      maxIntervalMs: 1000,
      avoidImmediateRepeat: true,
    };
    manifest.transitions.push({
      id: "idle-breathe",
      fromStateId: "sit",
      toStateId: "sit",
      videoUri: "/breathe.webm",
      tailFrameUri: "/sit.png",
      durationMs: 600,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      idleRule: { enabled: true, weight: 1, cooldownMs: 0 },
      triggers: [],
    }, {
      id: "hover-react",
      fromStateId: "sit",
      toStateId: "lie",
      videoUri: "/hover.webm",
      tailFrameUri: "/lie.png",
      durationMs: 700,
      endFrameSource: "video-frame",
      transparentVideo: true,
      authorityBridge: { mode: "hard-cut", durationMs: 200 },
      triggers: [{ id: "hover", event: "hover", enabled: true, hoverDurationMs: 200 }],
    });
    let now = 0;
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    core.fireDueSchedules(now);
    expect(core.getSnapshot().activeTransitionId).toBe("idle-breathe");
    core.movePointer({ x: 0.5, y: 0.5 }, now);
    expect(core.getSnapshot().nextHoverTrigger?.dueAt).toBe(200);
    now = 200;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("hover-react");
    expect(core.getSnapshot().events.some((event) => event.type === "transition-interrupted" && event.transitionId === "idle-breathe")).toBe(true);
  });

  it("repeats a self-transition while hovered and lets pointer-leave interrupt it immediately", () => {
    const manifest = runtimeManifest();
    manifest.transitions.push(
      {
        id: "belly-wiggle",
        fromStateId: "belly",
        toStateId: "belly",
        videoUri: "/belly-wiggle.webm",
        tailFrameUri: "/belly.png",
        durationMs: 600,
        endFrameSource: "source-frame",
        transparentVideo: true,
        authorityBridge: { mode: "hard-cut", durationMs: 200 },
        triggers: [{ id: "hover-loop", event: "hover", enabled: true, hoverDurationMs: 200, repeatWhileHovered: true }],
      },
      {
        id: "belly-lie",
        fromStateId: "belly",
        toStateId: "lie",
        videoUri: "/belly-lie.webm",
        tailFrameUri: "/lie.png",
        durationMs: 700,
        endFrameSource: "video-frame",
        transparentVideo: true,
        authorityBridge: { mode: "hard-cut", durationMs: 200 },
        triggers: [{ id: "leave", event: "pointer-leave", enabled: true }],
      },
    );
    let now = 0;
    const core = new PetRuntimeCore(manifest, { now: () => now });
    core.jumpToState("belly", now);
    core.movePointer({ x: 0.5, y: 0.5 }, now);
    expect(core.getSnapshot().nextHoverTrigger).toMatchObject({ transitionId: "belly-wiggle", dueAt: 200, repeatWhileHovered: true });
    now = 200;
    expect(core.fireDueSchedules(now)).toBe(true);
    expect(core.getSnapshot().activeTransitionId).toBe("belly-wiggle");
    now = 800;
    core.finishVideo(now);
    expect(core.getSnapshot().nextHoverTrigger).toMatchObject({ transitionId: "belly-wiggle", dueAt: 800 });
    expect(core.fireDueSchedules(now)).toBe(true);
    now = 900;
    expect(core.leavePointer(now)).toEqual({ accepted: true });
    expect(core.getSnapshot().pointerInside).toBe(false);
    expect(core.getSnapshot().activeTransitionId).toBe("belly-lie");
    expect(core.getSnapshot().events.some((event) => event.type === "transition-interrupted" && event.transitionId === "belly-wiggle")).toBe(true);
    now = 1600;
    core.finishVideo(now);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "lie", activeTransitionId: null, phase: "idle" });
  });

  it("arms hover after entering a new state and does not restart the active hover loop on pointer movement", () => {
    const manifest = runtimeManifest();
    manifest.transitions.push({
      id: "belly-wiggle",
      fromStateId: "belly",
      toStateId: "belly",
      videoUri: "/belly-wiggle.webm",
      tailFrameUri: "/belly.png",
      durationMs: 4_000,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "crossfade", durationMs: 360 },
      triggers: [{ id: "hover-loop", event: "hover", enabled: true, hoverDurationMs: 500, repeatWhileHovered: true }],
    });
    let now = 0;
    const core = new PetRuntimeCore(manifest, { now: () => now, random: () => 0 });
    core.jumpToState("lie", now);
    core.movePointer({ x: 0.5, y: 0.5 }, now);
    expect(core.getSnapshot().nextHoverTrigger).toBeNull();

    expect(core.beginTransition("lie-belly", "pointer", now)).toEqual({ accepted: true });
    now = 900;
    core.finishVideo(now);
    now = 1_400;
    core.advanceBridge(now);
    expect(core.getSnapshot()).toMatchObject({ currentStateId: "belly", activeTransitionId: null, phase: "idle" });
    expect(core.getSnapshot().nextHoverTrigger).toMatchObject({ transitionId: "belly-wiggle", dueAt: 1_900 });

    now = 1_900;
    expect(core.fireDueSchedules(now)).toBe(true);
    const runId = core.getSnapshot().activeTransitionRunId;
    expect(core.getSnapshot().activeTransitionId).toBe("belly-wiggle");
    now = 2_000;
    core.movePointer({ x: 0.52, y: 0.5 }, now);
    expect(core.getSnapshot().nextHoverTrigger).toBeNull();
    now = 2_500;
    expect(core.fireDueSchedules(now)).toBe(false);
    expect(core.getSnapshot()).toMatchObject({ activeTransitionId: "belly-wiggle", activeTransitionRunId: runId, phase: "video" });
  });
});
