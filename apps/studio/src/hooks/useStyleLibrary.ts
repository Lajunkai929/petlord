import { useEffect, useMemo, useState } from "react";
import type { CharacterProject } from "@petlord/schema";
import { materializePromptVariables, templateCharacterNamePrompt } from "@petlord/generation";
import { defaultStyleProfiles, mergeStyleProfiles, normalizeStyleProfile, type StyleProfile, type StylePromptRevision } from "../styleLibrary";
import type { ProjectSummary } from "./useProjectWorkspace";
import { listWorkspaceEntities, saveWorkspaceEntity } from "../workspaceApi";

const styleLibraryKey = "petlord.v3.styles.v2";
const projectStyleBindingsKey = "petlord.v3.project-style-bindings.v2";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function readInitialProfiles(_projects: ProjectSummary[]) {
  const stored = readJson<StyleProfile[]>(styleLibraryKey, []);
  return mergeStyleProfiles(
    Array.isArray(stored) ? stored.filter((profile) => profile?.id && profile?.name).map(normalizeStyleProfile) : [],
    _projects.map((candidate) => ({ name: candidate.name, characterName: candidate.characterName, prompt: candidate.stylePrompt, imagePrompt: candidate.imageStylePrompt, videoPrompt: candidate.videoStylePrompt })),
  );
}

export function materializeStyleProfile(profile: StyleProfile, characterName: string) {
  return {
    imagePrompt: materializePromptVariables(profile.imagePrompt, characterName),
    videoPrompt: materializePromptVariables(profile.videoPrompt, characterName),
  };
}

