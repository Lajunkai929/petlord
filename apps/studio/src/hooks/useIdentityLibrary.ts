import { useMemo } from "react";
import type { StudioController } from "./useStudioController";

export function useIdentityLibrary(studio: StudioController) {
  const projectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of studio.projects) {
      if (project.identityProfileId) counts.set(project.identityProfileId, (counts.get(project.identityProfileId) ?? 0) + 1);
    }
    return counts;
  }, [studio.projects]);

  return { projectCounts };
}
