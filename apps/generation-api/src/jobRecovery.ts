export interface RecoverableGenerationJob {
  status: "queued" | "submitting" | "running" | "succeeded" | "failed";
  providerId?: string;
  providerCapability?: "image" | "video";
  providerRequest?: unknown;
  remoteTaskId?: string;
  progress: number;
  error?: string;
  updatedAt: string;
}

export function recoverGenerationJobAfterRestart<T extends RecoverableGenerationJob>(job: T, now = new Date().toISOString()): { job: T; changed: boolean } {
  if (["succeeded", "failed"].includes(job.status)) return { job, changed: false };
  if (!job.providerId || !job.providerCapability) {
    return {
      job: {
        ...job,
        status: "failed",
        error: "This job was created before Provider selection was persisted. Configure a Provider and generate it again.",
        updatedAt: now,
      } as T,
      changed: true,
    };
  }
  if (job.status === "queued" && (job.providerRequest || job.remoteTaskId)) return { job, changed: false };
  if (job.providerCapability === "video" && job.remoteTaskId) {
    return { job: { ...job, status: "queued", updatedAt: now } as T, changed: true };
  }
  return {
    job: {
      ...job,
      status: "failed",
      error: "生成服务在提交期间重启。为避免重复计费，本任务没有自动重提；请确认 Provider 账单后手动重新生成。",
      updatedAt: now,
    } as T,
    changed: true,
  };
}