export function useStyleLibrary(
  project: CharacterProject,
  projects: ProjectSummary[],
  updateProject: (updater: (current: CharacterProject) => CharacterProject) => void,
  inform: (message: string, kind?: "success" | "error" | "info") => void,
) {
  const [profiles, setProfiles] = useState<StyleProfile[]>(() => readInitialProfiles(projects));
  const [bindings, setBindings] = useState<Record<string, string>>(() => readJson(projectStyleBindingsKey, {}));
  const [profilesHydrated, setProfilesHydrated] = useState(false);
  const projectImagePrompt = project.imageStylePrompt ?? project.stylePrompt;
  const projectVideoPrompt = project.videoStylePrompt ?? project.stylePrompt;
  const activeProfileId = useMemo(() => {
    const bound = project.styleProfileId ?? bindings[project.id];
    if (bound && profiles.some((profile) => profile.id === bound)) return bound;
    return profiles.find((profile) => {
      const rendered = materializeStyleProfile(profile, project.characterName);
      const rawMatch = profile.imagePrompt.trim() === projectImagePrompt.trim() && profile.videoPrompt.trim() === projectVideoPrompt.trim();
      const renderedMatch = rendered.imagePrompt.trim() === projectImagePrompt.trim() && rendered.videoPrompt.trim() === projectVideoPrompt.trim();
      return rawMatch || renderedMatch;
    })?.id;
  }, [bindings, profiles, project.characterName, project.id, project.styleProfileId, projectImagePrompt, projectVideoPrompt]);
  const projectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const summary of projects) {
      const summaryImagePrompt = summary.imageStylePrompt ?? summary.stylePrompt;
      const summaryVideoPrompt = summary.videoStylePrompt ?? summary.stylePrompt;
      const id = summary.styleProfileId ?? bindings[summary.id] ?? profiles.find((profile) => {
        const rendered = materializeStyleProfile(profile, summary.characterName);
        return (profile.imagePrompt.trim() === summaryImagePrompt.trim() && profile.videoPrompt.trim() === summaryVideoPrompt.trim()) ||
          (rendered.imagePrompt.trim() === summaryImagePrompt.trim() && rendered.videoPrompt.trim() === summaryVideoPrompt.trim());
      })?.id;
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [bindings, profiles, projects]);

  useEffect(() => {
    let cancelled = false;
    void listWorkspaceEntities<StyleProfile>("style")
      .then(async (stored) => {
        if (cancelled) return;
        const merged = mergeStyleProfiles(
          stored.filter((profile) => profile?.id && profile?.name).map(normalizeStyleProfile),
          projects.map((candidate) => ({ name: candidate.name, characterName: candidate.characterName, prompt: candidate.stylePrompt, imagePrompt: candidate.imageStylePrompt, videoPrompt: candidate.videoStylePrompt })),
        );
        setProfiles(merged);
        if (stored.length === 0) await Promise.all(merged.map((profile) => saveWorkspaceEntity("style", profile.id, profile)));
        localStorage.removeItem(styleLibraryKey);
        localStorage.removeItem(projectStyleBindingsKey);
        if (!cancelled) setProfilesHydrated(true);
      })
      .catch(() => setProfilesHydrated(true));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!profilesHydrated) return;
    void Promise.all(profiles.map((profile) => saveWorkspaceEntity("style", profile.id, profile)));
  }, [profiles, profilesHydrated]);

  useEffect(() => {
    const boundProfile = profiles.find((profile) => profile.id === (project.styleProfileId ?? bindings[project.id] ?? activeProfileId));
    if (boundProfile && (
      project.styleProfileId !== boundProfile.id ||
      boundProfile.imagePrompt !== projectImagePrompt ||
      boundProfile.videoPrompt !== projectVideoPrompt
    )) {
      updateProject((current) => ({
        ...current,
        styleProfileId: boundProfile.id,
        stylePrompt: boundProfile.imagePrompt,
        imageStylePrompt: boundProfile.imagePrompt,
        videoStylePrompt: boundProfile.videoPrompt,
      }));
    }
  }, [activeProfileId, bindings, profiles, project.id, project.styleProfileId, projectImagePrompt, projectVideoPrompt]);

  function bindProject(projectId: string, styleProfileId: string | undefined) {
    setBindings((current) => {
      const next = { ...current };
      if (styleProfileId) next[projectId] = styleProfileId;
      else delete next[projectId];
      return next;
    });
    if (projectId === project.id) {
      updateProject((current) => ({ ...current, styleProfileId }));
    }
  }

  function applyProfile(styleProfileId: string) {
    const profile = profiles.find((candidate) => candidate.id === styleProfileId);
    if (!profile) return;
    bindProject(project.id, profile.id);
    updateProject((current) => ({ ...current, styleProfileId: profile.id, stylePrompt: profile.imagePrompt, imageStylePrompt: profile.imagePrompt, videoStylePrompt: profile.videoPrompt }));
    inform(`项目默认风格已切换为“${profile.name}”。`, "success");
  }

  function useCustomPrompt(prompt: string, announce = false) {
    bindProject(project.id, undefined);
    const templated = templateCharacterNamePrompt(prompt, project.characterName);
    updateProject((current) => ({ ...current, styleProfileId: undefined, stylePrompt: templated, imageStylePrompt: templated }));
    if (announce) inform("项目已改用自由风格文本。", "success");
  }

  function useCustomPrompts(imagePrompt: string, videoPrompt: string, announce = false) {
    bindProject(project.id, undefined);
    const templatedImage = templateCharacterNamePrompt(imagePrompt, project.characterName);
    const templatedVideo = templateCharacterNamePrompt(videoPrompt, project.characterName);
    updateProject((current) => ({ ...current, styleProfileId: undefined, stylePrompt: templatedImage, imageStylePrompt: templatedImage, videoStylePrompt: templatedVideo }));
    if (announce) inform("项目已改用独立的图片与视频风格提示词。", "success");
  }

  function createProfile(name: string, imagePrompt = defaultStyleProfiles[0].imagePrompt, videoPrompt = defaultStyleProfiles[0].videoPrompt) {
    const normalized = name.trim();
    if (!normalized) return undefined;
    const timestamp = new Date().toISOString();
    const profile: StyleProfile = {
      id: `style-${crypto.randomUUID()}`,
      name: normalized,
      definitionVersion: 1,
      description: "可复用于任意宠物项目的生成母版风格。",
      prompt: templateCharacterNamePrompt(imagePrompt, project.characterName),
      imagePrompt: templateCharacterNamePrompt(imagePrompt, project.characterName),
      videoPrompt: templateCharacterNamePrompt(videoPrompt, project.characterName),
      experimentBudgetCny: 30,
      revisions: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    setProfiles((current) => [profile, ...current]);
    inform(`已创建全局风格“${normalized}”。`, "success");
    return profile.id;
  }

  function updateProfile(id: string, patch: Partial<Pick<StyleProfile, "name" | "description" | "imagePrompt" | "videoPrompt" | "experimentBudgetCny" | "revisions">>) {
    const timestamp = new Date().toISOString();
    const templatedPatch = { ...patch };
    if (typeof patch.imagePrompt === "string") templatedPatch.imagePrompt = templateCharacterNamePrompt(patch.imagePrompt, project.characterName);
    if (typeof patch.videoPrompt === "string") templatedPatch.videoPrompt = templateCharacterNamePrompt(patch.videoPrompt, project.characterName);
    setProfiles((current) => current.map((profile) => profile.id === id ? {
      ...profile,
      ...templatedPatch,
      prompt: templatedPatch.imagePrompt ?? profile.imagePrompt,
      imagePrompt: templatedPatch.imagePrompt ?? profile.imagePrompt,
      videoPrompt: templatedPatch.videoPrompt ?? profile.videoPrompt,
      updatedAt: timestamp,
    } : profile));
    if (activeProfileId === id && (typeof patch.imagePrompt === "string" || typeof patch.videoPrompt === "string")) {
      updateProject((current) => ({
        ...current,
        styleProfileId: id,
        stylePrompt: typeof templatedPatch.imagePrompt === "string" ? templatedPatch.imagePrompt : current.imageStylePrompt ?? current.stylePrompt,
        imageStylePrompt: typeof templatedPatch.imagePrompt === "string" ? templatedPatch.imagePrompt : current.imageStylePrompt ?? current.stylePrompt,
        videoStylePrompt: typeof templatedPatch.videoPrompt === "string" ? templatedPatch.videoPrompt : current.videoStylePrompt ?? current.stylePrompt,
      }));
    }
  }

  function snapshotProfile(id: string, source: StylePromptRevision["source"], jobId?: string) {
    const profile = profiles.find((candidate) => candidate.id === id);
    if (!profile) return;
    const revision: StylePromptRevision = {
      id: `style-revision-${crypto.randomUUID()}`,
      imagePrompt: profile.imagePrompt,
      videoPrompt: profile.videoPrompt,
      source,
      createdAt: new Date().toISOString(),
      jobId,
    };
    updateProfile(id, { revisions: [revision, ...profile.revisions].slice(0, 30) });
  }

  function restoreRevision(id: string, revisionId: string) {
    const profile = profiles.find((candidate) => candidate.id === id);
    const revision = profile?.revisions.find((candidate) => candidate.id === revisionId);
    if (!profile || !revision) return;
    updateProfile(id, { imagePrompt: revision.imagePrompt, videoPrompt: revision.videoPrompt });
    inform(`已恢复“${profile.name}”的历史提示词。`, "success");
  }

  function saveCurrentPromptAsProfile() {
    const existing = profiles.find((profile) => {
      const rendered = materializeStyleProfile(profile, project.characterName);
      return rendered.imagePrompt.trim() === projectImagePrompt.trim() && rendered.videoPrompt.trim() === projectVideoPrompt.trim();
    });
    if (existing) {
      bindProject(project.id, existing.id);
      inform(`当前项目已关联全局风格“${existing.name}”。`, "success");
      return existing.id;
    }
    const id = createProfile(`${project.name} 风格`, projectImagePrompt, projectVideoPrompt);
    if (id) bindProject(project.id, id);
    return id;
  }

  return {
    profiles,
    activeProfileId,
    projectCounts,
    bindProject,
    applyProfile,
    useCustomPrompt,
    useCustomPrompts,
    createProfile,
    updateProfile,
    snapshotProfile,
    restoreRevision,
    saveCurrentPromptAsProfile,
  };
}
