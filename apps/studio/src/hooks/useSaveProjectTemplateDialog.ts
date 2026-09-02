import { useEffect, useState, type FormEvent } from "react";
import type { CharacterProject } from "@petlord/schema";

export function useSaveProjectTemplateDialog(
  project: CharacterProject,
  onSave: (name: string, description: string) => string | undefined,
) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${project.name} 模板`);
  const [description, setDescription] = useState(`基于“${project.name}”整理的状态图与交互规则。`);
  const dynamicPromptCount = project.transitions.filter((transition) => transition.prompt.includes(project.characterName)).length;

  useEffect(() => {
    if (!open) return;
    setName(`${project.name} 模板`);
    setDescription(`基于“${project.name}”整理的状态图与交互规则。`);
  }, [open, project.name]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || project.logicalStates.length === 0) return;
    if (onSave(name.trim(), description.trim())) setOpen(false);
  }

  return { open, setOpen, name, setName, description, setDescription, dynamicPromptCount, submit };
}
