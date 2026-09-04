import {
  characterProjectSchema,
  defaultTransitionPlayback,
  petPackageManifestSchema,
  type CharacterProject,
  type AuthorityBridge,
  type IdleScheduler,
  type InteractionRegion,
  type PetPackageManifest,
  type RuntimeTransition,
  type TransitionTrigger,
} from "@petlord/schema";

export type RuntimePointerEvent = Extract<TransitionTrigger["event"], "hover" | "pointer-leave" | "left-click" | "right-click" | "double-click">;
export type RuntimeTimerEvent = Extract<TransitionTrigger["event"], "inactivity" | "state-timeout">;
export type NormalizedPoint = { x: number; y: number };

export class PackageBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackageBuildError";
  }
}

function selectedEndpointArtifactId(project: CharacterProject, transition: CharacterProject["transitions"][number]) {
  if (transition.endFrameSource === "authority-reference") return transition.targetDraftArtifactId;
  if (transition.endFrameSource === "source-frame") {
    return project.variants.find((variant) => variant.id === transition.fromVariantId)?.imageArtifactId;
  }
  return transition.extractedTailArtifactId;
}

export function reconcileTransitionEndpointVariants(projectInput: CharacterProject): CharacterProject {
  const project = characterProjectSchema.parse(projectInput);
  const variants = [...project.variants];
  const transitions = project.transitions.map((transition) => {
    if (transition.status !== "approved") return transition;
    if (transition.endFrameSource === "source-frame") {
      return { ...transition, toVariantId: transition.fromVariantId };
    }
    const endpointArtifactId = selectedEndpointArtifactId(project, transition);
    if (!endpointArtifactId) return transition;
    const linkedVariant = variants.find((variant) => variant.id === transition.toVariantId);
    if (linkedVariant?.status === "approved" && linkedVariant.imageArtifactId === endpointArtifactId) return transition;

    let endpointVariant = variants.find((variant) =>
      variant.status === "approved" &&
      variant.logicalStateId === transition.toLogicalStateId &&
      variant.imageArtifactId === endpointArtifactId);
    if (!endpointVariant) {
      const logicalState = project.logicalStates.find((state) => state.id === transition.toLogicalStateId);
      endpointVariant = {
        id: `variant-endpoint-${transition.id}-${transition.endFrameSource}-${endpointArtifactId}`,
        logicalStateId: transition.toLogicalStateId,
        label: `${logicalState?.label ?? transition.label} · ${transition.endFrameSource === "authority-reference" ? "权威参考" : "视频选帧"}`,
        status: "approved",
        imageArtifactId: endpointArtifactId,
        origin: transition.endFrameSource === "authority-reference"
          ? { kind: "reference", transitionId: transition.id }
          : { kind: "transition-tail", transitionId: transition.id },
      };
      variants.push(endpointVariant);
    }
    return { ...transition, toVariantId: endpointVariant.id };
  });

  return characterProjectSchema.parse({ ...project, variants, transitions });
}

