import { useMemo } from "react";
import type { CharacterProject, Transition } from "@petlord/schema";
import { assembleTransitionPrompt } from "@petlord/generation";

export function useTransitionGenerationContract(project: CharacterProject, transition: Transition) {
  return useMemo(() => {
    const chromaBackgroundColor = project.videoBackground.mode === "manual"
      ? project.videoBackground.manualColor
      : project.videoBackground.autoColor;
    const prompt = assembleTransitionPrompt({
      characterName: project.characterName,
      identityPrompt: project.identityPrompt,
      stylePrompt: project.videoStylePrompt ?? project.stylePrompt,
      prompt: transition.prompt,
      settings: project.generationSettings,
      transparentVideo: transition.transparentVideo,
      chromaBackgroundColor,
    });
    return { prompt, chromaBackgroundColor };
  }, [project.characterName, project.generationSettings, project.identityPrompt, project.stylePrompt, project.videoStylePrompt, project.videoBackground, transition.prompt, transition.transparentVideo]);
}
