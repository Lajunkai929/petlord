import { defaultTransitionPlayback, petPackageManifestSchema, type PetPackageManifest, type RuntimePointerGaze, type RuntimeState, type RuntimeTransition, type TransitionTrigger } from "@petlord/schema";
import {
  computeAuthorityBridgeProgress,
  computeIdleDelay,
  findNextRuntimeTimerTrigger,
  findRuntimeTrigger,
  resolveSemanticAction,
  selectIdleTransition,
  type NormalizedPoint,
  type RuntimePointerEvent,
} from "@petlord/state-engine";

export type RuntimePhase = "idle" | "video" | "bridge";
export type RuntimeStartSource = "manual" | "pointer" | "timer" | "idle" | "semantic" | "queue" | "drag";
export type RuntimeEventType =
  | "manifest-loaded"
  | "interaction"
  | "transition-interrupted"
  | "transition-started"
  | "bridge-started"
  | "state-entered"
  | "state-jumped"
  | "runtime-reset"
  | "action-rejected"
  | "idle-deferred";

export interface RuntimeEvent {
  id: number;
  type: RuntimeEventType;
  at: number;
  stateId: string;
  transitionId?: string;
  source?: RuntimeStartSource;
  detail?: string;
}

export interface RuntimeTimedSchedule {
  transitionId: string;
  triggerId: string;
  event: "inactivity" | "state-timeout";
  durationMs: number;
  dueAt: number;
}

export interface RuntimeHoverSchedule {
  transitionId: string;
  triggerId: string;
  dueAt: number;
  repeatWhileHovered: boolean;
}

export interface PetRuntimeSnapshot {
  revision: number;
  currentStateId: string;
  activeTransitionId: string | null;
  activeTransitionRunId: number;
  activePlaybackCycles: number;
  queuedTransitionIds: string[];
  phase: RuntimePhase;
  bridgeProgress: number;
  stateEnteredAt: number;
  lastInteractionAt: number;
  nextTimedTrigger: RuntimeTimedSchedule | null;
  nextIdleDueAt: number | null;
  nextHoverTrigger: RuntimeHoverSchedule | null;
  pointerInside: boolean;
  lastEvent: RuntimeEvent;
  events: RuntimeEvent[];
}

export interface PetRuntimeCoreOptions {
  now?: () => number;
  random?: () => number;
  eventHistoryLimit?: number;
}

export interface RuntimeActionResult {
  accepted: boolean;
  reason?: string;
}

export function pointIsWithinPointerGazeRange(point: NormalizedPoint, activationRadius: number) {
  const dx = point.x - 0.5;
  const dy = point.y - 0.5;
  return Math.hypot(dx, dy) <= activationRadius;
}

export function pointerGazeProgress(point: NormalizedPoint, previousProgress = 0.5) {
  const dx = point.x - 0.5;
  const dy = point.y - 0.5;
  if (Math.hypot(dx, dy) < 0.08) return previousProgress;
  const clockwiseFromLeft = (Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2);
  return (clockwiseFromLeft + 1) % 1;
}

export function pointerGazeTimeMs(
  gaze: Pick<RuntimePointerGaze, "directionKeyframesMs" | "durationMs" | "segmentStartMs" | "segmentEndMs">,
  progress: number,
) {
  const durationMs = Math.max(1, gaze.durationMs ?? gaze.segmentEndMs ?? 6000);
  const keyframes = gaze.directionKeyframesMs;
  if (!keyframes?.length) {
    const startMs = Math.max(0, Math.min(durationMs, gaze.segmentStartMs ?? 0));
    const endMs = Math.max(startMs + 1, Math.min(durationMs, gaze.segmentEndMs ?? durationMs));
    return startMs + Math.max(0, Math.min(1, progress)) * (endMs - startMs);
  }
  const circularProgress = ((progress % 1) + 1) % 1;
  const position = circularProgress * keyframes.length;
  const index = Math.floor(position) % keyframes.length;
  const nextIndex = (index + 1) % keyframes.length;
  const localProgress = position - Math.floor(position);
  const currentMs = Math.max(0, Math.min(durationMs, keyframes[index]));
  const nextMs = Math.max(0, Math.min(durationMs, keyframes[nextIndex]));
  if (nextIndex === 0 && nextMs <= currentMs) {
    const wrappedMs = currentMs + (nextMs + durationMs - currentMs) * localProgress;
    return wrappedMs >= durationMs ? wrappedMs - durationMs : wrappedMs;
  }
  return currentMs + (nextMs - currentMs) * localProgress;
}

