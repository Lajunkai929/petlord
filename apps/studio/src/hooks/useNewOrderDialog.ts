import { useEffect, useState, type FormEvent } from "react";
import type { IdentityProfile } from "@petlord/schema";
import { materializePromptVariables, remapCharacterNamePrompt } from "@petlord/generation";
import { type NewOrderInput, type ProjectTemplateDefinition } from "../projectTemplate";
import type { StyleProfile } from "../styleLibrary";
import { templateStateCount, templateStateLabels, templateTransitionPreviews } from "../projectTemplates";

function emptyOrder(identity?: IdentityProfile, style?: StyleProfile): NewOrderInput {
  const imageStylePrompt = style ? materializePromptVariables(style.imagePrompt, identity?.name) : undefined;
  const videoStylePrompt = style ? materializePromptVariables(style.videoPrompt, identity?.name) : undefined;
  return {
  customerName: "",
  contact: "",
  characterName: identity?.name ?? "新宠物",
  identityProfileId: identity?.id,
  projectName: identity ? `${identity.name} · 新风格` : "",
  styleProfileId: style?.id,
  stylePrompt: imageStylePrompt ?? "高质量 2D 桌面宠物角色，完整展示角色，稳定统一的造型与光影。",
  imageStylePrompt,
  videoStylePrompt,
  quotedPriceCny: 0,
  depositCny: 0,
  dueDate: undefined,
  revisionLimit: 0,
  notes: "",
  projectTemplateId: "companion",
  };
}

export function useNewOrderDialog(
  identities: IdentityProfile[],
  styles: StyleProfile[],
  templates: ProjectTemplateDefinition[],
  activeIdentityId: string | undefined,
  activeStyleProfileId: string | undefined,
  onCreate: (input: NewOrderInput, duplicateCurrent: boolean) => void | boolean,
) {
  const initialIdentity = identities.find((identity) => identity.id === activeIdentityId) ?? identities[0];
  const initialStyle = styles.find((style) => style.id === activeStyleProfileId) ?? styles[0];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<NewOrderInput>(() => emptyOrder(initialIdentity, initialStyle));
  const [duplicateCurrent, setDuplicateCurrent] = useState(false);
  const selectedTemplate = templates.find((template) => template.id === form.projectTemplateId) ?? templates.find((template) => template.id === "companion") ?? templates[0];
  const selectedIdentity = identities.find((identity) => identity.id === form.identityProfileId);
  const templateOptions = templates.map((template) => ({
    template,
    stateCount: templateStateCount(template),
    transitionCount: template.transitions.length,
  }));
  const selectedStateLabels = selectedTemplate ? templateStateLabels(selectedTemplate) : [];
  const templateTransitions = selectedTemplate ? templateTransitionPreviews(selectedTemplate, selectedIdentity?.name ?? "宠物") : [];

  useEffect(() => {
    if (!open) setForm(emptyOrder(initialIdentity, initialStyle));
  }, [initialIdentity, initialStyle, open]);

  function patch(next: Partial<NewOrderInput>) {
    setForm((current) => {
      const prompts: Partial<NewOrderInput> = {};
      if (next.characterName !== undefined && next.characterName !== current.characterName) {
        for (const key of ["stylePrompt", "imageStylePrompt", "videoStylePrompt"] as const) {
          if (current[key] !== undefined && next[key] === undefined) prompts[key] = remapCharacterNamePrompt(current[key], current.characterName, next.characterName);
        }
      }
      return { ...current, ...prompts, ...next };
    });
  }

  function selectProjectTemplate(projectTemplateId: string) {
    if (!templates.some((candidate) => candidate.id === projectTemplateId)) return;
    patch({ projectTemplateId });
  }

  function selectIdentity(identityProfileId: string) {
    if (identityProfileId === "new") {
      patch({ identityProfileId: undefined, characterName: "新宠物", projectName: "" });
      return;
    }
    const identity = identities.find((candidate) => candidate.id === identityProfileId);
    if (!identity) return;
    const style = styles.find((candidate) => candidate.id === form.styleProfileId);
    patch({
      identityProfileId,
      characterName: identity.name,
      projectName: form.projectName?.trim() ? form.projectName : `${identity.name} · 新风格`,
      stylePrompt: style ? materializePromptVariables(style.imagePrompt, identity.name) : form.stylePrompt,
      imageStylePrompt: style ? materializePromptVariables(style.imagePrompt, identity.name) : form.imageStylePrompt,
      videoStylePrompt: style ? materializePromptVariables(style.videoPrompt, identity.name) : form.videoStylePrompt,
    });
  }

  function selectStyle(styleProfileId: string) {
    if (styleProfileId === "custom") {
      patch({ styleProfileId: undefined });
      return;
    }
    const style = styles.find((candidate) => candidate.id === styleProfileId);
    if (style) {
      const characterName = selectedIdentity?.name ?? form.characterName;
      const imagePrompt = materializePromptVariables(style.imagePrompt, characterName);
      const videoPrompt = materializePromptVariables(style.videoPrompt, characterName);
      patch({ styleProfileId: style.id, stylePrompt: imagePrompt, imageStylePrompt: imagePrompt, videoStylePrompt: videoPrompt });
    }
  }

  function editStylePrompt(stylePrompt: string) {
    const exact = styles.find((style) => materializePromptVariables(style.imagePrompt, selectedIdentity?.name ?? form.characterName).trim() === stylePrompt.trim());
    patch({ stylePrompt, imageStylePrompt: stylePrompt, styleProfileId: exact?.id });
  }

  function editVideoStylePrompt(videoStylePrompt: string) {
    const imageStylePrompt = form.imageStylePrompt ?? form.stylePrompt ?? "";
    const exact = styles.find((style) => materializePromptVariables(style.imagePrompt, selectedIdentity?.name ?? form.characterName).trim() === imageStylePrompt.trim() && materializePromptVariables(style.videoPrompt, selectedIdentity?.name ?? form.characterName).trim() === videoStylePrompt.trim());
    patch({ videoStylePrompt, styleProfileId: exact?.id });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.projectName?.trim() || !form.characterName.trim()) return;
    if (onCreate({ ...form, projectTemplate: selectedTemplate, customerName: form.customerName.trim(), characterName: form.characterName.trim() }, duplicateCurrent) === false) return;
    setOpen(false);
    setForm(emptyOrder(identities.find((identity) => identity.id === activeIdentityId) ?? identities[0], styles.find((style) => style.id === activeStyleProfileId) ?? styles[0]));
    setDuplicateCurrent(false);
  }

  return { open, setOpen, form, selectedTemplate, selectedStateLabels, templateOptions, templateTransitions, patch, selectIdentity, selectStyle, editStylePrompt, editVideoStylePrompt, selectProjectTemplate, duplicateCurrent, setDuplicateCurrent, submit };
}
