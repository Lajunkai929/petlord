import { useMemo, useState, type FormEvent } from "react";
import type { StudioController } from "./useStudioController";

export function useIdentityLibrary(studio: StudioController) {
  const [newIdentityName, setNewIdentityName] = useState("");
  const projectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of studio.projects) {
      if (project.identityProfileId) counts.set(project.identityProfileId, (counts.get(project.identityProfileId) ?? 0) + 1);
    }
    return counts;
  }, [studio.projects]);

  function submitNewIdentity(event: FormEvent) {
    event.preventDefault();
    const name = newIdentityName.trim();
    if (!name) return;
    studio.createIdentityProfile(name);
    setNewIdentityName("");
  }

  return { newIdentityName, setNewIdentityName, submitNewIdentity, projectCounts };
}