export function selectTransitionPlaybackCycles(transition: Pick<RuntimeTransition, "playback">, randomValue: number) {
  const playback = transition.playback ?? defaultTransitionPlayback;
  if (playback.repeatMode === "fixed") return playback.minCycles;
  const cycleRange = Math.max(0, playback.maxCycles - playback.minCycles);
  return playback.minCycles + Math.min(cycleRange, Math.floor(Math.max(0, Math.min(0.999999, randomValue)) * (cycleRange + 1)));
}

export class PetRuntimeCore {
  readonly manifest: PetPackageManifest;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly eventHistoryLimit: number;
  private readonly listeners = new Set<() => void>();
  private revision = 0;
  private eventSequence = 0;
  private currentStateId: string;
  private activeTransitionId: string | null = null;
  private activeTransitionSource: RuntimeStartSource | null = null;
  private activeTransitionRunId = 0;
  private activePlaybackCycles = 1;
  private queuedTransitionIds: string[] = [];
  private phase: RuntimePhase = "idle";
  private bridgeProgress = 0;
  private bridgeStartedAt: number | null = null;
  private stateEnteredAt: number;
  private lastInteractionAt: number;
  private nextTimedTrigger: RuntimeTimedSchedule | null = null;
  private nextIdleDueAt: number | null = null;
  private nextHoverTrigger: RuntimeHoverSchedule | null = null;
  private pointerInside = false;
  private pointerPoint: NormalizedPoint | null = null;
  private hoverLoopTransitionId?: string;
  private pendingPointerLeave = false;
  private roundRobinCursor = 0;
  private lastIdleTransitionId?: string;
  private readonly idleLastPlayedAt: Record<string, number> = {};
  private events: RuntimeEvent[] = [];
  private snapshotValue: PetRuntimeSnapshot;

