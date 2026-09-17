import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
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
import { listWorkspaceEntities, readWorkspaceState, saveWorkspaceEntity, saveWorkspaceState, workspaceClient, WorkspaceSaveError } from "../workspaceApi";
import { mergeWorkspaceChanges, workspaceValuesEqual } from "../workspaceMerge";

export async function activateProjectAfterPersist(projectId: string, adapter: {
  persist(): Promise<unknown>;
  activate(projectId: string): boolean;
}) {
  await adapter.persist();
  if (!adapter.activate(projectId)) throw new Error("关联项目不存在或已经损坏。");
}

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
  importedPackage?: CharacterProject["importedPackage"];
  thumbnailNative?: boolean;
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
  const thumbnailArtifact = project.artifacts.find((artifact) => artifact.id === initialVariant?.imageArtifactId);
  const thumbnail = thumbnailArtifact?.uri;
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
    importedPackage: project.importedPackage,
    thumbnailNative: Boolean(thumbnailArtifact?.nativePixel),
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

export function migrateProjectsAndIdentities(projects: CharacterProject[], storedIdentities: IdentityProfile[]) {
  const storedIdentityIds = new Set(storedIdentities.map((identity) => identity.id));
  const identities = storedIdentities.map((identity) => ({
    ...identity,
    identityPrompt: templateCharacterNamePrompt(identity.identityPrompt, identity.name),
  }));
  const synthesized = new Map<string, IdentityProfile>();
  const migratedProjects = projects.map((sourceProject) => {
    const rawProject = normalizeProjectPromptTemplates(sourceProject);
    // A project can own its references without creating a shared identity.
    if (!rawProject.identityProfileId) return ensureAuthorityVariants(rawProject);
    let identity = rawProject.identityProfileId
      ? identities.find((candidate) => candidate.id === rawProject.identityProfileId)
      : undefined;
    // Live shared references are authoritative; project snapshots may be stale.
    if (identity && storedIdentityIds.has(identity.id)) {
      return ensureAuthorityVariants(syncProjectIdentity(rawProject, identity));
    }
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
  const [project, setProjectState] = useState<CharacterProject>(initial.project);
  const [projects, setProjects] = useState<ProjectSummary[]>(initial.summaries);
  const [identities, setIdentitiesState] = useState<IdentityProfile[]>(initial.identities);
  const [registry, setRegistry] = useState<WorkspaceRegistry>(initial.registry);
  const recordsRef = useRef(new Map(initial.records.map((record) => [record.id, record])));
  const projectRef = useRef(project);
  const identitiesRef = useRef(identities);
  const refreshRef = useRef<() => Promise<void>>(async () => undefined);
  const setProject = useCallback((action: SetStateAction<CharacterProject>) => {
    const next = typeof action === "function" ? action(projectRef.current) : action;
    projectRef.current = next;
    recordsRef.current.set(next.id, next);
    setProjectState(next);
  }, []);
  const setIdentities = useCallback((action: SetStateAction<IdentityProfile[]>) => {
    const next = typeof action === "function" ? action(identitiesRef.current) : action;
    identitiesRef.current = next;
    setIdentitiesState(next);
  }, []);
  const [storageConflict, setStorageConflict] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pendingProjectChanges = useRef(new Set<string>());
  const failedProjectChanges = useRef(new Map<string, string>());
  const [pendingProjectChangeError, setPendingProjectChangeError] = useState<string>();
  const [projectSaveRevision, setProjectSaveRevision] = useState(0);
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
      const preferredProject = migrated.projects.find(candidate => candidate.id === preferredProjectId);
      const storedProject = migrated.projects.find(candidate => candidate.id === storedRegistry?.activeProjectId);
      const nextProject = preferredProject ?? storedProject ?? migrated.projects[0];
      const nextRegistry: WorkspaceRegistry = {
        ...storedRegistry,
        activeProjectId: nextProject.id,
        activeIdentityId: preferredProject?.identityProfileId
          ?? storedRegistry?.activeIdentityId
          ?? nextProject.identityProfileId
          ?? migrated.identities[0]?.id,
        projectIds: migrated.projects.map((candidate) => candidate.id),
      };
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
    if (!hydrated || pendingProjectChanges.current.has(project.id) || failedProjectChanges.current.has(project.id)) return;
    recordsRef.current.set(project.id, project);
    setRegistry((current) => ({ ...current, activeProjectId: project.id, projectIds: [...new Set([...current.projectIds, project.id])] }));
    setProjects((current) => [...current.filter((candidate) => candidate.id !== project.id), summary(project)]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
    void saveWorkspaceEntity("project", project.id, project)
      .then((saved) => {
        const current = projectRef.current;
        if (current.id === project.id) {
          const merged = mergeWorkspaceChanges(project, current, saved.data);
          if (!merged.conflicts.length && !workspaceValuesEqual(current, merged.value)) setProject(merged.value);
        }
        setStorageError(undefined);
        setStorageConflict(false);
      })
      .catch((caught) => {
        setStorageError(caught instanceof Error ? caught.message : "项目保存失败");
        setStorageConflict(caught instanceof WorkspaceSaveError && ["REVISION_CONFLICT", "NOT_FOUND"].includes(caught.code));
      });
  }, [hydrated, project, projectSaveRevision]);

  useEffect(() => {
    if (!hydrated) return;
    void Promise.all(identities.map((identity) => saveWorkspaceEntity("identity", identity.id, identity)))
      .then((saved) => {
        const current = identitiesRef.current;
        const next = current.map(identity => {
          const before = identities.find(candidate => candidate.id === identity.id);
          const remote = saved.find(candidate => candidate.data.id === identity.id)?.data;
          if (!before || !remote) return identity;
          const merged = mergeWorkspaceChanges(before, identity, remote);
          return merged.conflicts.length ? identity : merged.value;
        });
        if (!workspaceValuesEqual(current, next)) setIdentities(next);
      })
      .catch((caught) => { setStorageError(caught instanceof Error ? caught.message : "形象库保存失败"); setStorageConflict(caught instanceof WorkspaceSaveError && caught.code === "REVISION_CONFLICT"); });
  }, [hydrated, identities]);

  useEffect(() => {
    if (!hydrated) return;
    void saveWorkspaceState("workspace-registry", registry)
      .catch((caught) => setStorageError(caught instanceof Error ? caught.message : "工作区状态保存失败"));
  }, [hydrated, registry]);

  useEffect(() => {
    if (!hydrated) return;
    let disposed = false;
    let running = false;
    const refresh = async () => {
      if (disposed || running || document.hidden) return;
      running = true;
      try {
        const [remoteProjects, remoteIdentities] = await Promise.all([
          workspaceClient.snapshots<unknown>("project"),
          workspaceClient.snapshots<unknown>("identity"),
        ]);
        if (disposed) return;
        let projectsChanged = false;
        const remoteIds = new Set<string>();
        for (const snapshot of remoteProjects) {
          const parsed = characterProjectSchema.safeParse(snapshot.data);
          if (!parsed.success) continue;
          const remote = parsed.data;
          remoteIds.add(remote.id);
          const local = recordsRef.current.get(remote.id);
          if (local && !workspaceClient.isClean("project", remote.id, local)) continue;
          workspaceClient.adopt("project", { data: remote, revision: snapshot.revision });
          if (!local || !workspaceValuesEqual(local, remote)) {
            recordsRef.current.set(remote.id, remote);
            projectsChanged = true;
            if (projectRef.current.id === remote.id) setProject(remote);
          }
        }
        for (const [id, local] of recordsRef.current) {
          if (remoteIds.has(id) || !workspaceClient.isClean("project", id, local)) continue;
          recordsRef.current.delete(id);
          projectsChanged = true;
          if (projectRef.current.id === id) {
            const replacement = [...recordsRef.current.values()].find(item => remoteIds.has(item.id));
            if (replacement) setProject(replacement);
            else { setStorageError("当前项目已被其他窗口或 Agent 删除。本地画面仍保留，可以另存为副本。"); setStorageConflict(true); }
          }
        }
        if (projectsChanged) {
          const values = [...recordsRef.current.values()];
          setProjects(values.map(summary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
          setRegistry(current => ({ ...current, projectIds: values.map(p => p.id), activeProjectId: projectRef.current.id }));
        }
        const remoteIdentityIds = new Set(remoteIdentities.map(snapshot => (snapshot.data as {id?: string})?.id));
        const nextIdentities = identitiesRef.current.filter(identity => remoteIdentityIds.has(identity.id) || !workspaceClient.isClean("identity", identity.id, identity));
        let identitiesChanged = nextIdentities.length !== identitiesRef.current.length;
        for (const snapshot of remoteIdentities) {
          const parsed = identityProfileSchema.safeParse(snapshot.data);
          if (!parsed.success) continue;
          const remote = parsed.data;
          const index = nextIdentities.findIndex(i => i.id === remote.id);
          const local = nextIdentities[index];
          if (local && !workspaceClient.isClean("identity", remote.id, local)) continue;
          workspaceClient.adopt("identity", { data: remote, revision: snapshot.revision });
          if (!local || !workspaceValuesEqual(local, remote)) {
            if (index < 0) nextIdentities.push(remote); else nextIdentities[index] = remote;
            identitiesChanged = true;
          }
        }
        if (identitiesChanged) setIdentities(nextIdentities);
      } catch (caught) {
        if (!disposed) setStorageError(caught instanceof Error ? caught.message : "无法同步工作区。");
      } finally { running = false; }
    };
    refreshRef.current = refresh;
    const notify = () => { void refresh(); };
    const timer = window.setInterval(notify, 2000);
    window.addEventListener("focus", notify);
    window.addEventListener("petlord:workspace-changed", notify);
    document.addEventListener("visibilitychange", notify);
    return () => {
      disposed = true; window.clearInterval(timer);
      window.removeEventListener("focus", notify);
      window.removeEventListener("petlord:workspace-changed", notify);
      document.removeEventListener("visibilitychange", notify);
    };
  }, [hydrated, setProject, setIdentities]);

  async function reloadWorkspace() {
    try {
      const currentId = projectRef.current.id;
      await workspaceClient.settle("project", currentId);
      const snapshots = await workspaceClient.snapshots<CharacterProject>("project");
      const latest = snapshots.find(snapshot => snapshot.data.id === currentId) ?? snapshots[0];
      if (!latest) throw new Error("服务器中没有可载入的项目，请将本地内容另存为副本。");
      const data = characterProjectSchema.parse(latest.data);
      workspaceClient.adopt("project", { data, revision: latest.revision });
      setProject(data);
      await Promise.all(identitiesRef.current.map(identity => workspaceClient.settle("identity", identity.id)));
      const identitySnapshots = await workspaceClient.snapshots<IdentityProfile>("identity");
      const identities = identitySnapshots.map(snapshot => {
        const identity = identityProfileSchema.parse(snapshot.data);
        workspaceClient.adopt("identity", { data: identity, revision: snapshot.revision });
        return identity;
      });
      setIdentities(identities);
      setStorageError(undefined); setStorageConflict(false);
      await refreshRef.current();
    } catch (caught) { setStorageError(caught instanceof Error ? caught.message : "重新载入失败。"); }
  }

  async function saveConflictCopy() {
    const copy = { ...structuredClone(projectRef.current), id: `project-${crypto.randomUUID()}`, name: `${projectRef.current.name} · 本地副本`, updatedAt: new Date().toISOString() };
    try {
      await saveWorkspaceEntity("project", copy.id, copy);
      setProject(copy);
      setStorageError(undefined); setStorageConflict(false);
    } catch (caught) { setStorageError(caught instanceof Error ? caught.message : "副本保存失败。"); }
  }

  async function persistProject() {
    const current = projectRef.current;
    if (pendingProjectChanges.current.has(current.id)) throw new Error("请等待项目配置保存完成。");
    const saved = await saveWorkspaceEntity("project", current.id, current);
    const merged = mergeWorkspaceChanges(current, projectRef.current, saved.data);
    if (!merged.conflicts.length && !workspaceValuesEqual(projectRef.current, merged.value)) setProject(merged.value);
    return saved;
  }

  function rememberProjectChangeFailure(projectId: string, caught: unknown) {
    const name = recordsRef.current.get(projectId)?.name ?? projectId;
    const message = caught instanceof Error ? caught.message : "项目保存失败";
    failedProjectChanges.current.set(projectId, `“${name}”的并发修改尚未保存：${message}。修改已保留，请重试保存。`);
    setPendingProjectChangeError([...failedProjectChanges.current.values()].join(" "));
  }

  function commitConfirmedProjectChange(projectId: string, before: CharacterProject, confirmed: CharacterProject) {
    const current = recordsRef.current.get(projectId) ?? before;
    const merged = mergeWorkspaceChanges(before, current, confirmed);
    recordsRef.current.set(projectId, merged.value);
    if (projectRef.current.id === projectId) setProject(merged.value);
    setProjects(items => items.map(item => item.id === projectId ? summary(merged.value) : item));
    if (merged.conflicts.length) throw new WorkspaceSaveError("REVISION_CONFLICT", "项目配置与同时发生的修改冲突；本地修改已保留，请核对后重试。", merged.conflicts);
  }

  /** Drain local differences for the originating project, even if another project is active. */
  async function persistRemainingProjectChanges(projectId: string, confirmed: { data: CharacterProject; revision: number }) {
    let saved = confirmed;
    while (true) {
      const current = recordsRef.current.get(projectId);
      if (!current || workspaceValuesEqual(current, saved.data)) return saved;
      const next = await saveWorkspaceEntity("project", projectId, current);
      commitConfirmedProjectChange(projectId, current, next.data);
      saved = next;
    }
  }

  async function retryPendingProjectChanges() {
    for (const projectId of [...failedProjectChanges.current.keys()]) {
      if (pendingProjectChanges.current.has(projectId)) continue;
      pendingProjectChanges.current.add(projectId);
      try {
        await workspaceClient.settle("project", projectId);
        const confirmed = workspaceClient.confirmed<CharacterProject>("project", projectId);
        if (!confirmed) throw new Error("找不到已确认的项目版本，请保留本地副本。");
        // A manual retry releases the failed queue while retaining its confirmed revision.
        // The usual revision checks and three-way conflict handling still apply.
        workspaceClient.adopt("project", confirmed);
        await persistRemainingProjectChanges(projectId, confirmed);
        failedProjectChanges.current.delete(projectId);
        setPendingProjectChangeError([...failedProjectChanges.current.values()].join(" ") || undefined);
      } catch (caught) { rememberProjectChangeFailure(projectId, caught); }
      finally {
        pendingProjectChanges.current.delete(projectId);
        if (projectRef.current.id === projectId) setProjectSaveRevision(revision => revision + 1);
      }
    }
  }

  /** Persist a dialog draft before exposing it; ordinary edits made during the PUT stay local. */
  async function persistProjectChange(updater: (current: CharacterProject) => CharacterProject) {
    const projectId = projectRef.current.id;
    if (pendingProjectChanges.current.has(projectId)) throw new Error("请等待项目配置保存完成。");
    if (failedProjectChanges.current.has(projectId)) throw new Error("请先使用“重试保存”保存这个项目保留的修改。");
    pendingProjectChanges.current.add(projectId);
    let committed = false;
    try {
      await workspaceClient.settle("project", projectId);
      if (projectRef.current.id !== projectId) throw new Error("项目已切换，请重新配置参考图。");
      const before = projectRef.current;
      const desired = characterProjectSchema.parse({ ...updater(before), updatedAt: new Date().toISOString() });
      if (desired.id !== projectId) throw new Error("项目配置不能更改项目 ID。");
      const saved = await saveWorkspaceEntity("project", projectId, desired);
      committed = true;
      commitConfirmedProjectChange(projectId, before, saved.data);
      return await persistRemainingProjectChanges(projectId, saved);
    } catch (caught) {
      if (committed) rememberProjectChangeFailure(projectId, caught);
      throw caught;
    } finally {
      pendingProjectChanges.current.delete(projectId);
      if (projectRef.current.id === projectId) setProjectSaveRevision(revision => revision + 1);
    }
  }

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
      void saveWorkspaceEntity("project", linked.id, linked).then(saved => {
        const latest = recordsRef.current.get(linked.id);
        if (!latest) return;
        const rebased = mergeWorkspaceChanges(linked, latest, saved.data);
        if (rebased.conflicts.length) throw new WorkspaceSaveError("REVISION_CONFLICT", "关联项目也有新的编辑，本地内容已保留。", rebased.conflicts);
        recordsRef.current.set(linked.id, rebased.value);
        setProjects(current => current.map(item => item.id === linked.id ? summary(rebased.value) : item));
        if (projectRef.current.id === linked.id && !workspaceValuesEqual(projectRef.current, rebased.value)) setProject(rebased.value);
      }).catch(caught => { setStorageError(caught instanceof Error ? caught.message : "关联项目保存失败"); setStorageConflict(caught instanceof WorkspaceSaveError && caught.code === "REVISION_CONFLICT"); });
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
    storageError: pendingProjectChangeError ?? storageError,
    pendingProjectChangeError,
    retryPendingProjectChanges,
    storageConflict,
    reloadWorkspace,
    saveConflictCopy,
    persistProject,
    persistProjectChange,
    hydrated,
    preparePreviewSnapshot,
    activateProject,
    addProject,
    activateIdentity,
    addIdentity,
    updateIdentity,
  };
}
