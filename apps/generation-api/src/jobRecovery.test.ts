import { describe, expect, it } from "vitest";
import { recoverGenerationJobAfterRestart } from "./jobRecovery";

const base = { progress: 20, updatedAt: "2026-09-01T00:00:00.000Z" };

describe("generation job restart recovery", () => {
  it("does not automatically resubmit an ambiguous image request", () => {
    const recovered = recoverGenerationJobAfterRestart({ ...base, providerId: "provider-image", providerCapability: "image" as const, status: "running" as const });
    expect(recovered.job.status).toBe("failed");
    expect((recovered.job as { error?: string }).error).toContain("避免重复计费");
  });

  it("does not resume a job whose Provider selection was not persisted", () => {
    const recovered = recoverGenerationJobAfterRestart({ ...base, providerCapability: "video" as const, status: "submitting" as const });
    expect(recovered.job.status).toBe("failed");
    expect((recovered.job as { error?: string }).error).toContain("Provider selection");
  });

  it("continues polling a video when its provider id is known", () => {
    const recovered = recoverGenerationJobAfterRestart({ ...base, providerId: "provider-video", providerCapability: "video" as const, status: "running" as const, remoteTaskId: "cgt-known" });
    expect(recovered.job).toMatchObject({ status: "queued", remoteTaskId: "cgt-known" });
  });

  it("keeps a never-submitted queued job eligible for its first submission", () => {
    expect(recoverGenerationJobAfterRestart({
      ...base,
      providerId: "provider-image",
      providerCapability: "image" as const,
      providerRequest: { prompt: "hello" },
      status: "queued" as const,
    }).changed).toBe(false);
  });
});