  constructor(manifestInput: PetPackageManifest, options: PetRuntimeCoreOptions = {}) {
    this.manifest = petPackageManifestSchema.parse(manifestInput);
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    this.eventHistoryLimit = Math.max(10, options.eventHistoryLimit ?? 40);
    const timestamp = this.now();
    this.currentStateId = this.manifest.initialStateId;
    this.stateEnteredAt = timestamp;
    this.lastInteractionAt = timestamp;
    this.pushEvent("manifest-loaded", timestamp, { detail: this.manifest.id });
    this.refreshSchedules(timestamp, true);
    this.snapshotValue = this.createSnapshot();
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = () => this.snapshotValue;

  currentState(): RuntimeState | undefined {
    return this.manifest.states.find((state) => state.id === this.currentStateId);
  }

  activeTransition(): RuntimeTransition | undefined {
    return this.manifest.transitions.find((transition) => transition.id === this.activeTransitionId);
  }

  outgoingTransitions(): RuntimeTransition[] {
    return this.manifest.transitions.filter((transition) => transition.fromStateId === this.currentStateId);
  }

  /**
   * A self-loop does not move the pet into an intermediate logical state. It is
   * only the animated presentation of the current static state, so user input
   * and state timers must continue to resolve from that state while it plays.
   */
  private activeStateDisplayLoop() {
    const active = this.activeTransition();
    return active && active.fromStateId === this.currentStateId && active.toStateId === this.currentStateId
      ? active
      : undefined;
  }

  private interruptibleTransition() {
    const active = this.activeTransition();
    if (!active) return undefined;
    if (this.activeStateDisplayLoop()) return active;
    return (this.activeTransitionSource === "idle" || this.activeTransitionSource === "timer") && active.fromStateId === this.currentStateId
      ? active
      : undefined;
  }

  pointerMatch(event: RuntimePointerEvent, point: NormalizedPoint) {
    if (this.activeTransitionId && !this.interruptibleTransition()) return null;
    return findRuntimeTrigger(this.outgoingTransitions(), event, point);
  }

  movePointer(point: NormalizedPoint, at = this.now()) {
    this.pointerInside = true;
    this.pointerPoint = point;
    this.lastInteractionAt = at;
    this.refreshSchedules(at, true);
    const matched = this.pointerMatch("hover", point);
    this.updateHoverSchedule(matched, at);
    this.publish();
  }

  private updateHoverSchedule(matched: ReturnType<typeof findRuntimeTrigger>, at: number) {
    const currentKey = this.nextHoverTrigger ? `${this.nextHoverTrigger.transitionId}:${this.nextHoverTrigger.triggerId}` : null;
    const nextKey = matched ? `${matched.transition.id}:${matched.trigger.id}` : null;
    if (!matched) {
      this.nextHoverTrigger = null;
      this.hoverLoopTransitionId = undefined;
    } else if (this.activeStateDisplayLoop()?.id === matched.transition.id) {
      // Pointer movement during an active hover loop must not arm the same
      // transition again. Otherwise the due timer interrupts and restarts the
      // video every hoverDurationMs, so a long clip can never finish.
      this.nextHoverTrigger = null;
      this.hoverLoopTransitionId = matched.trigger.repeatWhileHovered ? matched.transition.id : undefined;
    } else if (currentKey !== nextKey) {
      this.nextHoverTrigger = {
        transitionId: matched.transition.id,
        triggerId: matched.trigger.id,
        dueAt: at + (matched.trigger.hoverDurationMs ?? 100),
        repeatWhileHovered: Boolean(matched.trigger.repeatWhileHovered),
      };
    }
  }

  private scheduleHoverForCurrentPointer(at: number) {
    if (!this.pointerInside || !this.pointerPoint) return;
    this.updateHoverSchedule(findRuntimeTrigger(this.outgoingTransitions(), "hover", this.pointerPoint), at);
  }

  leavePointer(at = this.now()) {
    this.pointerInside = false;
    this.pointerPoint = null;
    this.nextHoverTrigger = null;
    this.hoverLoopTransitionId = undefined;
    this.lastInteractionAt = at;
    if (this.activeTransitionId && !this.activeStateDisplayLoop()) {
      this.pendingPointerLeave = true;
      this.publish();
      return { accepted: true } satisfies RuntimeActionResult;
    }
    this.refreshSchedules(at, true);
    const matched = this.pointerMatch("pointer-leave", { x: 0.5, y: 0.5 });
    if (matched) return this.beginTransition(matched.transition.id, "pointer", at, matched.trigger.id);
    this.publish();
    return { accepted: false, reason: "当前状态没有鼠标离开规则" } satisfies RuntimeActionResult;
  }

  recordInteraction(at = this.now(), recordEvent = true) {
    this.lastInteractionAt = at;
    this.refreshSchedules(at, true);
    if (recordEvent) this.pushEvent("interaction", at);
    this.publish();
  }

  beginTransition(transitionId: string, source: RuntimeStartSource = "manual", at = this.now(), detail?: string): RuntimeActionResult {
    const transition = this.manifest.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition) return this.reject(`找不到过渡 ${transitionId}`, at);
    return this.beginPath([transition], source, at, detail);
  }

  beginPath(path: RuntimeTransition[], source: RuntimeStartSource, at = this.now(), detail?: string): RuntimeActionResult {
    if (this.activeTransitionId) {
      const interrupted = this.interruptibleTransition();
      if (!interrupted) return this.reject("宠物正在播放另一个动作", at);
      this.activeTransitionId = null;
      this.activeTransitionSource = null;
      this.queuedTransitionIds = [];
      this.phase = "idle";
      this.bridgeProgress = 0;
      this.bridgeStartedAt = null;
      this.nextHoverTrigger = null;
      this.hoverLoopTransitionId = undefined;
      this.pendingPointerLeave = false;
      this.pushEvent("transition-interrupted", at, { transitionId: interrupted.id, source, detail });
    }
    if (path.length === 0) return { accepted: true };
    let expectedStateId = this.currentStateId;
    for (const transition of path) {
      if (transition.fromStateId !== expectedStateId) return this.reject("动作路径与当前实际状态不连续", at);
      expectedStateId = transition.toStateId;
    }
    const [first, ...rest] = path;
    this.queuedTransitionIds = rest.map((transition) => transition.id);
    this.activateTransition(first, source, at, detail);
    this.publish();
    return { accepted: true };
  }

  performSemanticAction(action: string, at = this.now()): RuntimeActionResult {
    const path = resolveSemanticAction(this.manifest, this.currentStateId, action);
    if (!path) return this.reject(`宠物没有配置 ${action} 动作`, at);
    return this.beginPath(path, "semantic", at, action);
  }

