import { useEffect, useMemo, useState } from "react";
import {
  assembleStateDraftPrompt,
  assembleTransitionPrompt,
  estimateImageGenerationCost,
  estimateVideoGenerationCost,
  listPersistentJobs,
  materializePromptVariables,
  submitStateDraftJob,
  submitTransitionJob,
  type GeneratedMedia,
  type PersistentGenerationJob,
} from "@petlord/generation";
import { providerModelSelection } from "./providerModelSelection";
import { toast } from "sonner";
import { projectTemplates } from "../projectTemplates";
import type { StyleProfile } from "../styleLibrary";
import type { StudioController } from "./useStudioController";

const activeStatuses = new Set(["queued", "submitting", "running"]);

function committedCost(jobs: PersistentGenerationJob[]) {
  return jobs.reduce((sum, job) => {
    if (job.status === "failed") return sum;
    return sum + (job.cost?.actualCny ?? job.cost?.estimatedMaxCny ?? 0);
  }, 0);
}

function mediaFromImageJob(job?: PersistentGenerationJob): GeneratedMedia[] {
  if (!job?.result) return [];
  if (job.result.images?.length) return job.result.images;
  return job.result.image ? [job.result.image] : [];
}

export function useStyleExperimentLab(studio: StudioController, profile?: StyleProfile) {
  const [selectedIdentityId, setSelectedIdentityId] = useState(studio.activeIdentity?.id ?? studio.identities[0]?.id ?? "");
  const [targetStateLabel, setTargetStateLabel] = useState("坐着");
  const [statePrompt, setStatePrompt] = useState("端正但放松地坐着，正面略偏 3/4 视角看向用户，五官清楚，四肢与尾巴轮廓互不粘连");
  const [videoActionPrompt, setVideoActionPrompt] = useState("保持坐姿和身体位置稳定，胸腹持续轻微呼吸，自然眨眼一次，两只耳朵先后轻轻抖动，最后回到完全相同的坐姿");
  const [candidateCount, setCandidateCount] = useState(3);
  const [selectedImageUri, setSelectedImageUri] = useState<string>();
  const [jobs, setJobs] = useState<PersistentGenerationJob[]>([]);
  const [allJobs, setAllJobs] = useState<PersistentGenerationJob[]>([]);
  const [loading, setLoading] = useState(false);
  const labProjectId = profile ? `style-lab:${profile.id}` : "";
  const identity = studio.identities.find((candidate) => candidate.id === selectedIdentityId) ?? studio.identities[0];

  async function refreshJobs() {
    if (!labProjectId) return;
    try {
      const all = await listPersistentJobs();
      setAllJobs(all);
      setJobs(all.filter((job) => job.trigger.projectId === labProjectId).sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
    } catch {
      // The API health indicator already reports connectivity; keep the last successful lab state here.
    }
  }

  useEffect(() => {
    void refreshJobs();
  }, [labProjectId]);

  useEffect(() => {
    if (!jobs.some((job) => activeStatuses.has(job.status))) return;
    const interval = window.setInterval(() => void refreshJobs(), 2_000);
    return () => window.clearInterval(interval);
  }, [jobs, labProjectId]);

  const latestImageJob = jobs.find((job) => job.kind === "state-image" && job.status === "succeeded");
  const latestVideoJob = jobs.find((job) => job.kind === "transition-video" && job.status === "succeeded");
  const imageCandidates = useMemo(() => mediaFromImageJob(latestImageJob), [latestImageJob]);

  useEffect(() => {
    if (imageCandidates.length > 0 && !imageCandidates.some((candidate) => candidate.uri === selectedImageUri)) {
      setSelectedImageUri(imageCandidates[0]?.uri);
    }
  }, [imageCandidates, selectedImageUri]);

  const imageSettings = useMemo(() => ({
    ...studio.project.generationSettings,
    imageCandidateCount: candidateCount,
    imageResolution: "2K" as const,
    ratio: "1:1" as const,
  }), [candidateCount, studio.project.generationSettings]);
  const videoSettings = useMemo(() => ({
    ...studio.project.generationSettings,
    videoResolution: "480p" as const,
    durationMode: "fixed" as const,
    durationSeconds: 4,
    ratio: "1:1" as const,
  }), [studio.project.generationSettings]);
  const imageEstimate = estimateImageGenerationCost(imageSettings.imageModel, candidateCount, providerModelSelection(studio.generationProviders.snapshot, "image", imageSettings.imageProviderId));
  const videoEstimate = estimateVideoGenerationCost({ model: videoSettings.videoModel, models: providerModelSelection(studio.generationProviders.snapshot, "video", videoSettings.videoProviderId), resolution: "480p", durationMode: "fixed", durationSeconds: 4 });
  const usedCny = committedCost(jobs);
  const budgetCny = profile?.experimentBudgetCny ?? 30;
  const remainingCny = Math.max(0, budgetCny - usedCny);
  const imageBusy = jobs.some((job) => job.kind === "state-image" && activeStatuses.has(job.status));
  const videoBusy = jobs.some((job) => job.kind === "transition-video" && activeStatuses.has(job.status));
  const activeImageJob = jobs.find((job) => job.kind === "state-image" && activeStatuses.has(job.status));
  const activeVideoJob = jobs.find((job) => job.kind === "transition-video" && activeStatuses.has(job.status));
  const statusLabel = (job?: PersistentGenerationJob) => {
    if (!job) return "准备中";
    if (job.status === "queued") {
      const ahead = allJobs.filter((candidate) => activeStatuses.has(candidate.status) && candidate.createdAt < job.createdAt).length;
      return ahead > 0 ? `排队中 · 前方 ${ahead} 项` : "排队中";
    }
    if (job.status === "submitting") return "正在提交";
    return `生成中 ${job.progress}%`;
  };
  const references = identity?.referenceArtifacts.map((artifact) => artifact.uri) ?? [];
  const imagePromptPreview = profile && identity ? assembleStateDraftPrompt({
    characterName: identity.name,
    identityReferenceUris: references,
    identityPrompt: identity.identityPrompt,
    stylePrompt: profile.imagePrompt,
    targetStateLabel,
    prompt: statePrompt,
    settings: imageSettings,
  }) : "";
  const videoPromptPreview = profile && identity ? assembleTransitionPrompt({
    characterName: identity.name,
    identityPrompt: identity.identityPrompt,
    stylePrompt: profile.videoPrompt,
    prompt: videoActionPrompt,
    settings: videoSettings,
    transparentVideo: true,
    chromaBackgroundColor: studio.project.videoBackground.autoColor,
  }) : "";

  async function generateImageTest() {
    if (!profile || !identity || references.length === 0 || imageBusy) return;
    if (!imageEstimate) { toast.error("请在模型服务中补充此图片模型的预估费用，再生成。"); return; }
    if (imageEstimate.maximumCny > remainingCny) {
      toast.error(`风格实验预算不足：剩余 ¥${remainingCny.toFixed(2)}，本次最高 ¥${imageEstimate.maximumCny.toFixed(2)}。`);
      return;
    }
    const jobId = crypto.randomUUID();
    studio.styleLibrary.snapshotProfile(profile.id, "image-test", jobId);
    setLoading(true);
    try {
      const job = await submitStateDraftJob({
        characterName: identity.name,
        jobId,
        trigger: { projectId: labProjectId, entityType: "state", entityId: `style-preview-${profile.id}`, label: `${profile.name} · 图片试验` },
        identityReferenceUris: references,
        identityPrompt: identity.identityPrompt,
        stylePrompt: profile.imagePrompt,
        targetStateLabel,
        prompt: statePrompt,
        settings: imageSettings,
      });
      setJobs((current) => [job, ...current.filter((candidate) => candidate.id !== job.id)]);
      toast.success("图片试验已提交，可离开页面后回来继续查看。", { duration: 5_000 });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "图片试验提交失败");
    } finally {
      setLoading(false);
    }
  }

  async function generateVideoTest() {
    if (!profile || !identity || !selectedImageUri || videoBusy) return;
    if (!videoEstimate) { toast.error("请在模型服务中补充此视频模型的预估费用，再生成。"); return; }
    if (videoEstimate.maximumCny > remainingCny) {
      toast.error(`风格实验预算不足：剩余 ¥${remainingCny.toFixed(2)}，本次最高 ¥${videoEstimate.maximumCny.toFixed(2)}。`);
      return;
    }
    const jobId = crypto.randomUUID();
    studio.styleLibrary.snapshotProfile(profile.id, "video-test", jobId);
    setLoading(true);
    try {
      const keyColor = studio.project.videoBackground.mode === "manual" ? studio.project.videoBackground.manualColor : studio.project.videoBackground.autoColor;
      const job = await submitTransitionJob({
        characterName: identity.name,
        jobId,
        trigger: { projectId: labProjectId, entityType: "transition", entityId: `style-motion-${profile.id}`, label: `${profile.name} · 视频试验` },
        fromStateImageUri: selectedImageUri,
        targetDraftImageUri: selectedImageUri,
        identityReferenceUris: references,
        identityPrompt: identity.identityPrompt,
        stylePrompt: profile.videoPrompt,
        prompt: videoActionPrompt,
        settings: videoSettings,
        durationMode: "fixed",
        durationSeconds: 4,
        transparentVideo: true,
        transparencyKeyColor: keyColor,
        transparencySimilarity: 0.34,
        chromaBackgroundColor: keyColor,
      });
      setJobs((current) => [job, ...current.filter((candidate) => candidate.id !== job.id)]);
      toast.success("视频试验已提交，完成后会保留原视频、透明视频和尾帧。", { duration: 5_000 });
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "视频试验提交失败");
    } finally {
      setLoading(false);
    }
  }

  function createStarterProject() {
    if (!profile || !identity) return;
    const starter = projectTemplates.find((template) => template.id === "starter");
    studio.createCustomerProject({
      identityProfileId: identity.id,
      styleProfileId: profile.id,
      projectName: `${identity.name} · 星露谷 2D 像素风`,
      stylePrompt: materializePromptVariables(profile.imagePrompt, identity.name),
      imageStylePrompt: materializePromptVariables(profile.imagePrompt, identity.name),
      videoStylePrompt: materializePromptVariables(profile.videoPrompt, identity.name),
      generationBudgetCny: 30,
      customerName: "内部风格验证",
      contact: "",
      characterName: identity.name,
      quotedPriceCny: 0,
      depositCny: 0,
      revisionLimit: 0,
      notes: "四状态星露谷 2D 像素风验证项目；图片与视频提示词来自风格实验室。",
      projectTemplateId: "starter",
      projectTemplate: starter,
    });
  }

  return {
    selectedIdentityId,
    setSelectedIdentityId,
    identity,
    targetStateLabel,
    setTargetStateLabel,
    statePrompt,
    setStatePrompt,
    videoActionPrompt,
    setVideoActionPrompt,
    candidateCount,
    setCandidateCount,
    selectedImageUri,
    setSelectedImageUri,
    jobs,
    latestImageJob,
    latestVideoJob,
    imageCandidates,
    imageBusy,
    videoBusy,
    imageStatusLabel: statusLabel(activeImageJob),
    videoStatusLabel: statusLabel(activeVideoJob),
    loading,
    imageEstimate,
    videoEstimate,
    usedCny,
    budgetCny,
    remainingCny,
    imagePromptPreview,
    videoPromptPreview,
    generateImageTest,
    generateVideoTest,
    createStarterProject,
  };
}
