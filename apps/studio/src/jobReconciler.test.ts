import { describe, expect, it } from "vitest";
import type { PersistentGenerationJob } from "@petlord/generation";
import { seedProject } from "./seed";
import { reconcilePersistentJobs } from "./jobReconciler";

describe("persistent state image reconciliation", () => {
  it("keeps the current authority frame until the user selects a generated candidate", () => {
    const project = structuredClone(seedProject);
    const originalAuthority = project.logicalStates.find((state) => state.id === "state-lying")?.referenceArtifactId;
    const job: PersistentGenerationJob = {
      id: "33333333-3333-4333-8333-333333333333",
      kind: "state-image",
      status: "succeeded",
      progress: 100,
      model: "doubao-seedream-5-0-260128",
      trigger: { projectId: project.id, entityType: "state", entityId: "state-lying", label: "趴着" },
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:01:00.000Z",
      result: {
        images: [1, 2, 3].map((index) => ({
          uri: `/generated/lying-${index}.png`,
          mimeType: "image/png",
          provider: "volcengine-ark",
          model: "doubao-seedream-5-0-260128",
        })),
      },
    };
    const reconciled = reconcilePersistentJobs(project, [job]);
    const candidates = reconciled.artifacts.filter((artifact) => artifact.candidateGroupId === job.id);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((artifact) => artifact.targetStateId === "state-lying")).toBe(true);
    expect(reconciled.logicalStates.find((state) => state.id === "state-lying")?.referenceArtifactId).toBe(originalAuthority);
    expect(reconciled.jobs.find((candidate) => candidate.id === job.id)?.outputArtifactIds).toHaveLength(3);
  });
});

describe("persistent transition reconciliation", () => {
  it("preserves the normalized silent square video contract and Alpha metadata", () => {
    const project = structuredClone(seedProject);
    const transitionId = "transition-sitting-to-lying";
    project.artifacts.push(
      { id: "artifact-video-old", kind: "transition-video", uri: "/api/media/old.mp4", mimeType: "video/mp4", createdAt: "2026-08-29T00:00:00.000Z", provenance: "generated", hasAlpha: false, label: "旧普通视频" },
      { id: "artifact-tail-old", kind: "state-actual", uri: "/api/media/old-tail.png", mimeType: "image/png", createdAt: "2026-08-29T00:00:00.000Z", provenance: "generated", hasAlpha: false, label: "旧尾帧" },
    );
    project.transitions = project.transitions.map((transition) => transition.id === transitionId ? {
      ...transition,
      videoArtifactId: "artifact-video-old",
      extractedTailArtifactId: "artifact-tail-old",
      mediaVersions: [{ id: "old-normal", label: "旧普通视频", videoArtifactId: "artifact-video-old", tailArtifactId: "artifact-tail-old", createdAt: "2026-08-29T00:00:00.000Z", transparent: false, durationMs: 4000 }],
      activeMediaVersionId: "old-normal",
    } : transition);
    const job: PersistentGenerationJob = {
      id: "44444444-4444-4444-8444-444444444444",
      kind: "transition-video",
      status: "succeeded",
      progress: 100,
      model: "doubao-seedance-2-0-mini-260615",
      assembledPrompt: "完整历史提示词",
      chromaKeyColor: "#00FF00",
      cost: { status: "settled", source: "provider-usage", estimatedMinCny: 0.89, estimatedMaxCny: 3.35, actualCny: 1.07, basis: "火山任务返回 46,522 个视频 token" },
      trigger: { projectId: project.id, entityType: "transition", entityId: transitionId, label: "坐着到趴着" },
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:01:00.000Z",
      result: {
        video: {
          uri: "/api/media/normalized.webm",
          mimeType: "video/webm",
          provider: "volcengine-ark",
          model: "doubao-seedance-2-0-mini-260615",
          pixelWidth: 480,
          pixelHeight: 480,
          silent: true,
          hasAlpha: true,
          transparencyMethod: "apple-vision-foreground-mask",
        },
        tail: {
          uri: "/api/media/normalized-tail.png",
          mimeType: "image/png",
          provider: "volcengine-ark",
          model: "doubao-seedance-2-0-mini-260615",
          pixelWidth: 480,
          pixelHeight: 480,
          hasAlpha: true,
          transparencyMethod: "apple-vision-foreground-mask",
        },
        durationMs: 4800,
      },
    };

    const reconciled = reconcilePersistentJobs(project, [job]);
    const video = reconciled.artifacts.find((artifact) => artifact.sourceJobId === job.id && artifact.kind === "transition-video");
    const tail = reconciled.artifacts.find((artifact) => artifact.sourceJobId === job.id && artifact.kind === "state-actual");
    expect(video).toMatchObject({ pixelWidth: 480, pixelHeight: 480, silent: true, hasAlpha: true });
    expect(tail).toMatchObject({ pixelWidth: 480, pixelHeight: 480, hasAlpha: true });
    expect(reconciled.transitions.find((transition) => transition.id === transitionId)).toMatchObject({
      status: "review",
      extractedTailArtifactId: tail?.id,
      durationMs: 4800,
      activeMediaVersionId: `media-version-${job.id}`,
    });
    const versions = reconciled.transitions.find((transition) => transition.id === transitionId)?.mediaVersions;
    expect(versions).toHaveLength(2);
    expect(versions?.some((version) => version.id === "old-normal")).toBe(true);
    expect(versions?.find((version) => version.id === `media-version-${job.id}`)).toMatchObject({
      generationPrompt: "完整历史提示词",
      generationModel: "doubao-seedance-2-0-mini-260615",
      chromaKeyColor: "#00FF00",
    });
    expect(reconciled.jobs.find((candidate) => candidate.id === job.id)?.cost).toMatchObject({ status: "settled", actualCny: 1.07 });
  });
});