  activatePointer(event: RuntimePointerEvent, point: NormalizedPoint, at = this.now()): RuntimeActionResult {
    this.recordInteraction(at);
    const matched = this.pointerMatch(event, point);
    if (!matched) return { accepted: false, reason: "当前位置没有匹配的触发规则" };
    return this.beginTransition(matched.transition.id, "pointer", at, matched.trigger.id);
  }

  videoTimeReached(elapsedMs: number, at = this.now()) {
    const transition = this.activeTransition();
    if (!transition || this.phase !== "video" || elapsedMs < transition.durationMs * this.activePlaybackCycles) return false;
    this.finishVideo(at);
    return true;
  }

  finishVideo(at = this.now()) {
    const transition = this.activeTransition();
    if (!transition || this.phase !== "video") return false;
    if (transition.authorityBridge.mode === "hard-cut") {
      this.finishTransition(transition, at);
      return true;
    }
    this.phase = "bridge";
    this.bridgeProgress = 0;
    this.bridgeStartedAt = at;
    this.pushEvent("bridge-started", at, { transitionId: transition.id, detail: transition.authorityBridge.mode });
    this.publish();
    return true;
  }

  advanceBridge(at = this.now()) {
    const transition = this.activeTransition();
    if (!transition || this.phase !== "bridge" || this.bridgeStartedAt === null) return false;
    this.bridgeProgress = computeAuthorityBridgeProgress({
      elapsedMs: at - this.bridgeStartedAt,
      bridge: transition.authorityBridge,
    });
    if (this.bridgeProgress >= 1) this.finishTransition(transition, at);
    else this.publish();
    return true;
  }

  fireDueSchedules(at = this.now()) {
    if (this.nextHoverTrigger && this.nextHoverTrigger.dueAt <= at && this.pointerInside) {
      const scheduled = this.nextHoverTrigger;
      const transition = this.manifest.transitions.find((candidate) => candidate.id === scheduled.transitionId);
      const trigger = transition?.triggers.find((candidate) => candidate.id === scheduled.triggerId);
      this.nextHoverTrigger = null;
      if (transition?.fromStateId === this.currentStateId && trigger?.enabled && trigger.event === "hover") {
        this.hoverLoopTransitionId = scheduled.repeatWhileHovered ? transition.id : undefined;
        return this.beginTransition(transition.id, "pointer", at, trigger.id).accepted;
      }
    }
    const activeStateLoop = this.activeStateDisplayLoop();
    if (this.activeTransitionId && !activeStateLoop) return false;
    if (this.nextTimedTrigger && this.nextTimedTrigger.dueAt <= at) {
      const scheduled = this.nextTimedTrigger;
      return this.beginTransition(scheduled.transitionId, "timer", at, scheduled.event).accepted;
    }
    if (activeStateLoop) return false;
    if (this.nextIdleDueAt === null || this.nextIdleDueAt > at) return false;
    const state = this.currentState();
    const logicalState = this.manifest.logicalStates.find((candidate) => candidate.id === state?.logicalStateId);
    const scheduler = logicalState?.idleScheduler;
    if (!scheduler?.enabled) return false;
    if (scheduler.playbackMode !== "continuous" && at - this.lastInteractionAt < scheduler.minIntervalMs) {
      this.refreshSchedules(at, true);
      this.pushEvent("idle-deferred", at);
      this.publish();
      return false;
    }
    const idleTransitions = this.outgoingTransitions().filter((transition) =>
      transition.toStateId === this.currentStateId && transition.idleRule && transition.idleRule.enabled !== false);
    const selected = selectIdleTransition({
      transitions: idleTransitions,
      scheduler,
      now: at,
      randomValue: this.random(),
      roundRobinCursor: this.roundRobinCursor,
      lastTransitionId: this.lastIdleTransitionId,
      lastPlayedAt: scheduler.playbackMode === "continuous" ? undefined : this.idleLastPlayedAt,
    });
    if (!selected) {
      this.refreshSchedules(at, true);
      this.publish();
      return false;
    }
    this.roundRobinCursor = selected.nextRoundRobinCursor;
    this.lastIdleTransitionId = selected.transition.id;
    this.idleLastPlayedAt[selected.transition.id] = at;
    return this.beginTransition(selected.transition.id, "idle", at).accepted;
  }

