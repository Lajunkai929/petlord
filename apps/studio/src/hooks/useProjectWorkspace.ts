import { useEffect, useMemo, useRef, useState } from "react";
import {
  characterProjectSchema,
  identityProfileSchema,
  type CharacterProject,
  type CustomerOrder,
  type IdentityProfile,
} from "@petlord/schema";
import { seedProject } from "../seed";
import { deliveryProgress, summarizeOrderEconomics, type OrderEconomics } from "../orderOperations";
import { createIdentityProfileFromProject, ensureAuthorityVariants, normalizeProjectPromptTemplates, syncProjectIdentity } from "../projectTemplate";
import { lotteryPixelProject } from "../lotteryPixelProject";
import { lotteryHiResProject, lotteryHiResProjectId } from "../lotteryHiResProject";
import { lotteryStardewProject } from "../lotteryStardewProject";
import { lotteryClearProject } from "../lotteryClearProject";
import { approveProjectTransition } from "../transitionApproval";
import { templateCharacterNamePrompt } from "@petlord/generation";
import { listWorkspaceEntities, readWorkspaceState, saveWorkspaceEntity, saveWorkspaceState } from "../workspaceApi";

const legacyProjectKey = "petlord.v3.6.project";
const workspaceKey = "petlord.v3.workspace.v1";
const identityLibraryStorageSlot = "petlord.v3.identities.v1";
const projectKey = (id: string) => `petlord.v3.project.${id}`;
const internalFixturesEnabled = import.meta.env.VITE_PETLORD_INTERNAL_FIXTURES === "1";