export function buildPetPackage(projectInput: CharacterProject): PetPackageManifest {
  const project = reconcileTransitionEndpointVariants(projectInput);
  const artifacts = new Map(project.artifacts.map((artifact) => [artifact.id, artifact]));
  const approvedVariants = project.variants.filter((variant) => variant.status === "approved");
  const exportedVariantIds = new Set(approvedVariants.map((variant) => variant.id));

  const states = approvedVariants.map((variant) => {
    const image = artifacts.get(variant.imageArtifactId);
    if (!image) {
      throw new PackageBuildError(`Missing image artifact for state variant ${variant.label}.`);
    }
    return {
      id: variant.id,
      logicalStateId: variant.logicalStateId,
      label: variant.label,
      imageUri: image.uri,
      origin: variant.origin.kind,
    } as const;
  });

  const transitions = project.transitions
    .filter((transition) => transition.status === "approved")
    .map((transition) => {
      const sourceVariant = project.variants.find((variant) => variant.id === transition.fromVariantId);
      const endArtifactId = transition.endFrameSource === "authority-reference"
        ? transition.targetDraftArtifactId
        : transition.endFrameSource === "source-frame"
          ? sourceVariant?.imageArtifactId
          : transition.extractedTailArtifactId;
      if (!transition.toVariantId || !transition.videoArtifactId || !endArtifactId) {
        throw new PackageBuildError(`Approved transition ${transition.label} is incomplete.`);
      }
      if (!exportedVariantIds.has(transition.fromVariantId) || !exportedVariantIds.has(transition.toVariantId)) {
        throw new PackageBuildError(`Approved transition ${transition.label} points to a draft state.`);
      }

      const video = artifacts.get(transition.videoArtifactId);
      const tail = artifacts.get(endArtifactId);
      const target = project.variants.find((variant) => variant.id === transition.toVariantId);
      if (!video || !tail || !target) {
        throw new PackageBuildError(`Approved transition ${transition.label} has missing artifacts.`);
      }
      if (target.imageArtifactId !== tail.id) {
        throw new PackageBuildError(`Target state for ${transition.label} does not match its selected end frame.`);
      }

      return {
        id: transition.id,
        fromStateId: transition.fromVariantId,
        toStateId: transition.toVariantId,
        videoUri: video.uri,
        tailFrameUri: tail.uri,
        durationMs: transition.endFrameSource !== "video-frame"
          ? transition.sourceVideoDurationMs ?? transition.durationMs
          : transition.durationMs,
        entryBlendMs: transition.entryBlendMs ?? 420,
        endFrameSource: transition.endFrameSource,
        transparentVideo: video.hasAlpha ?? false,
        authorityBridge: transition.authorityBridge,
        idleRule: transition.idleRule,
        playback: transition.playback ?? defaultTransitionPlayback,
        triggers: transition.triggers,
      } satisfies RuntimeTransition;
    });

  if (!project.initialVariantId || !exportedVariantIds.has(project.initialVariantId)) {
    throw new PackageBuildError("Project needs an approved initial display state before preview or publishing.");
  }

  const manifest = {
    manifestVersion: 1,
    id: project.id,
    name: project.name,
    characterName: project.characterName,
    runtimePresentation: {
      defaultFrameRate: project.runtimePresentation?.defaultFrameRate ?? 24,
      defaultRenderResolution: project.runtimePresentation?.defaultRenderResolution ?? 480,
      defaultPixelGridSize: project.runtimePresentation?.defaultPixelGridSize ?? 64,
      defaultDisplaySize: project.runtimePresentation?.defaultDisplaySize ?? 320,
      pixelated: project.runtimePresentation?.pixelated ?? false,
    },
    initialStateId: project.initialVariantId,
    states,
    transitions,
    logicalStates: project.logicalStates.map((state) => {
      const gazeVideo = state.pointerGaze?.videoArtifactId
        ? artifacts.get(state.pointerGaze.videoArtifactId)
        : undefined;
      return {
        id: state.id,
        label: state.label,
        variantIds: approvedVariants
          .filter((variant) => variant.logicalStateId === state.id)
          .map((variant) => variant.id),
        idleScheduler: state.idleScheduler,
        pointerGaze: state.pointerGaze ? {
          enabled: state.pointerGaze.enabled,
          motionTarget: state.pointerGaze.motionTarget,
          activationRadius: state.pointerGaze.activationRadius,
          anchor: state.pointerGaze.anchor,
          videoUri: gazeVideo?.uri,
          durationMs: state.pointerGaze.durationMs,
          segmentStartMs: state.pointerGaze.segmentStartMs,
          segmentEndMs: state.pointerGaze.segmentEndMs,
          directionKeyframesMs: state.pointerGaze.directionKeyframesMs,
          blendDurationMs: state.pointerGaze.blendDurationMs,
        } : undefined,
      };
    }),
    dragInteraction: (() => {
      if (!project.dragInteraction?.enabled) return undefined;
      const targetState = project.logicalStates.find((state) => state.id === project.dragInteraction?.targetLogicalStateId);
      const targetVariant = approvedVariants.find((variant) => variant.id === targetState?.defaultVariantId)
        ?? approvedVariants.find((variant) => variant.logicalStateId === targetState?.id);
      return targetVariant ? {
        enabled: true,
        targetStateId: targetVariant.id,
        anchor: project.dragInteraction.anchor,
        alignmentDurationMs: project.dragInteraction.alignmentDurationMs,
        returnDurationMs: project.dragInteraction.returnDurationMs,
      } : undefined;
    })(),
    semanticActions: Object.fromEntries(
      project.logicalStates
        .filter((state) => state.semanticKey)
        .map((state) => [state.semanticKey as string, state.id]),
    ),
    plugins: project.plugins,
  } satisfies PetPackageManifest;

  return petPackageManifestSchema.parse(manifest);
}