  jumpToState(stateId: string, at = this.now()): RuntimeActionResult {
    if (!this.manifest.states.some((state) => state.id === stateId)) return this.reject(`找不到状态 ${stateId}`, at);
    this.activeTransitionId = null;
    this.activeTransitionSource = null;
    this.queuedTransitionIds = [];
    this.phase = "idle";
    this.bridgeProgress = 0;
    this.bridgeStartedAt = null;
    this.nextHoverTrigger = null;
    this.hoverLoopTransitionId = undefined;
    this.pendingPointerLeave = false;
    this.pointerInside = false;
    this.pointerPoint = null;
    this.currentStateId = stateId;
    this.stateEnteredAt = at;
    this.lastInteractionAt = at;
    this.refreshSchedules(at, true);
    this.pushEvent("state-jumped", at, { stateId });
    this.publish();
    return { accepted: true };
  }

  replayTransition(transitionId: string, at = this.now()): RuntimeActionResult {
    const transition = this.manifest.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition) return this.reject(`找不到过渡 ${transitionId}`, at);
    if (this.activeTransitionId) return this.reject("宠物正在播放另一个动作", at);
    if (this.currentStateId !== transition.fromStateId) {
      this.currentStateId = transition.fromStateId;
      this.stateEnteredAt = at;
      this.lastInteractionAt = at;
      this.pushEvent("state-jumped", at, { stateId: transition.fromStateId, detail: "replay" });
    }
    this.queuedTransitionIds = [];
    this.activateTransition(transition, "manual", at, "replay");
    this.publish();
    return { accepted: true };
  }

  reset(at = this.now()) {
    this.activeTransitionId = null;
    this.activeTransitionSource = null;
    this.queuedTransitionIds = [];
    this.phase = "idle";
    this.bridgeProgress = 0;
    this.bridgeStartedAt = null;
    this.nextHoverTrigger = null;
    this.hoverLoopTransitionId = undefined;
    this.pendingPointerLeave = false;
    this.pointerInside = false;
    this.pointerPoint = null;
    this.currentStateId = this.manifest.initialStateId;
    this.stateEnteredAt = at;
    this.lastInteractionAt = at;
    this.roundRobinCursor = 0;
    this.lastIdleTransitionId = undefined;
    for (const key of Object.keys(this.idleLastPlayedAt)) delete this.idleLastPlayedAt[key];
    this.refreshSchedules(at, true);
    this.pushEvent("runtime-reset", at);
    this.publish();
  }

  private reject(reason: string, at: number): RuntimeActionResult {
    this.pushEvent("action-rejected", at, { detail: reason });
    this.publish();
    return { accepted: false, reason };
  }

  private activateTransition(transition: RuntimeTransition, source: RuntimeStartSource, at: number, detail?: string) {
    this.activeTransitionId = transition.id;
    this.activeTransitionSource = source;
    this.activeTransitionRunId += 1;
    this.activePlaybackCycles = selectTransitionPlaybackCycles(transition, this.random());
    this.phase = "video";
    this.bridgeProgress = 0;
    this.bridgeStartedAt = null;
    this.refreshSchedules(at, false);
    this.nextHoverTrigger = null;
    this.pushEvent("transition-started", at, { transitionId: transition.id, source, detail });
  }

  private finishTransition(transition: RuntimeTransition, at: number) {
    const completedSource = this.activeTransitionSource;
    const preservesIdleClock = Boolean(
      this.activeTransitionSource === "idle" &&
      transition.fromStateId === this.currentStateId &&
      transition.toStateId === this.currentStateId,
    );
    this.currentStateId = transition.toStateId;
    if (!preservesIdleClock) {
      this.stateEnteredAt = at;
      this.lastInteractionAt = at;
    }
    this.bridgeProgress = 1;
    this.bridgeStartedAt = null;
    this.pushEvent("state-entered", at, { stateId: transition.toStateId, transitionId: transition.id });
    const nextId = this.queuedTransitionIds.shift();
    const next = nextId ? this.manifest.transitions.find((candidate) => candidate.id === nextId) : undefined;
    if (next?.fromStateId === this.currentStateId) {
      this.activateTransition(next, "queue", at);
    } else if (this.pendingPointerLeave) {
      this.pendingPointerLeave = false;
      this.activeTransitionId = null;
      this.activeTransitionSource = null;
      this.phase = "idle";
      const leave = findRuntimeTrigger(this.outgoingTransitions(), "pointer-leave", { x: 0.5, y: 0.5 });
      if (leave) this.activateTransition(leave.transition, "pointer", at, leave.trigger.id);
      else this.refreshSchedules(at, true);
    } else {
      this.activeTransitionId = null;
      this.activeTransitionSource = null;
      this.queuedTransitionIds = [];
      this.phase = "idle";
      this.refreshSchedules(at, true);
      let repeatedHoverLoop = false;
      if (this.pointerInside && this.pointerPoint && this.hoverLoopTransitionId) {
        const repeated = this.manifest.transitions.find((candidate) => candidate.id === this.hoverLoopTransitionId && candidate.fromStateId === this.currentStateId);
        const trigger = repeated?.triggers.find((candidate) => candidate.enabled && candidate.event === "hover" && candidate.repeatWhileHovered);
        if (repeated && trigger) {
          this.nextHoverTrigger = {
            transitionId: repeated.id,
            triggerId: trigger.id,
            dueAt: at,
            repeatWhileHovered: true,
          };
          repeatedHoverLoop = true;
        }
      }
      const changedState = transition.fromStateId !== transition.toStateId;
      if (!repeatedHoverLoop && (changedState || completedSource !== "pointer")) {
        this.scheduleHoverForCurrentPointer(at);
      }
    }
    this.publish();
  }

  private refreshSchedules(at: number, rescheduleIdle: boolean) {
    const activeStateLoop = this.activeStateDisplayLoop();
    if (this.activeTransitionId && !activeStateLoop) {
      this.nextTimedTrigger = null;
      this.nextIdleDueAt = null;
      return;
    }
    const timed = findNextRuntimeTimerTrigger({
      transitions: this.outgoingTransitions(),
      stateEnteredAt: this.stateEnteredAt,
      lastInteractionAt: this.lastInteractionAt,
    });
    this.nextTimedTrigger = timed && (timed.trigger.event === "inactivity" || timed.trigger.event === "state-timeout") ? {
      transitionId: timed.transition.id,
      triggerId: timed.trigger.id,
      event: timed.trigger.event,
      durationMs: timed.trigger.timerDurationMs ?? 60_000,
      dueAt: timed.dueAt,
    } : null;
    if (activeStateLoop) {
      this.nextIdleDueAt = null;
      return;
    }
    const current = this.currentState();
    const logicalState = this.manifest.logicalStates.find((state) => state.id === current?.logicalStateId);
    const hasIdle = this.outgoingTransitions().some((transition) =>
      transition.toStateId === this.currentStateId && transition.idleRule && transition.idleRule.enabled !== false);
    if (!logicalState?.idleScheduler.enabled || !hasIdle) this.nextIdleDueAt = null;
    else if (rescheduleIdle || this.nextIdleDueAt === null) {
      this.nextIdleDueAt = at + computeIdleDelay(logicalState.idleScheduler, this.random());
    }
  }

  private pushEvent(type: RuntimeEventType, at: number, details: Partial<Omit<RuntimeEvent, "id" | "type" | "at">> = {}) {
    const event: RuntimeEvent = {
      id: ++this.eventSequence,
      type,
      at,
      stateId: details.stateId ?? this.currentStateId,
      transitionId: details.transitionId,
      source: details.source,
      detail: details.detail,
    };
    this.events = [event, ...this.events].slice(0, this.eventHistoryLimit);
  }

  private publish() {
    this.revision += 1;
    this.snapshotValue = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }

  private createSnapshot(): PetRuntimeSnapshot {
    const lastEvent = this.events[0] as RuntimeEvent;
    return {
      revision: this.revision,
      currentStateId: this.currentStateId,
      activeTransitionId: this.activeTransitionId,
      activeTransitionRunId: this.activeTransitionRunId,
      activePlaybackCycles: this.activePlaybackCycles,
      queuedTransitionIds: [...this.queuedTransitionIds],
      phase: this.phase,
      bridgeProgress: this.bridgeProgress,
      stateEnteredAt: this.stateEnteredAt,
      lastInteractionAt: this.lastInteractionAt,
      nextTimedTrigger: this.nextTimedTrigger ? { ...this.nextTimedTrigger } : null,
      nextIdleDueAt: this.nextIdleDueAt,
      nextHoverTrigger: this.nextHoverTrigger ? { ...this.nextHoverTrigger } : null,
      pointerInside: this.pointerInside,
      lastEvent,
      events: [...this.events],
    };
  }
}

export type { NormalizedPoint, RuntimePointerEvent, TransitionTrigger };
