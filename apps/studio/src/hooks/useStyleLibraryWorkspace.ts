import { useEffect, useState, type FormEvent } from "react";
import type { StudioController } from "./useStudioController";
import { useStyleExperimentLab } from "./useStyleExperimentLab";

export function useStyleLibraryWorkspace(studio: StudioController) {
  const [selectedId, setSelectedId] = useState(() => studio.styleLibrary.activeProfileId ?? studio.styleLibrary.profiles[0]?.id);
  const [newStyleName, setNewStyleName] = useState("");
  const selected = studio.styleLibrary.profiles.find((profile) => profile.id === selectedId) ?? studio.styleLibrary.profiles[0];
  const experiment = useStyleExperimentLab(studio, selected);

  useEffect(() => {
    if (!selected && studio.styleLibrary.profiles[0]) setSelectedId(studio.styleLibrary.profiles[0].id);
  }, [selected, studio.styleLibrary.profiles]);

  function submitNewStyle(event: FormEvent) {
    event.preventDefault();
    const id = studio.styleLibrary.createProfile(newStyleName);
    if (!id) return;
    setSelectedId(id);
    setNewStyleName("");
  }

  return { selected, selectedId, setSelectedId, newStyleName, setNewStyleName, submitNewStyle, experiment };
}
