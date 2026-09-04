import type { Artifact, CharacterProject, GenerationJob } from "@petlord/schema";
import type { PersistentGenerationJob } from "@petlord/generation";
import { ensureTransitionMediaVersions } from "./transitionMedia";

const now = () => new Date().toISOString();

function localStatus(job: PersistentGenerationJob): GenerationJob["status"] {
  if (job.status === "succeeded" || job.status === "failed") return job.status;
  return job.status === "queued" ? "queued" : "running";
}

function localKind(job: PersistentGenerationJob): GenerationJob["kind"] {
  return job.kind === "state-image" ? "state-draft" : "transition";
}

export function reconcilePersistentJobs(
  current: CharacterProject,
  remoteJobs: PersistentGenerationJob[],
): CharacterProject {
  const relevant = remoteJobs.filter((job) => job.trigger.projectId === current.id);
  if (relevant.length === 0) return current;

  let changed = false;
  let artifacts = current.artifacts;
  let logicalStates = current.logicalStates;
  let transitions = current.transitions;
  let localJobs = current.jobs;

  for (const remote of relevant) {
    const existingJob = localJobs.find((job) => job.id === remote.id);
    const outputIds = artifacts.filter((artifact) => artifact.sourceJobId === remote.id).map((artifact) => artifact.id);
    const nextLocalJob: GenerationJob = {
      id: remote.id,
      kind: localKind(remote),
      status: localStatus(remote),
      progress: remote.progress,
      prompt: remote.trigger.label,
      provider: remote.provider ?? existingJob?.provider ?? "unknown",
      model: remote.model,
      createdAt: remote.createdAt,
      outputArtifactIds: outputIds,
      error: remote.error,
      assembledPrompt: remote.assembledPrompt ?? existingJob?.assembledPrompt,
      chromaKeyColor: remote.chromaKeyColor ?? existingJob?.chromaKeyColor,
      cost: remote.cost ?? existingJob?.cost,
    };
    if (!existingJob) {
      localJobs = [nextLocalJob, ...localJobs];
      changed = true;
    } else if (
      existingJob.status !== nextLocalJob.status ||
      existingJob.progress !== nextLocalJob.progress ||
      existingJob.error !== nextLocalJob.error ||
      existingJob.outputArtifactIds.join() !== outputIds.join() ||
      JSON.stringify(existingJob.cost) !== JSON.stringify(nextLocalJob.cost)
    ) {
      localJobs = localJobs.map((job) => job.id === remote.id ? nextLocalJob : job);
      changed = true;
    }

    if (remote.status === "failed" && remote.trigger.entityType === "transition") {
      const transition = transitions.find((candidate) => candidate.id === remote.trigger.entityId);
      if (transition && transition.status === "generating") {
        transitions = transitions.map((candidate) => candidate.id === transition.id
          ? { ...candidate, status: "failed" }
          : candidate);
        changed = true;
      }
    }

    if (remote.status !== "succeeded" || !remote.result) continue;
    const alreadyIntegrated = artifacts.some((artifact) => artifact.sourceJobId === remote.id);
    if (alreadyIntegrated) continue;

    if (remote.kind === "state-image" && (remote.result.images?.length || remote.result.image)) {
      const media = remote.result.images?.length ? remote.result.images : remote.result.image ? [remote.result.image] : [];
      const candidates: Artifact[] = media.map((image, index) => ({
        id: `artifact-draft-${remote.id}-${index + 1}`,
        kind: "state-draft",
        uri: image.uri,
        mimeType: image.mimeType,
        createdAt: remote.updatedAt,
        sourceJobId: remote.id,
        provenance: "generated",
        targetStateId: remote.trigger.entityId,
        candidateGroupId: remote.id,
        candidateIndex: index,
        label: `${remote.trigger.label} · 候选 ${index + 1}`,
      }));
      artifacts = [...artifacts, ...candidates];
      localJobs = localJobs.map((job) => job.id === remote.id
        ? { ...job, outputArtifactIds: candidates.map((candidate) => candidate.id) }
        : job);
      changed = true;
    }

    if (remote.kind === "transition-video" && remote.result.video && remote.result.tail) {
      const durationMs = remote.result.durationMs;
      const videoId = `artifact-video-${remote.id}`;
      const tailId = `artifact-tail-auto-${remote.id}`;
      const outputs: Artifact[] = [
        {
          id: videoId,
          kind: "transition-video",
          uri: remote.result.video.uri,
          mimeType: remote.result.video.mimeType,
          createdAt: remote.updatedAt,
          sourceJobId: remote.id,
          provenance: "generated",
          pixelWidth: remote.result.video.pixelWidth,
          pixelHeight: remote.result.video.pixelHeight,
          silent: remote.result.video.silent,
          hasAlpha: remote.result.video.hasAlpha,
          transparencyMethod: remote.result.video.transparencyMethod,
          alphaCoverage: remote.result.video.alphaCoverage,
          label: remote.result.video.transparencyMethod === "apple-vision-foreground-mask"
            ? `${remote.trigger.label} · Apple Vision 透明视频`
            : `${remote.trigger.label} · 原始视频`,
        },
        {
          id: tailId,
          kind: "state-actual",
          uri: remote.result.tail.uri,
          mimeType: remote.result.tail.mimeType,
          createdAt: remote.updatedAt,
          sourceJobId: remote.id,
          provenance: "generated",
          pixelWidth: remote.result.tail.pixelWidth,
          pixelHeight: remote.result.tail.pixelHeight,
          hasAlpha: remote.result.tail.hasAlpha,
          transparencyMethod: remote.result.tail.transparencyMethod,
          alphaCoverage: remote.result.tail.alphaCoverage,
          label: remote.result.tail.transparencyMethod === "apple-vision-foreground-mask"
            ? `${remote.trigger.label} · 智能抠图尾帧`
            : `${remote.trigger.label} · 自动尾帧`,
        },
      ];
      artifacts = [...artifacts, ...outputs];
      if (remote.trigger.entityType === "pointer-gaze") {
        logicalStates = logicalStates.map((state) => {
          if (state.id !== remote.trigger.entityId) return state;
          const currentGaze = state.pointerGaze ?? {
            enabled: true,
            motionTarget: "eyes" as const,
            activationRadius: 1.4,
            anchor: { x: 0.5, y: 0.5 },
            videoArtifactIds: [],
            segmentStartMs: 0,
            directionKeyframesMs: [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800] as [number, number, number, number, number, number, number, number],
            blendDurationMs: 240,
          };
          return {
            ...state,
            pointerGaze: {
              ...currentGaze,
              enabled: true,
              videoArtifactId: videoId,
              videoArtifactIds: [...new Set([...currentGaze.videoArtifactIds, videoId])],
              durationMs: durationMs ?? currentGaze.durationMs,
              segmentStartMs: 0,
              segmentEndMs: durationMs,
            },
          };
        });
      } else transitions = transitions.map((transition) => transition.id === remote.trigger.entityId
        ? (() => {
            const versionId = `media-version-${remote.id}`;
            const previousVersions = ensureTransitionMediaVersions(transition, artifacts.filter((artifact) => !outputs.includes(artifact)));
            return {
              ...transition,
              status: "review" as const,
              videoArtifactId: videoId,
              extractedTailArtifactId: tailId,
              durationMs: durationMs ?? transition.durationMs,
              sourceVideoDurationMs: durationMs ?? transition.sourceVideoDurationMs,
              selectedEndMs: durationMs ?? transition.selectedEndMs,
              playback: {
                mode: "forward" as const,
                repeatMode: "fixed" as const,
                minCycles: 1,
                maxCycles: 1,
                segmentStartMs: 0,
              },
              mediaVersions: [...previousVersions.filter((version) => version.sourceJobId !== remote.id), {
                id: versionId,
                label: `${remote.trigger.label} · 生成 ${previousVersions.length + 1}`,
                videoArtifactId: videoId,
                tailArtifactId: tailId,
                createdAt: remote.updatedAt,
                sourceJobId: remote.id,
                transparent: remote.result?.video?.hasAlpha ?? false,
                durationMs: durationMs ?? transition.durationMs,
                selectedEndMs: durationMs ?? transition.selectedEndMs,
                generationPrompt: remote.assembledPrompt ?? transition.lastGenerationPrompt,
                generationModel: remote.model ?? transition.lastGenerationModel,
                chromaKeyColor: remote.chromaKeyColor ?? transition.lastChromaKeyColor,
                playback: {
                  mode: "forward" as const,
                  repeatMode: "fixed" as const,
                  minCycles: 1,
                  maxCycles: 1,
                  segmentStartMs: 0,
                },
              }],
              activeMediaVersionId: versionId,
            };
          })()
        : transition);
      localJobs = localJobs.map((job) => job.id === remote.id
        ? { ...job, outputArtifactIds: [videoId, tailId] }
        : job);
      changed = true;
    }
  }

  return changed
    ? { ...current, artifacts, logicalStates, transitions, jobs: localJobs, updatedAt: now() }
    : current;
}
