import { describe, expect, it } from "vitest";
import { recoverGenerationJobAfterRestart } from "./jobRecovery";

const base = { progress: 20, updatedAt: "2026-09-01T00:00:00.000Z" };

describe("generation job restart recovery", () => {
  it("does not automatically resubmit an ambiguous image request", () => {
    const recovered = recoverGenerationJobAfterRestart({ ...base, arkType: "image" as const, status: "running" as const });
    expect(recovered.job.status).toBe("failed");
    expect((recovered.job as { error?: string }).error).toContain("避免重复计费");
  });

  it("does not automatically resubmit a video whose provider id was not persisted", () => {
    expect(recoverGenerationJobAfterRestart({ ...base, arkType: "video" as const, status: "submitting" as const }).job.status).toBe("failed");
  });

  it("continues polling a video when its provider id is known", () => {
    const recovered = recoverGenerationJobAfterRestart({ ...base, arkType: "video" as const, status: "running" as const, remoteTaskId: "cgt-known" });
    expect(recovered.job).toMatchObject({ status: "queued", remoteTaskId: "cgt-known" });
  });

  it("keeps a never-submitted queued job eligible for its first submission", () => {
    expect(recoverGenerationJobAfterRestart({ ...base, arkType: "image" as const, status: "queued" as const }).changed).toBe(false);
  });
});
