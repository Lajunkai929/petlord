import { useEffect, useState } from "react";
import type { StudioController } from "./useStudioController";
import { useStyleExperimentLab } from "./useStyleExperimentLab";

export function useStyleLibraryWorkspace(studio: StudioController) {
  const [selectedId, setSelectedId] = useState(() => studio.styleLibrary.activeProfileId ?? studio.styleLibrary.profiles[0]?.id);
  const selected = studio.styleLibrary.profiles.find((profile) => profile.id === selectedId) ?? studio.styleLibrary.profiles[0];
  const experiment = useStyleExperimentLab(studio, selected);

  useEffect(() => {
    if (!selected && studio.styleLibrary.profiles[0]) setSelectedId(studio.styleLibrary.profiles[0].id);
  }, [selected, studio.styleLibrary.profiles]);

  function createStyle(name: string) {
    const id = studio.styleLibrary.createProfile(name);
    if (!id) throw new Error("请输入风格名称。");
    setSelectedId(id);
  }

  return { selected, selectedId, setSelectedId, createStyle, experiment };
}
