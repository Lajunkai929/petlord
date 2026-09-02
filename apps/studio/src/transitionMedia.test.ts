import { describe, expect, it } from "vitest";
import { seedProject } from "./seed";
import { ensureTransitionMediaVersions, resolveActiveMediaVersion } from "./transitionMedia";

describe("transition media history", () => {
  it("defaults newly seeded transitions to transparent generation", () => {
    expect(seedProject.transitions.every((transition) => transition.transparentVideo)).toBe(true);
  });

  it("migrates legacy active media into a selectable normal-video version", () => {
    const project = structuredClone(seedProject);
    const transition = project.transitions[0];
    transition.videoArtifactId = "artifact-video-legacy";
    transition.extractedTailArtifactId = "artifact-tail-legacy";
    transition.sourceVideoDurationMs = 4100;
    project.artifacts.push(
      { id: "artifact-video-legacy", kind: "transition-video", uri: "/legacy.mp4", mimeType: "video/mp4", createdAt: "2026-08-30T09:00:00.000Z", provenance: "generated", hasAlpha: false, label: "普通原视频" },
      { id: "artifact-tail-legacy", kind: "state-actual", uri: "/legacy-tail.png", mimeType: "image/png", createdAt: "2026-08-30T09:00:00.000Z", provenance: "generated", hasAlpha: false, label: "普通尾帧" },
    );
    const versions = ensureTransitionMediaVersions(transition, project.artifacts);
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ transparent: false, durationMs: 4100, videoArtifactId: "artifact-video-legacy" });
  });

  it("resolves an explicitly activated transparent version without deleting history", () => {
    const project = structuredClone(seedProject);
    const transition = project.transitions[0];
    transition.mediaVersions = [
      { id: "normal", label: "普通原视频", videoArtifactId: "video-normal", tailArtifactId: "tail-normal", createdAt: "2026-08-30T09:00:00.000Z", transparent: false, durationMs: 4100 },
      { id: "alpha", label: "透明版本", videoArtifactId: "video-alpha", tailArtifactId: "tail-alpha", createdAt: "2026-08-30T09:01:00.000Z", transparent: true, durationMs: 4100 },
    ];
    transition.activeMediaVersionId = "alpha";
    expect(resolveActiveMediaVersion(transition, project.artifacts)?.id).toBe("alpha");
    expect(ensureTransitionMediaVersions(transition, project.artifacts)).toHaveLength(2);
  });
});
