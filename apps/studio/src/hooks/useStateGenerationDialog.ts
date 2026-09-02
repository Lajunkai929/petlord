import { useEffect, useMemo, useState, type FormEvent } from "react";
import { assembleStateDraftPrompt, materializePromptVariables, stateDraftPromptSegments } from "@petlord/generation";
import type { CharacterProject, LogicalState } from "@petlord/schema";
import type { StyleProfile } from "../styleLibrary";
import type { StateGenerationOptions } from "./useStudioController";

export function useStateGenerationDialog({
  project,
  state,
  profiles,
  activeStyleProfileId,
  onGenerate,
}: {
  project: CharacterProject;
  state: LogicalState;
  profiles: StyleProfile[];
  activeStyleProfileId?: string;
  onGenerate: (stateId: string, options?: StateGenerationOptions) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [styleProfileId, setStyleProfileId] = useState<string | undefined>(activeStyleProfileId);
  const activeStylePrompt = materializePromptVariables(profiles.find((profile) => profile.id === activeStyleProfileId)?.imagePrompt ?? project.imageStylePrompt ?? project.stylePrompt, project.characterName);
  const [stylePrompt, setStylePrompt] = useState(activeStylePrompt);
  const [saveAsProjectDefault, setSaveAsProjectDefault] = useState(true);
  const references = useMemo(() => project.referenceArtifactIds
    .map((id) => project.artifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact)), [project.artifacts, project.referenceArtifactIds]);
  const request = useMemo(() => ({
    characterName: project.characterName,
    identityReferenceUris: references.map((reference) => reference.uri),
    identityPrompt: project.identityPrompt,
    stylePrompt,
    targetStateLabel: state.label,
    prompt: state.description,
    settings: project.generationSettings,
  }), [project.characterName, project.generationSettings, project.identityPrompt, references, state.description, state.label, stylePrompt]);
  const segments = useMemo(() => stateDraftPromptSegments(request), [request]);
  const assembledPrompt = useMemo(() => assembleStateDraftPrompt(request), [request]);

  useEffect(() => {
    if (!open) return;
    setStyleProfileId(activeStyleProfileId);
    setStylePrompt(activeStylePrompt);
    setSaveAsProjectDefault(true);
  }, [activeStyleProfileId, activeStylePrompt, open]);

  function selectStyle(nextId: string) {
    if (nextId === "custom") {
      setStyleProfileId(undefined);
      return;
    }
    const profile = profiles.find((candidate) => candidate.id === nextId);
    if (!profile) return;
    setStyleProfileId(profile.id);
    setStylePrompt(materializePromptVariables(profile.imagePrompt, project.characterName));
  }

  function editStylePrompt(prompt: string) {
    setStylePrompt(prompt);
    const exact = profiles.find((profile) => materializePromptVariables(profile.imagePrompt, project.characterName).trim() === prompt.trim());
    setStyleProfileId(exact?.id);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!stylePrompt.trim() || references.length === 0) return;
    setOpen(false);
    await onGenerate(state.id, { stylePrompt, styleProfileId, persistProjectStyle: saveAsProjectDefault });
  }

  return {
    open,
    setOpen,
    styleProfileId,
    stylePrompt,
    saveAsProjectDefault,
    setSaveAsProjectDefault,
    references,
    submittedReferenceCount: Math.min(10, references.length),
    segments,
    assembledPrompt,
    selectStyle,
    editStylePrompt,
    submit,
  };
}
