import { describe, expect, it } from "vitest";
import { buildStateDraftJobSubmission, buildTransitionJobSubmission, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "./index";

const settings = { imageModel: DEFAULT_IMAGE_MODEL, imageMode: "native-image" as const, imageResolution: "2K" as const, imageCandidateCount: 2, videoModel: DEFAULT_VIDEO_MODEL, videoResolution: "480p" as const, ratio: "1:1" as const, durationMode: "smart" as const };
const trigger = { projectId: "project", entityType: "state" as const, entityId: "sit", label: "坐着" };

describe("shared headless generation request assembly", () => {
  it("assembles the same state generation contract using a server-side reference resolver", async () => {
    const result = await buildStateDraftJobSubmission({ jobId: "job", trigger, settings, identityReferenceUris: ["/api/media/reference.png"], identityPrompt: "black and tan", stylePrompt: "farm pixel", targetStateLabel: "坐着", prompt: "front paws together" }, async uri => `resolved:${uri}`);
    expect(result).toMatchObject({ id: "job", kind: "state-image", capability: "image", model: DEFAULT_IMAGE_MODEL, request: { referenceImages: ["resolved:/api/media/reference.png"], candidateCount: 2, resolution: "2K" } });
    expect(result.assembledPrompt).toContain("front paws together");
  });
  it("preserves the selected first/last frames and transparency settings for video generation", async () => {
    const result = await buildTransitionJobSubmission({ jobId: "job", trigger: { ...trigger, entityType: "transition", entityId: "lie" }, settings, fromStateImageUri: "sit.png", targetDraftImageUri: "rest.png", identityReferenceUris: [], identityPrompt: "Lottery", stylePrompt: "cozy", prompt: "lie down", durationMode: "fixed", durationSeconds: 4, transparentVideo: true, transparencyKeyColor: "#00FF00", transparencySimilarity: 0.34, chromaBackgroundColor: "#00FF00" }, async uri => `resolved:${uri}`);
    expect(result).toMatchObject({ kind: "transition-video", capability: "video", request: { firstFrame: "resolved:sit.png", lastFrame: "resolved:rest.png", durationSeconds: 4 }, postprocess: { transparentVideo: true, resolution: "480p", keyColor: "#00FF00", similarity: 0.34 } });
  });
});
