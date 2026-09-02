import { describe, expect, it } from "vitest";
import { petPackageManifestSchema, type IdleScheduler, type PetPackageManifest, type RuntimeTransition } from "@petlord/schema";
import {
  findPathToLogicalState,
  computeAuthorityBridgeProgress,
  computeIdleDelay,
  findNextRuntimeTimerTrigger,
  findRuntimeTrigger,
  pointIsInsideInteractionRegion,
  resolveSemanticAction,
  selectIdleTransition,
} from "./index";

const manifest: PetPackageManifest = {
  manifestVersion: 1,
  id: "pet-momo",
  name: "Momo graph",
  characterName: "Momo",
  initialStateId: "sit-a",
  states: [
    { id: "sit-a", logicalStateId: "sit", label: "坐着 A", imageUri: "sit.png", origin: "initial" },
    { id: "lie-a", logicalStateId: "lie", label: "趴下 A", imageUri: "lie-tail.png", origin: "transition-tail" },
    { id: "belly-a", logicalStateId: "belly", label: "翻肚皮 A", imageUri: "belly-tail.png", origin: "transition-tail" },
  ],
  transitions: [
    {
      id: "sit-lie",
      fromStateId: "sit-a",
      toStateId: "lie-a",
      videoUri: "sit-lie.webm",
      tailFrameUri: "lie-tail.png",
      durationMs: 2200,
      endFrameSource: "video-frame",
      transparentVideo: false,
      authorityBridge: { mode: "crossfade", durationMs: 360 },
      triggers: [{
        id: "hover-body",
        event: "hover",
        enabled: true,
        hoverDurationMs: 900,
        region: { shape: "ellipse", x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
      }],
    },
    { id: "lie-belly", fromStateId: "lie-a", toStateId: "belly-a", videoUri: "lie-belly.webm", tailFrameUri: "belly-tail.png", durationMs: 1800, endFrameSource: "video-frame", transparentVideo: false, authorityBridge: { mode: "crossfade", durationMs: 360 }, triggers: [] },
  ],
  logicalStates: [
    { id: "sit", label: "坐着", variantIds: ["sit-a"], idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true } },
    { id: "lie", label: "趴下", variantIds: ["lie-a"], idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true } },
    { id: "belly", label: "翻肚皮", variantIds: ["belly-a"], idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true } },
  ],
  semanticActions: { idle: "sit", rest: "lie", celebrate: "belly" },
  plugins: [],
};

describe("pet package continuity", () => {
  it("accepts an exact transition tail as the target still", () => {
    const parsed = petPackageManifestSchema.parse(manifest);
    expect(parsed.states).toHaveLength(3);
    expect(parsed.transitions[0]?.triggers[0]).toMatchObject({ event: "hover", hoverDurationMs: 900 });
  });

  it("retains per-state pointer gaze configuration in the runtime manifest", () => {
    const withGaze = structuredClone(manifest);
    withGaze.logicalStates[0].pointerGaze = { enabled: true, motionTarget: "head", activationRadius: 1.4, segmentStartMs: 0 };
    expect(petPackageManifestSchema.parse(withGaze).logicalStates[0]?.pointerGaze)
      .toEqual({ enabled: true, motionTarget: "head", activationRadius: 1.4, segmentStartMs: 0 });
  });

  it("rejects a target still that differs from the extracted tail", () => {
    const broken = structuredClone(manifest);
    broken.transitions[0].tailFrameUri = "reference-target.png";
    expect(() => petPackageManifestSchema.parse(broken)).toThrow(/selected end frame/i);
  });

  it("accepts a retained authority reference when the user selects it as the runtime endpoint", () => {
    const withReferenceEnd = structuredClone(manifest);
    withReferenceEnd.states[1] = {
      ...withReferenceEnd.states[1],
      imageUri: "lie-reference.png",
      origin: "reference",
    };
    withReferenceEnd.transitions[0] = {
      ...withReferenceEnd.transitions[0],
      tailFrameUri: "lie-reference.png",
      endFrameSource: "authority-reference",
      authorityBridge: { mode: "blur-dissolve", durationMs: 500 },
    };
    expect(petPackageManifestSchema.parse(withReferenceEnd).transitions[0]?.endFrameSource)
      .toBe("authority-reference");
    expect(petPackageManifestSchema.parse(withReferenceEnd).transitions[0]?.authorityBridge.mode)
      .toBe("blur-dissolve");
  });
});

describe("variant-aware routing", () => {
  it("finds the shortest concrete path to a logical state", () => {
    expect(findPathToLogicalState(manifest, "sit-a", "belly")?.map((edge) => edge.id)).toEqual([
      "sit-lie",
      "lie-belly",
    ]);
  });

  it("resolves semantic plugin actions without hard-coded state ids", () => {
    expect(resolveSemanticAction(manifest, "sit-a", "rest")?.[0]?.id).toBe("sit-lie");
    expect(resolveSemanticAction(manifest, "sit-a", "unknown")).toBeNull();
  });
});

