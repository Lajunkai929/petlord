import { describe, expect, it } from "vitest";
import type { PetPackageManifest } from "@petlord/schema";
import { buildPortablePetBundle, buildPortablePetBundleV2, encodePortablePetBundle } from "./portablePetPackage";
import { decodePetPackage, materializePackageManifest } from "../../../desktop/src/hooks/useDesktopPetPackage";

const manifest: PetPackageManifest = {
  manifestVersion: 1,
  id: "pet",
  name: "测试宠物",
  characterName: "Momo",
  runtimePresentation: { defaultFrameRate: 12, defaultRenderResolution: 96, pixelated: true },
  initialStateId: "sit",
  states: [{ id: "sit", logicalStateId: "idle", label: "坐着", imageUri: "/sit.png", origin: "initial" }],
  transitions: [],
  logicalStates: [{ id: "idle", label: "坐着", variantIds: ["sit"], idleScheduler: { enabled: false, strategy: "weighted-random", minIntervalMs: 8000, maxIntervalMs: 18_000, avoidImmediateRepeat: true } }],
  semanticActions: { idle: "idle" },
  plugins: [],
};

describe("portable pet package", () => {
  it("replaces runtime media URLs with self-contained data URLs", () => {
    const bundle = buildPortablePetBundle(
      manifest,
      new Map([["/sit.png", "data:image/png;base64,AAAA"]]),
      "2026-08-30T00:00:00.000Z",
    );
    expect(bundle.format).toBe("petlord-package");
    expect(bundle.manifest.states[0]?.imageUri).toBe("data:image/png;base64,AAAA");
  });

  it("deduplicates V2 assets, compresses the container, and verifies it in the desktop loader", async () => {
    const withDuplicate = {
      ...manifest,
      states: [
        ...manifest.states,
        { ...manifest.states[0]!, id: "sit-copy", imageUri: "/sit-copy.png" },
      ],
    };
    const dataUrl = "data:image/png;base64,AAAA";
    const bundle = await buildPortablePetBundleV2(withDuplicate, new Map([["/sit.png", dataUrl], ["/sit-copy.png", dataUrl]]), "2026-08-31T00:00:00.000Z");
    expect(bundle.bundleVersion).toBe(2);
    expect(Object.keys(bundle.assets)).toHaveLength(1);
    expect(bundle.manifest.states.every((state) => state.imageUri.startsWith("asset://"))).toBe(true);
    const encoded = await encodePortablePetBundle(bundle);
    expect(encoded[0]).toBe(0x1f);
    expect(encoded[1]).toBe(0x8b);
    const decoded = await decodePetPackage(encoded);
    expect(materializePackageManifest(decoded).states[0]?.imageUri).toBe(dataUrl);
    expect(decoded.manifest.runtimePresentation).toEqual({ defaultFrameRate: 12, defaultRenderResolution: 96, pixelated: true });
  });

  it("rejects a V2 asset whose content no longer matches its hash", async () => {
    const bundle = await buildPortablePetBundleV2(manifest, new Map([["/sit.png", "data:image/png;base64,AAAA"]]), "2026-08-31T00:00:00.000Z");
    const key = Object.keys(bundle.assets)[0]!;
    bundle.assets[key] = "data:image/png;base64,AAAB";
    await expect(decodePetPackage(new TextEncoder().encode(JSON.stringify(bundle)))).rejects.toThrow(/校验失败/);
  });

  it("embeds and restores pointer-gaze video assets", async () => {
    const withGaze: PetPackageManifest = {
      ...manifest,
      logicalStates: [{
        ...manifest.logicalStates[0]!,
        pointerGaze: { enabled: true, motionTarget: "head", activationRadius: 1.4, anchor: { x: 0.72, y: 0.3 }, videoUri: "/gaze.webm", durationMs: 6000, segmentStartMs: 0, segmentEndMs: 6000, directionKeyframesMs: [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800], blendDurationMs: 240 },
      }],
    };
    const image = "data:image/png;base64,AAAA";
    const video = "data:video/webm;base64,BBBB";
    const bundle = await buildPortablePetBundleV2(withGaze, new Map([["/sit.png", image], ["/gaze.webm", video]]));
    expect(bundle.manifest.logicalStates[0]?.pointerGaze?.videoUri).toMatch(/^asset:\/\//);
    expect(materializePackageManifest(bundle).logicalStates[0]?.pointerGaze?.videoUri).toBe(video);
  });
});
