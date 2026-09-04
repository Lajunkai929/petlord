import type { CharacterProject } from "@petlord/schema";
import { applyProjectTemplateGraph } from "./projectTemplates";

export function applyCompanionInteractionRecipe(project: CharacterProject) {
  const applied = applyProjectTemplateGraph(project, "companion");
  return {
    ...applied,
    logicalStates: applied.logicalStates.map((state) => ["idle", "rest", "sleep", "play"].includes(state.semanticKey ?? "")
      ? {
          ...state,
          idleScheduler: {
            ...state.idleScheduler,
            enabled: true,
            playbackMode: state.semanticKey === "play" ? "continuous" as const : "interval" as const,
            minIntervalMs: 10_000,
            maxIntervalMs: 30_000,
            avoidImmediateRepeat: state.semanticKey !== "sleep",
          },
        }
      : state),
    transitions: applied.transitions.map((transition) => transition.id.startsWith("template-")
      ? { ...transition, id: `recipe-companion-${transition.id.slice("template-".length)}` }
      : transition),
  };
}
