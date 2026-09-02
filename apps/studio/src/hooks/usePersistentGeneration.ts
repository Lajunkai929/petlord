import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { listPersistentJobs, type PersistentGenerationJob } from "@petlord/generation";
import type { CharacterProject } from "@petlord/schema";
import { reconcilePersistentJobs } from "../jobReconciler";

export function usePersistentGeneration(
  project: CharacterProject,
  setProject: Dispatch<SetStateAction<CharacterProject>>,
) {
  const [persistentJobs, setPersistentJobs] = useState<PersistentGenerationJob[]>([]);
  const projectJobs = persistentJobs.filter((job) => job.trigger.projectId === project.id);
  const activeJobs = projectJobs.filter((job) => ["queued", "submitting", "running"].includes(job.status));
  const allActiveJobs = persistentJobs.filter((job) => ["queued", "submitting", "running"].includes(job.status));

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const jobs = await listPersistentJobs();
        if (cancelled) return;
        setPersistentJobs(jobs);
        setProject((current) => reconcilePersistentJobs(current, jobs));
      } catch {
        // Health feedback is handled by the studio controller. Preserve the last useful snapshot.
      }
      if (!cancelled) timer = window.setTimeout(poll, allActiveJobs.length > 0 ? 1800 : 5000);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [allActiveJobs.length, project.id, setProject]);

  function upsertPersistentJob(job: PersistentGenerationJob) {
    setPersistentJobs((current) => [job, ...current.filter((candidate) => candidate.id !== job.id)]);
  }

  return { projectJobs, activeJobs, allJobs: persistentJobs, allActiveJobs, upsertPersistentJob };
}