export function resolveTransitionSourceArtifact(projectInput: CharacterProject, transitionId: string) {
  const project = characterProjectSchema.parse(projectInput);
  const transition = project.transitions.find((candidate) => candidate.id === transitionId);
  const sourceVariant = project.variants.find((variant) => variant.id === transition?.fromVariantId);
  return project.artifacts.find((artifact) => artifact.id === sourceVariant?.imageArtifactId);
}

export function findPathToLogicalState(
  manifestInput: PetPackageManifest,
  fromStateId: string,
  targetLogicalStateId: string,
): RuntimeTransition[] | null {
  const manifest = petPackageManifestSchema.parse(manifestInput);
  const states = new Map(manifest.states.map((state) => [state.id, state]));
  const start = states.get(fromStateId);
  if (!start) return null;
  if (start.logicalStateId === targetLogicalStateId) return [];

  const outgoing = new Map<string, RuntimeTransition[]>();
  for (const transition of manifest.transitions) {
    const list = outgoing.get(transition.fromStateId) ?? [];
    list.push(transition);
    outgoing.set(transition.fromStateId, list);
  }

  const queue: Array<{ stateId: string; path: RuntimeTransition[] }> = [
    { stateId: fromStateId, path: [] },
  ];
  const visited = new Set([fromStateId]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const transition of outgoing.get(current.stateId) ?? []) {
      if (visited.has(transition.toStateId)) continue;
      const path = [...current.path, transition];
      const target = states.get(transition.toStateId);
      if (target?.logicalStateId === targetLogicalStateId) return path;
      visited.add(transition.toStateId);
      queue.push({ stateId: transition.toStateId, path });
    }
  }

  return null;
}

export function resolveSemanticAction(
  manifest: PetPackageManifest,
  fromStateId: string,
  action: string,
): RuntimeTransition[] | null {
  const logicalStateId = manifest.semanticActions[action];
  if (!logicalStateId) return null;
  return findPathToLogicalState(manifest, fromStateId, logicalStateId);
}

export function pointIsInsideInteractionRegion(
  point: NormalizedPoint,
  region?: InteractionRegion,
): boolean {
  if (!region) return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
  if (point.x < region.x || point.x > region.x + region.width || point.y < region.y || point.y > region.y + region.height) {
    return false;
  }
  if (region.shape === "rectangle") return true;

  const radiusX = region.width / 2;
  const radiusY = region.height / 2;
  const centerX = region.x + radiusX;
  const centerY = region.y + radiusY;
  const normalizedX = (point.x - centerX) / radiusX;
  const normalizedY = (point.y - centerY) / radiusY;
  return normalizedX ** 2 + normalizedY ** 2 <= 1;
}