describe("runtime trigger matching", () => {
  it("matches rectangle and ellipse hit regions in normalized coordinates", () => {
    expect(pointIsInsideInteractionRegion(
      { x: 0.2, y: 0.2 },
      { shape: "rectangle", x: 0.1, y: 0.1, width: 0.4, height: 0.3 },
    )).toBe(true);
    expect(pointIsInsideInteractionRegion(
      { x: 0.1, y: 0.1 },
      { shape: "ellipse", x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    )).toBe(false);
    expect(pointIsInsideInteractionRegion(
      { x: 0.5, y: 0.5 },
      { shape: "ellipse", x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    )).toBe(true);
  });

  it("returns only an enabled trigger for the requested pointer event", () => {
    const result = findRuntimeTrigger(manifest.transitions, "hover", { x: 0.5, y: 0.5 });
    expect(result?.transition.id).toBe("sit-lie");
    expect(findRuntimeTrigger(manifest.transitions, "left-click", { x: 0.5, y: 0.5 })).toBeNull();
    expect(findRuntimeTrigger(manifest.transitions, "hover", { x: 0.01, y: 0.01 })).toBeNull();
  });

  it("schedules inactivity from the later of state entry and the last interaction", () => {
    const timed = structuredClone(manifest.transitions[0]);
    timed.triggers = [{
      id: "rest-long-enough",
      event: "inactivity",
      enabled: true,
      timerDurationMs: 60_000,
    }];
    expect(findNextRuntimeTimerTrigger({
      transitions: [timed],
      stateEnteredAt: 20_000,
      lastInteractionAt: 40_000,
    })).toMatchObject({ transition: { id: "sit-lie" }, trigger: { event: "inactivity" }, dueAt: 100_000 });
  });

  it("does not reset a state timeout when the user interacts", () => {
    const timed = structuredClone(manifest.transitions[0]);
    timed.triggers = [{
      id: "temporary-state-finished",
      event: "state-timeout",
      enabled: true,
      timerDurationMs: 10_000,
    }];
    expect(findNextRuntimeTimerTrigger({
      transitions: [timed],
      stateEnteredAt: 1_000,
      lastInteractionAt: 7_500,
    })?.dueAt).toBe(11_000);
  });
});

describe("authority reference bridge", () => {
  it("eases a frozen video endpoint into the authority frame over the configured post-roll", () => {
    const bridge = { mode: "crossfade" as const, durationMs: 500 };
    expect(computeAuthorityBridgeProgress({ elapsedMs: 0, bridge })).toBe(0);
    expect(computeAuthorityBridgeProgress({ elapsedMs: 250, bridge })).toBe(0.5);
    expect(computeAuthorityBridgeProgress({ elapsedMs: 500, bridge })).toBe(1);
    expect(computeAuthorityBridgeProgress({ elapsedMs: 900, bridge })).toBe(1);
    expect(computeAuthorityBridgeProgress({ elapsedMs: 500, bridge: { mode: "hard-cut", durationMs: 500 } })).toBe(0);
  });
});

describe("idle animation scheduling", () => {
  const scheduler: IdleScheduler = {
    enabled: true,
    strategy: "weighted-random",
    minIntervalMs: 8000,
    maxIntervalMs: 18_000,
    avoidImmediateRepeat: false,
  };
  const idleTransitions: RuntimeTransition[] = [
    {
      id: "idle-breathe",
      fromStateId: "sit-a",
      toStateId: "sit-a",
      videoUri: "breathe.webm",
      tailFrameUri: "sit.png",
      durationMs: 2400,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "crossfade", durationMs: 360 },
      idleRule: { enabled: true, weight: 1, cooldownMs: 0 },
      triggers: [],
    },
    {
      id: "idle-ear",
      fromStateId: "sit-a",
      toStateId: "sit-a",
      videoUri: "ear.webm",
      tailFrameUri: "sit.png",
      durationMs: 2100,
      endFrameSource: "source-frame",
      transparentVideo: true,
      authorityBridge: { mode: "crossfade", durationMs: 360 },
      idleRule: { enabled: true, weight: 3, cooldownMs: 0 },
      triggers: [],
    },
  ];

  it("uses weights as probability mass for random selection", () => {
    expect(selectIdleTransition({ transitions: idleTransitions, scheduler, now: 1000, randomValue: 0.1, roundRobinCursor: 0 })?.transition.id).toBe("idle-breathe");
    expect(selectIdleTransition({ transitions: idleTransitions, scheduler, now: 1000, randomValue: 0.9, roundRobinCursor: 0 })?.transition.id).toBe("idle-ear");
  });

  it("uses weights as repeated slots for deterministic round robin", () => {
    const roundRobin = { ...scheduler, strategy: "weighted-round-robin" as const };
    const sequence = [0, 1, 2, 3].map((cursor) => selectIdleTransition({
      transitions: idleTransitions,
      scheduler: roundRobin,
      now: 1000,
      randomValue: 0,
      roundRobinCursor: cursor,
    })?.transition.id);
    expect(sequence).toEqual(["idle-breathe", "idle-ear", "idle-ear", "idle-ear"]);
  });

  it("honors cooldowns and computes a bounded randomized delay", () => {
    const selected = selectIdleTransition({
      transitions: idleTransitions,
      scheduler,
      now: 15_000,
      randomValue: 0,
      roundRobinCursor: 0,
      lastPlayedAt: { "idle-breathe": 14_000 },
    });
    expect(selected?.transition.id).toBe("idle-breathe");
    const cooling = structuredClone(idleTransitions);
    cooling[0].idleRule = { enabled: true, weight: 1, cooldownMs: 5000 };
    expect(selectIdleTransition({ transitions: cooling, scheduler, now: 15_000, randomValue: 0, roundRobinCursor: 0, lastPlayedAt: { "idle-breathe": 14_000 } })?.transition.id).toBe("idle-ear");
    expect(computeIdleDelay(scheduler, 0)).toBe(8000);
    expect(computeIdleDelay(scheduler, 0.5)).toBe(13_000);
    expect(computeIdleDelay({ ...scheduler, playbackMode: "continuous" }, 0.5)).toBe(0);
  });
});
