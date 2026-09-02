import { useEffect, useMemo, useState } from "react";
import { estimateImageGenerationCost, estimateVideoGenerationCost, type PersistentGenerationJob } from "@petlord/generation";
import type { CharacterProject } from "@petlord/schema";
import { resolveTransitionSourceArtifact } from "@petlord/state-engine";
import { summarizeGenerationBudget } from "../orderOperations";
import { deleteWorkspaceState, readWorkspaceState, saveWorkspaceState } from "../workspaceApi";

interface AutomaticProductionRun {
  projectId: string;
  status: "running" | "failed" | "complete";
  startedAt: string;
  submittedStateIds: string[];
  acceptedStateIds: string[];
  submittedTransitionIds: string[];
  error?: string;
}

interface AutomaticProductionActions {
  generateState: (stateId: string) => Promise<void>;
  activateStateReference: (stateId: string, artifactId: string) => void;
  generateTransition: (transitionId: string) => Promise<void>;
  approveTransition: (transitionId: string) => void;
}

function storageKey(projectId: string) {
  return `petlord.v3.automatic-production.${projectId}`;
}

function readLegacyRun(projectId: string): AutomaticProductionRun | undefined {
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    const parsed = raw ? JSON.parse(raw) as AutomaticProductionRun : undefined;
    return parsed?.projectId === projectId ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function findNextAutomaticApproval(project: CharacterProject) {
  return project.transitions.find((transition) => transition.status === "review" && transition.videoArtifactId);
}

export function useAutomaticProduction(
  project: CharacterProject,
  jobs: PersistentGenerationJob[],
  submissionBusy: boolean,
  actions: AutomaticProductionActions,
) {
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<AutomaticProductionRun | undefined>();
  const [runHydrated, setRunHydrated] = useState(false);
  const [working, setWorking] = useState(false);
  const budget = summarizeGenerationBudget(project);
  const identityReady = project.referenceArtifactIds.some((id) => project.artifacts.some((artifact) => artifact.id === id));
  const missingStates = project.logicalStates.filter((state) => !state.referenceArtifactId);
  const missingTransitions = project.transitions.filter((transition) => !transition.videoArtifactId);
  const pendingApprovals = project.transitions.filter((transition) => transition.status === "review" && transition.videoArtifactId);
  const imageCost = estimateImageGenerationCost(project.generationSettings.imageModel, project.generationSettings.imageCandidateCount);
  const estimatedCost = useMemo(() => {
    const stateMinimum = (imageCost?.minimumCny ?? 0) * missingStates.length;
    const stateMaximum = (imageCost?.maximumCny ?? 0) * missingStates.length;
    return missingTransitions.reduce((sum, transition) => {
      const estimate = estimateVideoGenerationCost({
        model: project.generationSettings.videoModel,
        resolution: project.generationSettings.videoResolution,
        durationMode: transition.durationMode,
        durationSeconds: transition.durationSeconds,
      });
      return {
        minimumCny: sum.minimumCny + (estimate?.minimumCny ?? 0),
        maximumCny: sum.maximumCny + (estimate?.maximumCny ?? 0),
      };
    }, { minimumCny: stateMinimum, maximumCny: stateMaximum });
  }, [imageCost?.maximumCny, imageCost?.minimumCny, missingStates.length, missingTransitions, project.generationSettings.videoModel, project.generationSettings.videoResolution]);
  const budgetExceeded = estimatedCost.maximumCny > budget.remainingCny + 1e-9;
  const total = project.logicalStates.length + project.transitions.length;
  const completed = project.logicalStates.filter((state) => state.referenceArtifactId).length
    + project.transitions.filter((transition) => transition.videoArtifactId).length;

  useEffect(() => {
    let cancelled = false;
    setRunHydrated(false);
    void readWorkspaceState<AutomaticProductionRun>(storageKey(project.id))
      .then((stored) => {
        if (cancelled) return;
        const next = stored?.projectId === project.id ? stored : readLegacyRun(project.id);
        setRun(next);
        setRunHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setRun(readLegacyRun(project.id));
          setRunHydrated(true);
        }
      });
    return () => { cancelled = true; };
  }, [project.id]);

  useEffect(() => {
    if (!runHydrated) return;
    if (run) void saveWorkspaceState(storageKey(project.id), run);
    else void deleteWorkspaceState(storageKey(project.id));
    localStorage.removeItem(storageKey(project.id));
  }, [project.id, run, runHydrated]);

  useEffect(() => {
    if (!run || run.status !== "running" || working || submissionBusy) return;
    const recentJobs = jobs.filter((job) => job.createdAt >= run.startedAt);

    const advance = async () => {
      const nextState = project.logicalStates.find((state) => !state.referenceArtifactId);
      if (nextState) {
        const candidates = project.artifacts
          .filter((artifact) => artifact.kind === "state-draft" && artifact.targetStateId === nextState.id)
          .sort((left, right) => (left.candidateIndex ?? 0) - (right.candidateIndex ?? 0));
        if (candidates[0] && !run.acceptedStateIds.includes(nextState.id)) {
          setWorking(true);
          actions.activateStateReference(nextState.id, candidates[0].id);
          setRun((current) => current ? { ...current, acceptedStateIds: [...new Set([...current.acceptedStateIds, nextState.id])] } : current);
          setWorking(false);
          return;
        }
        const latestJob = recentJobs.find((job) => job.trigger.entityType === "state" && job.trigger.entityId === nextState.id);
        if (latestJob?.status === "failed") {
          setRun((current) => current ? { ...current, status: "failed", error: `${nextState.label}：${latestJob.error ?? "图片生成失败"}` } : current);
          return;
        }
        if (!run.submittedStateIds.includes(nextState.id)) {
          setWorking(true);
          setRun((current) => current ? { ...current, submittedStateIds: [...current.submittedStateIds, nextState.id] } : current);
          try {
            await actions.generateState(nextState.id);
          } catch (caught) {
            setRun((current) => current ? { ...current, status: "failed", error: caught instanceof Error ? caught.message : "图片任务提交失败" } : current);
          }
          setWorking(false);
        }
        return;
      }

      const nextTransition = project.transitions.find((transition) => !transition.videoArtifactId);
      if (nextTransition) {
        const latestJob = recentJobs.find((job) => job.trigger.entityType === "transition" && job.trigger.entityId === nextTransition.id);
        if (latestJob?.status === "failed") {
          setRun((current) => current ? { ...current, status: "failed", error: `${nextTransition.label}：${latestJob.error ?? "视频生成失败"}` } : current);
          return;
        }
        const ready = Boolean(nextTransition.targetDraftArtifactId && resolveTransitionSourceArtifact(project, nextTransition.id));
        if (ready && !run.submittedTransitionIds.includes(nextTransition.id)) {
          setWorking(true);
          setRun((current) => current ? { ...current, submittedTransitionIds: [...current.submittedTransitionIds, nextTransition.id] } : current);
          try {
            await actions.generateTransition(nextTransition.id);
          } catch (caught) {
            setRun((current) => current ? { ...current, status: "failed", error: caught instanceof Error ? caught.message : "视频任务提交失败" } : current);
          }
          setWorking(false);
        }
        return;
      }

      const nextApproval = findNextAutomaticApproval(project);
      if (nextApproval) {
        setWorking(true);
        try {
          actions.approveTransition(nextApproval.id);
        } catch (caught) {
          setRun((current) => current ? {
            ...current,
            status: "failed",
            error: caught instanceof Error ? caught.message : `${nextApproval.label}：自动批准失败`,
          } : current);
        }
        setWorking(false);
        return;
      }

      setRun((current) => current ? { ...current, status: "complete" } : current);
    };
    void advance();
  }, [actions, jobs, project, run, submissionBusy, working]);

  function start() {
    if (submissionBusy || !identityReady || budgetExceeded || total === 0) return;
    setRun({
      projectId: project.id,
      status: "running",
      startedAt: new Date().toISOString(),
      submittedStateIds: [],
      acceptedStateIds: [],
      submittedTransitionIds: [],
    });
    setOpen(false);
  }

  function stop() {
    setRun(undefined);
    setWorking(false);
  }

  const stage = run?.status === "complete" ? "全部媒体已生成，等待逐条预览与批准"
    : run?.status === "failed" ? run.error ?? "自动制作遇到错误"
      : missingStates.length > 0 ? `正在制作状态图：剩余 ${missingStates.length} 个状态`
        : missingTransitions.length > 0 ? `正在制作过渡视频：剩余 ${missingTransitions.length} 条`
          : pendingApprovals.length > 0 ? `正在启用过渡：剩余 ${pendingApprovals.length} 条`
          : "准备开始";
  const blockedReason = submissionBusy ? "当前有任务正在提交，请稍后开始自动制作。"
    : !identityReady ? "请先为全局形象上传至少一张实拍参考图。"
    : budgetExceeded ? "完整流程的最高预估超过项目剩余额度。"
      : total === 0 ? "空白项目还没有可制作的状态。" : undefined;

  return { open, setOpen, run, working, budget, estimatedCost, budgetExceeded, identityReady, blockedReason, total, completed, stage, start, stop };
}

export type AutomaticProductionController = ReturnType<typeof useAutomaticProduction>;
