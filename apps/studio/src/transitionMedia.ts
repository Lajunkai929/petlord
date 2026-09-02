import type { Artifact, Transition, TransitionMediaVersion } from "@petlord/schema";

export function ensureTransitionMediaVersions(transition: Transition, artifacts: Artifact[]): TransitionMediaVersion[] {
  if ((transition.mediaVersions?.length ?? 0) > 0) return transition.mediaVersions;
  if (!transition.videoArtifactId || !transition.extractedTailArtifactId) return [];
  const video = artifacts.find((artifact) => artifact.id === transition.videoArtifactId);
  return [{
    id: `media-version-${transition.videoArtifactId}`,
    label: video?.label ?? `${transition.label} · 历史版本`,
    videoArtifactId: transition.videoArtifactId,
    tailArtifactId: transition.extractedTailArtifactId,
    createdAt: video?.createdAt ?? "1970-01-01T00:00:00.000Z",
    sourceJobId: video?.sourceJobId,
    transparent: video?.hasAlpha ?? false,
    durationMs: transition.sourceVideoDurationMs ?? transition.durationMs,
    selectedEndMs: transition.selectedEndMs,
    generationPrompt: transition.lastGenerationPrompt,
    generationModel: transition.lastGenerationModel,
    chromaKeyColor: transition.lastChromaKeyColor,
    playback: transition.playback,
  }];
}

export function resolveActiveMediaVersion(transition: Transition, artifacts: Artifact[]) {
  const versions = ensureTransitionMediaVersions(transition, artifacts);
  return versions.find((version) => version.id === transition.activeMediaVersionId) ??
    versions.find((version) => version.videoArtifactId === transition.videoArtifactId) ??
    versions.at(-1);
}
