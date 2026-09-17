import { useMemo } from "react";
import type { ProjectSummary } from "./useProjectWorkspace";
import type { StyleProfile } from "../styleLibrary";
import { materializePromptVariables } from "@petlord/generation";

function updatedLabel(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function useProjectLibraryModel(projects: ProjectSummary[], styles: StyleProfile[], currentProjectId: string) {
  return useMemo(() => ({
    cards: projects.map((project) => {
      const style = styles.find((candidate) => materializePromptVariables(candidate.imagePrompt, project.characterName).trim() === (project.imageStylePrompt ?? project.stylePrompt).trim());
      return {
        id: project.id,
        name: project.name,
        characterName: project.characterName,
        thumbnail: project.thumbnail,
        pixelated: Boolean(project.thumbnailNative),
        stateCount: project.stateCount,
        approvedTransitionCount: project.approvedTransitionCount,
        transitionCount: project.transitionCount,
        progress: project.transitionCount > 0 ? Math.round(project.approvedTransitionCount / project.transitionCount * 100) : 0,
        styleName: style?.name ?? "自定义风格",
        importLabel: project.importedPackage ? project.importedPackage.source === "editable-source" ? "从宠物包恢复源码" : "从已安装宠物恢复" : undefined,
        updatedLabel: updatedLabel(project.updatedAt),
        current: project.id === currentProjectId,
      };
    }),
  }), [currentProjectId, projects, styles]);
}
