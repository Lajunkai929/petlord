import { useEffect, useMemo, useState } from "react";
import type { CharacterProject } from "@petlord/schema";
import { projectTemplates, saveProjectAsTemplate, type ProjectTemplateDefinition, type SavedProjectTemplate } from "../projectTemplates";
import { listWorkspaceEntities, saveWorkspaceEntity } from "../workspaceApi";
import { useSyncedLibrary } from "./useSyncedLibrary";

const customTemplateLibraryKey = "petlord.v3.project-templates.v1";

function readCustomTemplates(): SavedProjectTemplate[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(customTemplateLibraryKey) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((template): template is SavedProjectTemplate => Boolean(
      template && typeof template === "object" &&
      (template as SavedProjectTemplate).kind === "custom" &&
      typeof (template as SavedProjectTemplate).id === "string" &&
      Array.isArray((template as SavedProjectTemplate).states) &&
      Array.isArray((template as SavedProjectTemplate).transitions),
    ));
  } catch {
    return [];
  }
}

export function useProjectTemplateLibrary(
  project: CharacterProject,
  inform: (message: string, kind?: "success" | "error" | "info") => void,
) {
  const [customTemplates, setCustomTemplates] = useState<SavedProjectTemplate[]>(readCustomTemplates);
  const [hydrated, setHydrated] = useState(false);
  const templates = useMemo<ProjectTemplateDefinition[]>(() => [...projectTemplates, ...customTemplates], [customTemplates]);

  useEffect(() => {
    let cancelled = false;
    void listWorkspaceEntities<SavedProjectTemplate>("template")
      .then(async (stored) => {
        if (cancelled) return;
        const next = stored.length > 0 ? stored : readCustomTemplates();
        setCustomTemplates(next);
        if (stored.length === 0) await Promise.all(next.map((template) => saveWorkspaceEntity("template", template.id, template)));
        localStorage.removeItem(customTemplateLibraryKey);
        if (!cancelled) setHydrated(true);
      })
      .catch(() => setHydrated(true));
    return () => { cancelled = true; };
  }, []);

  useSyncedLibrary("template", customTemplates, setCustomTemplates, hydrated, inform);

  function saveCurrentProject(name: string, description: string) {
    if (!project.logicalStates.length) {
      inform("空项目还没有状态节点，不能保存为模板。", "error");
      return undefined;
    }
    const template = saveProjectAsTemplate(project, name, description);
    setCustomTemplates((current) => [template, ...current]);
    inform(`已将当前项目保存为模板“${template.name}”。`, "success");
    return template.id;
  }

  return { templates, customTemplates, saveCurrentProject };
}