export function findRuntimeTrigger(
  transitions: RuntimeTransition[],
  event: RuntimePointerEvent,
  point: NormalizedPoint,
): { transition: RuntimeTransition; trigger: TransitionTrigger } | null {
  for (const transition of transitions) {
    const trigger = transition.triggers.find((candidate) =>
      candidate.enabled && candidate.event === event && pointIsInsideInteractionRegion(point, candidate.region));
    if (trigger) return { transition, trigger };
  }
  return null;
}

export function findNextRuntimeTimerTrigger(input: {
  transitions: RuntimeTransition[];
  stateEnteredAt: number;
  lastInteractionAt: number;
}): { transition: RuntimeTransition; trigger: TransitionTrigger; dueAt: number } | null {
  let next: { transition: RuntimeTransition; trigger: TransitionTrigger; dueAt: number } | null = null;
  for (const transition of input.transitions) {
    for (const trigger of transition.triggers) {
      if (!trigger.enabled || (trigger.event !== "inactivity" && trigger.event !== "state-timeout")) continue;
      const timerDurationMs = trigger.timerDurationMs ?? 60_000;
      const baseline = trigger.event === "inactivity"
        ? Math.max(input.stateEnteredAt, input.lastInteractionAt)
        : input.stateEnteredAt;
      const dueAt = baseline + timerDurationMs;
      if (!next || dueAt < next.dueAt) next = { transition, trigger, dueAt };
    }
  }
  return next;
}

export function computeAuthorityBridgeProgress(input: {
  elapsedMs: number;
  bridge: AuthorityBridge;
}) {
  if (input.bridge.mode === "hard-cut") return 0;
  const linear = Math.max(0, Math.min(1, input.elapsedMs / input.bridge.durationMs));
  return linear * linear * (3 - 2 * linear);
}

export function computeIdleDelay(scheduler: IdleScheduler, randomValue: number) {
  if (scheduler.playbackMode === "continuous") return 0;
  const normalized = Math.max(0, Math.min(0.999_999, randomValue));
  return Math.round(scheduler.minIntervalMs + (scheduler.maxIntervalMs - scheduler.minIntervalMs) * normalized);
}

export function selectIdleTransition(input: {
  transitions: RuntimeTransition[];
  scheduler: IdleScheduler;
  now: number;
  randomValue: number;
  roundRobinCursor: number;
  lastTransitionId?: string;
  lastPlayedAt?: Record<string, number>;
}): { transition: RuntimeTransition; nextRoundRobinCursor: number } | null {
  let eligible = input.transitions.filter((transition) => {
    if (!transition.idleRule || transition.idleRule.enabled === false) return false;
    const lastPlayedAt = input.lastPlayedAt?.[transition.id];
    return lastPlayedAt === undefined || input.now - lastPlayedAt >= (transition.idleRule.cooldownMs ?? 0);
  });
  if (input.scheduler.avoidImmediateRepeat && eligible.length > 1 && input.lastTransitionId) {
    eligible = eligible.filter((transition) => transition.id !== input.lastTransitionId);
  }
  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, transition) => sum + (transition.idleRule?.weight ?? 1), 0);
  if (input.scheduler.strategy === "weighted-random") {
    let slot = Math.max(0, Math.min(0.999_999, input.randomValue)) * totalWeight;
    for (const transition of eligible) {
      slot -= transition.idleRule?.weight ?? 1;
      if (slot < 0) return { transition, nextRoundRobinCursor: input.roundRobinCursor };
    }
    return { transition: eligible[eligible.length - 1] as RuntimeTransition, nextRoundRobinCursor: input.roundRobinCursor };
  }

  let slot = ((input.roundRobinCursor % totalWeight) + totalWeight) % totalWeight;
  for (const transition of eligible) {
    const weight = transition.idleRule?.weight ?? 1;
    if (slot < weight) return { transition, nextRoundRobinCursor: input.roundRobinCursor + 1 };
    slot -= weight;
  }
  return { transition: eligible[0] as RuntimeTransition, nextRoundRobinCursor: input.roundRobinCursor + 1 };
}
