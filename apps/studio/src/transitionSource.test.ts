import { describe, expect, it } from "vitest";
import { buildPetPackage, reconcileTransitionEndpointVariants, resolveTransitionSourceArtifact } from "@petlord/state-engine";
import { seedProject } from "./seed";

describe("transition source continuity", () => {
  it("repairs an approved transition when its endpoint switches from a video frame to the authority reference", () => {
    const project = structuredClone(seedProject);
    project.artifacts.push(
      {
        id: "artifact-sit-lie-video",
        kind: "transition-video",
        uri: "/generated/sit-lie.webm",
        mimeType: "video/webm",
        createdAt: "2026-08-30T09:00:00.000Z",
        provenance: "generated",
        silent: true,
        hasAlpha: true,
        label: "坐着到趴着视频",
      },
      {
        id: "artifact-lie-video-frame",
        kind: "state-actual",
        uri: "/generated/lie-tail.png",
        mimeType: "image/png",
        createdAt: "2026-08-30T09:00:00.000Z",
        provenance: "generated",
        hasAlpha: true,
        label: "趴着视频尾帧",
      },
    );
    project.variants.push({
      id: "variant-lie-video-frame",
      logicalStateId: "state-lying",
      label: "趴着 A",
      status: "approved",
      imageArtifactId: "artifact-lie-video-frame",
      origin: { kind: "transition-tail", transitionId: "transition-sitting-to-lying" },
    });
    project.transitions = project.transitions.map((transition) => transition.id === "transition-sitting-to-lying"
      ? {
          ...transition,
          status: "approved",
          toVariantId: "variant-lie-video-frame",
          videoArtifactId: "artifact-sit-lie-video",
          extractedTailArtifactId: "artifact-lie-video-frame",
          sourceVideoDurationMs: 4_000,
          endFrameSource: "authority-reference",
          authorityBridge: { mode: "crossfade", durationMs: 700 },
        }
      : transition);

    const repaired = reconcileTransitionEndpointVariants(project);
    const repairedTransition = repaired.transitions.find((transition) => transition.id === "transition-sitting-to-lying");
    const repairedVariant = repaired.variants.find((variant) => variant.id === repairedTransition?.toVariantId);
    expect(repairedVariant).toMatchObject({
      logicalStateId: "state-lying",
      imageArtifactId: "artifact-reference-lying",
      origin: { kind: "reference" },
    });
    expect(repaired.variants.find((variant) => variant.id === "variant-lie-video-frame")?.imageArtifactId)
      .toBe("artifact-lie-video-frame");
    expect(reconcileTransitionEndpointVariants(repaired).variants).toHaveLength(repaired.variants.length);

    const manifest = buildPetPackage(project);
    const runtimeTransition = manifest.transitions.find((transition) => transition.id === "transition-sitting-to-lying");
    expect(runtimeTransition).toMatchObject({
      tailFrameUri: "/demo/pip/state-lying.png",
      endFrameSource: "authority-reference",
      entryBlendMs: 420,
      authorityBridge: { mode: "crossfade", durationMs: 700 },
    });
    expect(manifest.states.find((state) => state.id === runtimeTransition?.toStateId)?.imageUri)
      .toBe("/demo/pip/state-lying.png");
  });

  it("uses an approved video frame as the next transition's first-frame reference", () => {
    const project = structuredClone(seedProject);
    project.artifacts.push({
      id: "artifact-lying-video-frame",
      kind: "state-actual",
      uri: "/generated/lying-at-3.6s.png",
      mimeType: "image/png",
      createdAt: "2026-08-30T09:00:00.000Z",
      provenance: "generated",
      pixelWidth: 480,
      pixelHeight: 480,
      hasAlpha: true,
      label: "趴着 · 视频选帧",
    });
    project.variants.push({
      id: "variant-lying-tail",
      logicalStateId: "state-lying",
      label: "趴着 A",
      status: "approved",
      imageArtifactId: "artifact-lying-video-frame",
      origin: { kind: "transition-tail", transitionId: "transition-sitting-to-lying" },
    });
    project.logicalStates = project.logicalStates.map((state) => state.id === "state-lying"
      ? { ...state, defaultVariantId: "variant-lying-tail" }
      : state);
    project.transitions.push({
      id: "transition-lying-to-belly-test",
      label: "趴着到翻肚皮",
      fromVariantId: "variant-lying-tail",
      toLogicalStateId: "state-belly",
      targetDraftArtifactId: "artifact-reference-belly",
      mediaVersions: [],
      endFrameSource: "video-frame",
      status: "target-ready",
      prompt: "自然翻身",
      durationMs: 4000,
      durationMode: "smart",
      transparentVideo: true,
      transparencyProcessing: { keyColor: "#00FF00", similarity: 0.34 },
      authorityBridge: { mode: "crossfade", durationMs: 360 },
      triggers: [],
    });

    expect(resolveTransitionSourceArtifact(project, "transition-lying-to-belly-test")?.uri)
      .toBe("/generated/lying-at-3.6s.png");
  });

  it("publishes an idle self-transition back to the exact same state variant", () => {
    const project = structuredClone(seedProject);
    project.logicalStates = project.logicalStates.map((state) => state.id === "state-sitting"
      ? { ...state, idleScheduler: { ...state.idleScheduler, enabled: true } }
      : state);
    project.artifacts.push({
      id: "artifact-idle-breathe-video",
      kind: "transition-video",
      uri: "/generated/idle-breathe.webm",
      mimeType: "video/webm",
      createdAt: "2026-08-30T09:00:00.000Z",
      provenance: "generated",
      silent: true,
      hasAlpha: true,
      label: "坐着轻微呼吸",
    });
    project.transitions.push({
      id: "transition-idle-breathe",
      label: "坐着 · 轻微呼吸",
      fromVariantId: "variant-sitting-a",
      toLogicalStateId: "state-sitting",
      toVariantId: "variant-sitting-a",
      targetDraftArtifactId: "artifact-reference-sitting",
      videoArtifactId: "artifact-idle-breathe-video",
      mediaVersions: [],
      endFrameSource: "source-frame",
      status: "approved",
      prompt: "轻微呼吸后回到原位",
      durationMs: 2600,
      sourceVideoDurationMs: 2600,
      durationMode: "smart",
      transparentVideo: true,
      transparencyProcessing: { keyColor: "#00FF00", similarity: 0.34 },
      authorityBridge: { mode: "crossfade", durationMs: 360 },
      idleRule: { enabled: true, weight: 3, cooldownMs: 20_000 },
      triggers: [],
    });

    const manifest = buildPetPackage(project);
    const idle = manifest.transitions.find((transition) => transition.id === "transition-idle-breathe");
    expect(idle).toMatchObject({
      fromStateId: "variant-sitting-a",
      toStateId: "variant-sitting-a",
      tailFrameUri: "/demo/pip/state-sitting.png",
      endFrameSource: "source-frame",
      idleRule: { weight: 3, cooldownMs: 20_000 },
    });
    expect(manifest.logicalStates.find((state) => state.id === "state-sitting")?.idleScheduler.enabled).toBe(true);
  });

  it("publishes runtime presentation separately from generation style", () => {
    const project = structuredClone(seedProject);
    project.runtimePresentation = { defaultFrameRate: 12, defaultRenderResolution: 96, pixelated: true };
    const manifest = buildPetPackage(project);
    expect(manifest.runtimePresentation).toEqual({
      defaultFrameRate: 12,
      defaultRenderResolution: 96,
      defaultPixelGridSize: 64,
      defaultDisplaySize: 320,
      pixelated: true,
    });
    expect(project.stylePrompt).not.toContain("96");
  });
});
