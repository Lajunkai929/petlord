import { useMemo, useState } from "react";
import type { CharacterProject, VideoBackgroundSettings } from "@petlord/schema";
import { calculateAutoChromaColor } from "../lib/chromaBackground";

export function useVideoBackgroundSettings(
  project: CharacterProject,
  updateProject: (updater: (current: CharacterProject) => CharacterProject) => void,
  inform: (message: string, kind?: "success" | "error" | "info") => void,
) {
  const [analyzing, setAnalyzing] = useState(false);
  const effectiveColor = project.videoBackground.mode === "manual"
    ? project.videoBackground.manualColor
    : project.videoBackground.autoColor;
  const referenceUris = useMemo(() => {
    const artifactIds = new Set(project.referenceArtifactIds);
    const initialVariant = project.variants.find((variant) => variant.id === project.initialVariantId);
    if (initialVariant) artifactIds.add(initialVariant.imageArtifactId);
    for (const state of project.logicalStates) {
      if (state.referenceArtifactId) artifactIds.add(state.referenceArtifactId);
    }
    return [...artifactIds]
      .map((id) => project.artifacts.find((artifact) => artifact.id === id)?.uri)
      .filter((uri): uri is string => Boolean(uri));
  }, [project.artifacts, project.initialVariantId, project.logicalStates, project.referenceArtifactIds, project.variants]);

  function patch(settings: Partial<VideoBackgroundSettings>) {
    updateProject((current) => ({
      ...current,
      videoBackground: { ...current.videoBackground, ...settings },
    }));
  }

  async function recalculate() {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const autoColor = await calculateAutoChromaColor(referenceUris);
      patch({ mode: "auto", autoColor, analyzedAt: new Date().toISOString() });
      inform(`已分析形象颜色，视频抠图背景自动设为 ${autoColor}。`, "success");
    } catch (caught) {
      inform(caught instanceof Error ? caught.message : "无法分析形象颜色", "error");
    } finally {
      setAnalyzing(false);
    }
  }

  return {
    settings: project.videoBackground,
    effectiveColor,
    analyzing,
    referenceCount: referenceUris.length,
    setMode: (mode: VideoBackgroundSettings["mode"]) => patch({ mode }),
    setManualColor: (manualColor: string) => patch({ mode: "manual", manualColor: manualColor.toUpperCase() }),
    recalculate,
  };
}

export type VideoBackgroundSettingsController = ReturnType<typeof useVideoBackgroundSettings>;