interface WorkspaceRegistry {
  activeProjectId: string;
  activeIdentityId?: string;
  projectIds: string[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  characterName: string;
  identityProfileId?: string;
  styleProfileId?: string;
  stylePrompt: string;
  imageStylePrompt?: string;
  videoStylePrompt?: string;
  order: CustomerOrder;
  updatedAt: string;
  stateCount: number;
  approvedTransitionCount: number;
  transitionCount: number;
  thumbnail?: string;
  economics: OrderEconomics;
  deliveryProgress: { completed: number; total: number };
}

function readProject(id: string) {
  try {
    const raw = localStorage.getItem(projectKey(id));
    if (!raw) return undefined;
    const parsed = characterProjectSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

function summary(project: CharacterProject): ProjectSummary {
  const initialVariant = project.variants.find((variant) => variant.id === project.initialVariantId) ?? project.variants[0];
  const thumbnail = project.artifacts.find((artifact) => artifact.id === initialVariant?.imageArtifactId)?.uri;
  return {
    id: project.id,
    name: project.name,
    characterName: project.characterName,
    identityProfileId: project.identityProfileId,
    styleProfileId: project.styleProfileId,
    stylePrompt: project.stylePrompt,
    imageStylePrompt: project.imageStylePrompt,
    videoStylePrompt: project.videoStylePrompt,
    order: project.order,
    updatedAt: project.updatedAt,
    stateCount: project.logicalStates.length,
    approvedTransitionCount: project.transitions.filter((transition) => transition.status === "approved").length,
    transitionCount: project.transitions.length,
    thumbnail,
    economics: summarizeOrderEconomics(project),
    deliveryProgress: deliveryProgress(project),
  };
}

function readIdentityLibrary() {
  try {
    const parsed = identityProfileSchema.array().safeParse(JSON.parse(localStorage.getItem(identityLibraryStorageSlot) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function identityKey(project: CharacterProject) {
  const sourceUris = project.referenceArtifactIds
    .map((id) => project.artifacts.find((artifact) => artifact.id === id)?.uri)
    .filter(Boolean)
    .sort();
  return JSON.stringify([project.characterName.trim().toLowerCase(), project.identityPrompt.trim(), sourceUris]);
}

function mergeMissingById<T extends { id: string }>(current: T[], bundled: T[]) {
  const knownIds = new Set(current.map((item) => item.id));
  return [...current, ...bundled.filter((item) => !knownIds.has(item.id)).map((item) => structuredClone(item))];
}

type ProjectState = CharacterProject["logicalStates"][number];
type ProjectTransition = CharacterProject["transitions"][number];

function hasLegacyIdleScheduler(state: ProjectState) {
  const scheduler = state.idleScheduler;
  if (!scheduler.enabled) return false;
  if (scheduler.playbackMode === "continuous") {
    return (
      (scheduler.minIntervalMs === 1_000 && scheduler.maxIntervalMs === 1_000) ||
      (scheduler.minIntervalMs === 8_000 && scheduler.maxIntervalMs === 18_000) ||
      (scheduler.minIntervalMs === 10_000 && scheduler.maxIntervalMs === 30_000)
    );
  }
  return !scheduler.playbackMode && (
    (scheduler.minIntervalMs === 1_000 && scheduler.maxIntervalMs === 1_000) ||
    (scheduler.minIntervalMs === 8_000 && scheduler.maxIntervalMs === 18_000)
  );
}

function migrateBundledIdleSchedulers(current: ProjectState[], bundled: ProjectState[]) {
  const bundledStates = new Map(bundled.map((state) => [state.id, state]));
  return mergeMissingById(current, bundled).map((state) => {
    const bundledState = bundledStates.get(state.id);
    if (!bundledState || !hasLegacyIdleScheduler(state)) return state;
    return { ...state, idleScheduler: structuredClone(bundledState.idleScheduler) };
  });
}

function hasLegacyTimerDefault(current: ProjectTransition, bundled: ProjectTransition) {
  return current.triggers.some((trigger) => {
    const bundledTrigger = bundled.triggers.find((candidate) => candidate.id === trigger.id);
    return trigger.timerDurationMs === 60_000 && bundledTrigger?.timerDurationMs === 30_000;
  });
}

function migrateBundledTriggers(current: ProjectTransition, bundled: ProjectTransition) {
  return mergeMissingById(current.triggers, bundled.triggers).map((trigger) => {
    const bundledTrigger = bundled.triggers.find((candidate) => candidate.id === trigger.id);
    if (trigger.timerDurationMs !== 60_000 || bundledTrigger?.timerDurationMs !== 30_000) return trigger;
    return { ...trigger, timerDurationMs: bundledTrigger.timerDurationMs };
  });
}

function migrateBundledIdleRule(current: ProjectTransition, bundled: ProjectTransition) {
  if (!current.idleRule || !bundled.idleRule) return current.idleRule ?? bundled.idleRule;
  const legacySleepBreathing = current.idleRule.weight === 10 && (current.idleRule.cooldownMs ?? 0) === 0 && bundled.idleRule.weight === 50;
  const legacyDreamCooldown = current.idleRule.weight === 1 && current.idleRule.cooldownMs === 60_000 && bundled.idleRule.cooldownMs === 30_000;
  return legacySleepBreathing || legacyDreamCooldown ? structuredClone(bundled.idleRule) : current.idleRule;
}

export function refreshBundledProject(project: CharacterProject) {
  if (project.id === lotteryClearProject.id) {
    const approvedCount = project.transitions.filter((transition) => transition.status === "approved").length;
    const needsMediaCompletion = approvedCount < lotteryClearProject.transitions.length;
    const currentTransitions = new Map(project.transitions.map((transition) => [transition.id, transition]));
    const bundledTransitions = new Map(lotteryClearProject.transitions.map((transition) => [transition.id, transition]));
    const transitions = needsMediaCompletion
      ? lotteryClearProject.transitions.map((bundled) => {
        const current = currentTransitions.get(bundled.id);
        const currentTriggers = (current?.triggers ?? []).filter((trigger) =>
          bundled.id !== "template-sit-blink" || trigger.id !== "template-trigger-sit-head-click");
        return {
          ...bundled,
          triggers: current ? migrateBundledTriggers({ ...current, triggers: currentTriggers }, bundled) : bundled.triggers,
          idleRule: current ? migrateBundledIdleRule(current, bundled) : bundled.idleRule,
        };
      })
      : project.transitions.map((current) => {
        const bundled = bundledTransitions.get(current.id);
        if (!bundled) return current;
        const currentTriggers = current.triggers.filter((trigger) =>
          bundled.id !== "template-sit-blink" || trigger.id !== "template-trigger-sit-head-click");
        const migratesTimerDefault = hasLegacyTimerDefault(current, bundled);
        const migratesLegacyStableDefault = current.authorityBridge.mode === "blur-dissolve" &&
          current.authorityBridge.durationMs === 700 && bundled.authorityBridge.mode === "crossfade";
        const upgradesShortBridge = current.authorityBridge.mode !== "hard-cut" && current.authorityBridge.durationMs < bundled.authorityBridge.durationMs;
        return {
          ...current,
          label: migratesTimerDefault && current.label.includes("1 分钟") ? bundled.label : current.label,
          triggers: migrateBundledTriggers({ ...current, triggers: currentTriggers }, bundled),
          idleRule: migrateBundledIdleRule(current, bundled),
          entryBlendMs: Math.max(current.entryBlendMs ?? 0, bundled.entryBlendMs ?? 420),
          authorityBridge: migratesLegacyStableDefault
            ? bundled.authorityBridge
            : upgradesShortBridge
              ? { ...current.authorityBridge, durationMs: bundled.authorityBridge.durationMs }
              : current.authorityBridge,
        };
      });
    return characterProjectSchema.parse({
      ...project,
      order: needsMediaCompletion ? {
        ...project.order,
        status: lotteryClearProject.order.status,
        notes: lotteryClearProject.order.notes,
        deliveryChecklist: lotteryClearProject.order.deliveryChecklist,
      } : project.order,
      logicalStates: migrateBundledIdleSchedulers(project.logicalStates, lotteryClearProject.logicalStates),
      transitions,
      artifacts: mergeMissingById(project.artifacts, lotteryClearProject.artifacts),
      jobs: mergeMissingById(project.jobs, lotteryClearProject.jobs),
      plugins: mergeMissingById(project.plugins, lotteryClearProject.plugins),
      updatedAt: needsMediaCompletion ? lotteryClearProject.updatedAt : project.updatedAt,
    });
  }
  if (project.id === lotteryStardewProject.id) {
    const presentation = project.runtimePresentation;
    const hasLegacyDestructivePixelScale = presentation?.pixelated === true &&
      presentation.defaultRenderResolution === 96 &&
      presentation.defaultPixelGridSize === 64 &&
      presentation.defaultDisplaySize === 320;
    if (!hasLegacyDestructivePixelScale) return project;
    return characterProjectSchema.parse({
      ...project,
      runtimePresentation: structuredClone(lotteryStardewProject.runtimePresentation),
    });
  }
  if (project.id === lotteryHiResProjectId) {
    const bundledTransitions = new Map(lotteryHiResProject.transitions.map((transition) => [transition.id, transition]));
    const migratesIdleScheduling = project.logicalStates.some(hasLegacyIdleScheduler);
    const transitions = mergeMissingById(project.transitions, lotteryHiResProject.transitions).map((transition) => {
      const bundled = bundledTransitions.get(transition.id);
      if (!bundled) return transition;
      const migratesTimerDefault = hasLegacyTimerDefault(transition, bundled);
      const legacyIdleRule = bundled.idleRule && (
        migratesIdleScheduling ||
        !transition.idleRule ||
        (transition.idleRule.cooldownMs ?? 0) <= 3_000 ||
        (transition.entryBlendMs === 180 && transition.authorityBridge.durationMs === 420)
      );
      const migratesPingPongPlayback = bundled.playback?.mode === "ping-pong" && (
        !transition.playback ||
        (transition.activeMediaVersionId === bundled.activeMediaVersionId && transition.playback.segmentStartMs > 0)
      );
      const preservesHardCut = transition.authorityBridge.mode === "hard-cut";
      const migratesLegacyStableDefault = transition.authorityBridge.mode === "blur-dissolve" &&
        transition.authorityBridge.durationMs === 700 && bundled.authorityBridge.mode === "crossfade";
      const migratesShortBridge = !preservesHardCut && transition.authorityBridge.durationMs < bundled.authorityBridge.durationMs;
      const mergedMediaVersions = mergeMissingById(transition.mediaVersions, bundled.mediaVersions);
      return {
        ...bundled,
        ...transition,
        label: legacyIdleRule || (migratesTimerDefault && transition.label.includes("1 分钟")) ? bundled.label : transition.label,
        triggers: migrateBundledTriggers(transition, bundled),
        idleRule: legacyIdleRule ? bundled.idleRule : transition.idleRule,
        entryBlendMs: legacyIdleRule ? bundled.entryBlendMs : transition.entryBlendMs ?? bundled.entryBlendMs,
        authorityBridge: !preservesHardCut && (legacyIdleRule || migratesLegacyStableDefault || migratesShortBridge)
          ? bundled.authorityBridge
          : transition.authorityBridge,
        videoArtifactId: migratesPingPongPlayback ? bundled.videoArtifactId : transition.videoArtifactId ?? bundled.videoArtifactId,
        extractedTailArtifactId: migratesPingPongPlayback ? bundled.extractedTailArtifactId : transition.extractedTailArtifactId ?? bundled.extractedTailArtifactId,
        sourceVideoDurationMs: migratesPingPongPlayback ? bundled.sourceVideoDurationMs : transition.sourceVideoDurationMs ?? bundled.sourceVideoDurationMs,
        selectedEndMs: migratesPingPongPlayback ? bundled.selectedEndMs : transition.selectedEndMs ?? bundled.selectedEndMs,
        durationMs: migratesPingPongPlayback ? bundled.durationMs : transition.durationMs,
        playback: migratesPingPongPlayback ? bundled.playback : transition.playback ?? bundled.playback,
        mediaVersions: migratesPingPongPlayback
          ? mergedMediaVersions.map((version) => bundled.mediaVersions.find((candidate) => candidate.id === version.id) ?? version)
          : mergedMediaVersions,
        activeMediaVersionId: migratesPingPongPlayback ? bundled.activeMediaVersionId : transition.activeMediaVersionId ?? bundled.activeMediaVersionId,
        lastGenerationPrompt: transition.lastGenerationPrompt ?? bundled.lastGenerationPrompt,
        lastGenerationModel: transition.lastGenerationModel ?? bundled.lastGenerationModel,
        lastChromaKeyColor: transition.lastChromaKeyColor ?? bundled.lastChromaKeyColor,
      };
    });
    const logicalStates = migrateBundledIdleSchedulers(project.logicalStates, lotteryHiResProject.logicalStates);
    const bundledVariantIds = new Set(lotteryHiResProject.variants.map((variant) => variant.id));
    const mergedVariants = mergeMissingById(project.variants, lotteryHiResProject.variants);
    const replacementVariantIds = new Map<string, string>();
    for (const bundledVariant of lotteryHiResProject.variants) {
      const state = logicalStates.find((candidate) => candidate.id === bundledVariant.logicalStateId);
      const alternative = mergedVariants.find((variant) =>
        variant.logicalStateId === bundledVariant.logicalStateId &&
        variant.status === "approved" &&
        !bundledVariantIds.has(variant.id) &&
        (variant.id === state?.defaultVariantId || variant.imageArtifactId === state?.referenceArtifactId));
      if (alternative) replacementVariantIds.set(bundledVariant.id, alternative.id);
    }
    const replaceVariantId = (id: string | undefined) => id ? replacementVariantIds.get(id) ?? id : id;
    const variants = mergedVariants.filter((variant) => !replacementVariantIds.has(variant.id));
    const normalizedStates = logicalStates.map((state) => ({
      ...state,
      defaultVariantId: replaceVariantId(state.defaultVariantId),
      preferredOutboundVariantId: replaceVariantId(state.preferredOutboundVariantId),
    }));
    const normalizedTransitions = transitions.map((transition) => ({
      ...transition,
      fromVariantId: replaceVariantId(transition.fromVariantId)!,
      toVariantId: replaceVariantId(transition.toVariantId),
    }));
    let refreshed = characterProjectSchema.parse({
      ...project,
      initialVariantId: replaceVariantId(project.initialVariantId),
      runtimePresentation: { ...lotteryHiResProject.runtimePresentation, ...project.runtimePresentation },
      logicalStates: normalizedStates,
      variants,
      transitions: normalizedTransitions,
      artifacts: mergeMissingById(project.artifacts, lotteryHiResProject.artifacts),
      jobs: mergeMissingById(project.jobs, lotteryHiResProject.jobs),
      plugins: mergeMissingById(project.plugins, lotteryHiResProject.plugins),
    });
    for (const transition of refreshed.transitions) {
      if (transition.status !== "approved" && transition.videoArtifactId && transition.extractedTailArtifactId) {
        refreshed = approveProjectTransition(refreshed, transition.id).project;
      }
    }
    return characterProjectSchema.parse(refreshed);
  }
  if (project.id !== lotteryPixelProject.id) return project;
  const bundledTransitions = new Map(lotteryPixelProject.transitions.map((transition) => [transition.id, transition]));
  const transitions = mergeMissingById(project.transitions, lotteryPixelProject.transitions).map((transition) => {
    const bundled = bundledTransitions.get(transition.id);
    if (!bundled || transition.status === "approved") return transition;
    return { ...transition, endFrameSource: bundled.endFrameSource, authorityBridge: bundled.authorityBridge };
  });
  return characterProjectSchema.parse({
    ...project,
    logicalStates: mergeMissingById(project.logicalStates, lotteryPixelProject.logicalStates),
    variants: mergeMissingById(project.variants, lotteryPixelProject.variants),
    transitions,
    artifacts: mergeMissingById(project.artifacts, lotteryPixelProject.artifacts),
    plugins: mergeMissingById(project.plugins, lotteryPixelProject.plugins),
  });
}

function migrateProjectsAndIdentities(projects: CharacterProject[], storedIdentities: IdentityProfile[]) {
  const identities = storedIdentities.map((identity) => ({
    ...identity,
    identityPrompt: templateCharacterNamePrompt(identity.identityPrompt, identity.name),
  }));
  const synthesized = new Map<string, IdentityProfile>();
  const migratedProjects = projects.map((sourceProject) => {
    const rawProject = normalizeProjectPromptTemplates(sourceProject);
    let identity = rawProject.identityProfileId
      ? identities.find((candidate) => candidate.id === rawProject.identityProfileId)
      : undefined;
    if (!identity) {
      const key = identityKey(rawProject);
      identity = synthesized.get(key) ?? identities.find((candidate) =>
        candidate.name === rawProject.characterName && candidate.identityPrompt === rawProject.identityPrompt);
      if (!identity) {
        identity = createIdentityProfileFromProject(rawProject);
        identities.push(identity);
      }
      synthesized.set(key, identity);
    }
    const projectIdentity = createIdentityProfileFromProject({ ...rawProject, identityProfileId: identity.id });
    const knownReferenceIds = new Set(identity.referenceArtifacts.map((artifact) => artifact.id));
    const missingReferences = projectIdentity.referenceArtifacts.filter((artifact) => !knownReferenceIds.has(artifact.id));
    if (missingReferences.length > 0) {
      const merged = { ...identity, referenceArtifacts: [...identity.referenceArtifacts, ...missingReferences], updatedAt: rawProject.updatedAt };
      const identityIndex = identities.findIndex((candidate) => candidate.id === identity?.id);
      if (identityIndex >= 0) identities[identityIndex] = merged;
      identity = merged;
    }
    const linked = rawProject.identityProfileId
      ? syncProjectIdentity(rawProject, identity)
      : { ...rawProject, identityProfileId: identity.id };
    return ensureAuthorityVariants(linked);
  });
  return { projects: migratedProjects, identities };
}

function initializeWorkspace(preferredProjectId?: string) {
  try {
    const rawRegistry = localStorage.getItem(workspaceKey);
    const parsedRegistry = rawRegistry ? JSON.parse(rawRegistry) as WorkspaceRegistry : undefined;
    let sourceProjects = parsedRegistry?.projectIds
      .map(readProject)
      .filter((project): project is CharacterProject => Boolean(project)) ?? [];
    if (sourceProjects.length === 0) {
      const legacyRaw = localStorage.getItem(legacyProjectKey);
      const legacyParsed = legacyRaw ? characterProjectSchema.safeParse(JSON.parse(legacyRaw)) : undefined;
      sourceProjects = [legacyParsed?.success ? legacyParsed.data : seedProject];
    }
    if (internalFixturesEnabled && !sourceProjects.some((project) => project.id === lotteryPixelProject.id)) {
      sourceProjects = [...sourceProjects, structuredClone(lotteryPixelProject)];
    }
    if (internalFixturesEnabled && !sourceProjects.some((project) => project.id === lotteryHiResProject.id)) {
      sourceProjects = [...sourceProjects, structuredClone(lotteryHiResProject)];
    }
    if (internalFixturesEnabled && !sourceProjects.some((project) => project.id === lotteryStardewProject.id)) {
      sourceProjects = [...sourceProjects, structuredClone(lotteryStardewProject)];
    }
    if (internalFixturesEnabled && !sourceProjects.some((project) => project.id === lotteryClearProject.id)) {
      sourceProjects = [...sourceProjects, structuredClone(lotteryClearProject)];
    }
    sourceProjects = sourceProjects.map(refreshBundledProject);
    const migrated = migrateProjectsAndIdentities(sourceProjects, readIdentityLibrary());
    const active = migrated.projects.find((project) => project.id === preferredProjectId)
      ?? migrated.projects.find((project) => project.id === parsedRegistry?.activeProjectId)
      ?? migrated.projects[0];
    const activeIdentityId = parsedRegistry?.activeIdentityId ?? active.identityProfileId ?? migrated.identities[0]?.id;
    const registry: WorkspaceRegistry = {
      activeProjectId: active.id,
      activeIdentityId,
      projectIds: migrated.projects.map((project) => project.id),
    };
    return { project: active, records: migrated.projects, summaries: migrated.projects.map(summary), identities: migrated.identities, registry };
  } catch {
    const migrated = migrateProjectsAndIdentities([seedProject], []);
    const project = migrated.projects[0];
    return {
      project,
      records: migrated.projects,
      summaries: [summary(project)],
      identities: migrated.identities,
      registry: { activeProjectId: project.id, activeIdentityId: project.identityProfileId, projectIds: [project.id] },
    };
  }
}

export function useProjectWorkspace(preferredProjectId?: string) {
  const [initial] = useState(() => initializeWorkspace(preferredProjectId));
  const [project, setProject] = useState<CharacterProject>(initial.project);
  const [projects, setProjects] = useState<ProjectSummary[]>(initial.summaries);
  const [identities, setIdentities] = useState<IdentityProfile[]>(initial.identities);
  const [registry, setRegistry] = useState<WorkspaceRegistry>(initial.registry);
  const recordsRef = useRef(new Map(initial.records.map((record) => [record.id, record])));
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string>();
  const activeIdentity = useMemo(
    () => identities.find((identity) => identity.id === registry.activeIdentityId) ?? identities[0],
    [identities, registry.activeIdentityId],
  );

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      listWorkspaceEntities<unknown>("project"),
      listWorkspaceEntities<unknown>("identity"),
      readWorkspaceState<WorkspaceRegistry>("workspace-registry"),
    ]).then(async ([storedProjects, storedIdentities, storedRegistry]) => {
      if (cancelled) return;
      const validProjects = storedProjects.flatMap((candidate) => {
        const parsed = characterProjectSchema.safeParse(candidate);
        return parsed.success ? [parsed.data] : [];
      });
      const validIdentities = storedIdentities.flatMap((candidate) => {
        const parsed = identityProfileSchema.safeParse(candidate);
        return parsed.success ? [parsed.data] : [];
      });
      const sourceProjects = validProjects.length > 0 ? validProjects : initial.records;
      const sourceIdentities = validIdentities.length > 0 ? validIdentities : initial.identities;
      const migrated = migrateProjectsAndIdentities(sourceProjects.map(refreshBundledProject), sourceIdentities);
      const nextRegistry: WorkspaceRegistry = storedRegistry && migrated.projects.some((candidate) => candidate.id === storedRegistry.activeProjectId)
        ? { ...storedRegistry, projectIds: migrated.projects.map((candidate) => candidate.id) }
        : {
            activeProjectId: preferredProjectId && migrated.projects.some((candidate) => candidate.id === preferredProjectId)
              ? preferredProjectId
              : migrated.projects[0].id,
            activeIdentityId: migrated.projects[0].identityProfileId ?? migrated.identities[0]?.id,
            projectIds: migrated.projects.map((candidate) => candidate.id),
          };
      const nextProject = migrated.projects.find((candidate) => candidate.id === nextRegistry.activeProjectId) ?? migrated.projects[0];
      recordsRef.current = new Map(migrated.projects.map((record) => [record.id, record]));
      setProjects(migrated.projects.map(summary));
      setIdentities(migrated.identities);
      setRegistry(nextRegistry);
      setProject(nextProject);
      if (validProjects.length === 0) {
        await Promise.all(migrated.projects.map((record) => saveWorkspaceEntity("project", record.id, record)));
      }
      if (validIdentities.length === 0) {
        await Promise.all(migrated.identities.map((identity) => saveWorkspaceEntity("identity", identity.id, identity)));
      }
      await saveWorkspaceState("workspace-registry", nextRegistry);
      localStorage.removeItem(legacyProjectKey);
      localStorage.removeItem(identityLibraryStorageSlot);
      localStorage.removeItem(workspaceKey);
      for (const record of migrated.projects) localStorage.removeItem(projectKey(record.id));
      if (!cancelled) setHydrated(true);
    }).catch((caught) => {
      if (!cancelled) setStorageError(caught instanceof Error ? caught.message : "SQLite 工作区载入失败");
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    recordsRef.current.set(project.id, project);
    setRegistry((current) => ({ ...current, activeProjectId: project.id, projectIds: [...new Set([...current.projectIds, project.id])] }));
    setProjects((current) => [...current.filter((candidate) => candidate.id !== project.id), summary(project)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    void saveWorkspaceEntity("project", project.id, project)
      .then(() => setStorageError(undefined))
      .catch((caught) => setStorageError(caught instanceof Error ? caught.message : "项目保存失败"));
  }, [hydrated, project]);

  useEffect(() => {
    if (!hydrated) return;
    void Promise.all(identities.map((identity) => saveWorkspaceEntity("identity", identity.id, identity)))
      .then(() => setStorageError(undefined))
      .catch((caught) => setStorageError(caught instanceof Error ? caught.message : "形象库保存失败"));
  }, [hydrated, identities]);

  useEffect(() => {
    if (!hydrated) return;
    void saveWorkspaceState("workspace-registry", registry)
      .catch((caught) => setStorageError(caught instanceof Error ? caught.message : "工作区状态保存失败"));
  }, [hydrated, registry]);

  function activateProject(id: string) {
    const stored = recordsRef.current.get(id);
    if (!stored) return false;
    const identity = identities.find((candidate) => candidate.id === stored.identityProfileId);
    const next = ensureAuthorityVariants(identity ? syncProjectIdentity(stored, identity) : stored);
    setRegistry((current) => ({ ...current, activeProjectId: id, activeIdentityId: next.identityProfileId ?? current.activeIdentityId }));
    setProject(next);
    return true;
  }

  function preparePreviewSnapshot() {
    setProject((current) => characterProjectSchema.parse(structuredClone(refreshBundledProject(current))));
  }

  function addProject(nextProject: CharacterProject) {
    try {
      const next = ensureAuthorityVariants(nextProject);
      recordsRef.current.set(next.id, next);
      setRegistry((current) => ({
        activeProjectId: next.id,
        activeIdentityId: next.identityProfileId ?? current.activeIdentityId,
        projectIds: [...new Set([...current.projectIds, next.id])],
      }));
      setProject(next);
      return true;
    } catch (caught) {
      setStorageError(caught instanceof Error ? caught.message : "新项目保存失败");
      return false;
    }
  }

  function activateIdentity(id: string) {
    if (!identities.some((identity) => identity.id === id)) return false;
    setRegistry((current) => ({ ...current, activeIdentityId: id }));
    return true;
  }

  function addIdentity(identity: IdentityProfile) {
    setIdentities((current) => [identity, ...current]);
    setRegistry((current) => ({ ...current, activeIdentityId: identity.id }));
  }

  function updateIdentity(id: string, updater: (current: IdentityProfile) => IdentityProfile) {
    const currentIdentity = identities.find((identity) => identity.id === id);
    if (!currentIdentity) return;
    const updated = { ...updater(currentIdentity), updatedAt: new Date().toISOString() };
    setIdentities((current) => current.map((identity) => identity.id === id ? updated : identity));
    const linkedProjects = registry.projectIds
      .map((projectId) => projectId === project.id ? project : recordsRef.current.get(projectId))
      .filter((candidate): candidate is CharacterProject => Boolean(candidate))
      .filter((candidate) => candidate.identityProfileId === id)
      .map((candidate) => syncProjectIdentity(candidate, updated));
    for (const linked of linkedProjects) {
      recordsRef.current.set(linked.id, linked);
      void saveWorkspaceEntity("project", linked.id, linked);
    }
    if (linkedProjects.length > 0) {
      setProjects((current) => {
        const replacements = new Map(linkedProjects.map((linked) => [linked.id, summary(linked)]));
        return current.map((candidate) => replacements.get(candidate.id) ?? candidate);
      });
    }
    const activeLinked = linkedProjects.find((candidate) => candidate.id === project.id);
    if (activeLinked) setProject(activeLinked);
  }

  return {
    project,
    setProject,
    projects,
    identities,
    activeIdentity,
    storageError,
    hydrated,
    preparePreviewSnapshot,
    activateProject,
    addProject,
    activateIdentity,
    addIdentity,
    updateIdentity,
  };
}
