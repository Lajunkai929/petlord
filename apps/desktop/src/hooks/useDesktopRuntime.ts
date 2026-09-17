import { createDeferredPetActions } from "../deferredPetActions";
import { createAgentActivityLoop } from "../agentActivityLoop";
import { createCompanionPlaybackReporter } from "../companionPlayback";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent } from "react";
import { TodoController, type TodoItem } from "@petlord/plugin-todo";
import { AgentActivityController } from "@petlord/plugin-agent-activity";
import type { PetPluginContext, PetSnapshot } from "@petlord/plugin-sdk";
import type { AgentEvent } from "@petlord/schema";
import { normalizedPointFromBounds, relativePointFromBounds, usePetRuntime } from "@petlord/runtime-react";
import { useDesktopPetPackage } from "./useDesktopPetPackage";
import { useDesktopSettings } from "./useDesktopSettings";
import { usePluginRuntime } from "./usePluginRuntime";
import { useAgentEventBridge } from "./useAgentEventBridge";
import { useAgentIntegrations } from "./useAgentIntegrations";
import { usePetWindowHitTest } from "./usePetWindowHitTest";
import { normalizedPointerAnchor, petWindowPositionForAnchor, type NormalizedDragAnchor } from "../petWindowDrag";

function pointFromEvent(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
  return normalizedPointFromBounds(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
}

function createContext(pluginId: string, input: {
  getSnapshot: () => PetSnapshot;
  perform: (action: string) => Promise<{ accepted: boolean; reason?: string }>;
  setActivityLoop: (action: string | null) => Promise<{accepted: boolean; reason?: string}>;
  onSpeak: (message: string, durationMs?: number) => void;
  listeners: Set<(snapshot: PetSnapshot) => void>;
  events: PetPluginContext["events"];
  integrations: PetPluginContext["integrations"];
  clickListeners: Set<() => boolean | Promise<boolean>>;
  contextMenuListeners: Set<() => boolean | Promise<boolean>>;
  openPanel: (pluginId: string) => void;
}): PetPluginContext {
  const memoryStorage = new Map<string, unknown>();
  return {
    pet: {
      async getSnapshot() { return input.getSnapshot(); },
      perform: input.perform,
      setActivityLoop: input.setActivityLoop,
      async speak(message, options) { input.onSpeak(message, options?.durationMs); },
      onStateChanged(listener) {
        input.listeners.add(listener);
        return () => input.listeners.delete(listener);
      },
    },
    storage: {
      async get<T>(key: string) {
        if (window.petLordDesktop) {
          const stored = await window.petLordDesktop.pluginStorageGet<T>(pluginId, key);
          if (stored !== null) return stored;
          const legacyKeys = [`petlord.plugin.${pluginId}.${key}`, ...(pluginId === "petlord.todo" ? [`petlord.todo.${key}`] : [])];
          for (const legacyKey of legacyKeys) {
            const legacy = localStorage.getItem(legacyKey);
            if (!legacy) continue;
            const parsed = JSON.parse(legacy) as T;
            await window.petLordDesktop.pluginStorageSet(pluginId, key, parsed);
            localStorage.removeItem(legacyKey);
            return parsed;
          }
          return null;
        }
        return memoryStorage.has(key) ? memoryStorage.get(key) as T : null;
      },
      async set<T>(key: string, value: T) {
        if (window.petLordDesktop) await window.petLordDesktop.pluginStorageSet(pluginId, key, value);
        else memoryStorage.set(key, value);
      },
      async remove(key: string) {
        if (window.petLordDesktop) await window.petLordDesktop.pluginStorageRemove(pluginId, key);
        else memoryStorage.delete(key);
      },
    },
    ui: {
      async openPanel() { input.openPanel(pluginId); },
      async closePanel() {},
      async notify(title, body) { input.onSpeak(`${title}：${body}`, 5200); },
    },
    events: input.events,
    integrations: input.integrations,
    interactions: {
      onPetClick(listener) {
        input.clickListeners.add(listener);
        return () => input.clickListeners.delete(listener);
      },
      onPetContextMenu(listener) {
        input.contextMenuListeners.add(listener);
        return () => input.contextMenuListeners.delete(listener);
      },
    },
  };
}

export function useDesktopRuntime() {
  const petPackage = useDesktopPetPackage();
  const settings = useDesktopSettings();
  const agentBridge = useAgentEventBridge();
  const agentIntegrations = useAgentIntegrations();
  const manifest = petPackage.manifest;
  const petRuntime = usePetRuntime(manifest);
  const activityRuntimeId = useMemo(()=>crypto.randomUUID(),[petRuntime.core]);
  const petRuntimeRef = useRef(petRuntime);
  petRuntimeRef.current = petRuntime;
  const activityLoopRef = useRef<ReturnType<typeof createAgentActivityLoop> | undefined>(undefined);
  const [companionFacing,setCompanionFacing] = useState<"left"|"right">("left");
  useEffect(()=>{if(!petRuntime.core||!manifest)return;const controller=createAgentActivityLoop(petRuntime.core,manifest);activityLoopRef.current=controller;return()=>{controller.dispose();activityLoopRef.current=undefined;};},[petRuntime.core,manifest]);
  useEffect(()=>{if(!petRuntime.core||!manifest)return;const reporter=createCompanionPlaybackReporter(manifest,input=>window.petLordDesktop?.companionPlayback?.(input));const unsubscribe=petRuntime.core.subscribe(()=>reporter.consume(petRuntime.core!.getSnapshot().events));return()=>{unsubscribe();reporter.dispose();};},[petRuntime.core,manifest]);
  useEffect(()=>window.petLordDesktop?.onCompanionFacing?.(setCompanionFacing),[]);
  useEffect(()=>window.petLordDesktop?.onCompanionAction?.(action=>{if(!manifest)return;activityLoopRef.current?.set(null);const runtime=petRuntimeRef.current;runtime.interruptPointerGaze();if(action==="idle"){runtime.jumpToState(manifest!.initialStateId);return;}void runtime.performAction(action).then(result=>{if(!result.accepted)setSpeech(result.reason??"当前宠物没有这个动作");});}),[manifest]);
  const [items, setItems] = useState<TodoItem[]>([]);
  const [title, setTitle] = useState("");
  const [speech, setSpeech] = useState("");
  const speechTimerRef = useRef<number | undefined>(undefined);
  const controllerRef = useRef<TodoController | null>(null);
  const agentControllerRef = useRef<AgentActivityController | null>(null);
  const snapshotRef = useRef<PetSnapshot>({ stateId: "", logicalStateId: "", availableActions: [] });
  const performRef = useRef<(action: string) => Promise<{ accepted: boolean; reason?: string }>>(async () => ({ accepted: false, reason: "宠物包尚未载入" }));
  const listenersRef = useRef(new Set<(snapshot: PetSnapshot) => void>());
  const pluginClickListenersRef = useRef(new Set<() => boolean | Promise<boolean>>());
  const pluginContextMenuListenersRef = useRef(new Set<() => boolean | Promise<boolean>>());
  const petSurfaceRef = useRef<HTMLDivElement>(null);
  const dragGestureRef = useRef<{ pointerId: number; startX: number; startY: number; dragging: boolean; bounds: DOMRect; anchor: NormalizedDragAnchor; capturer: HTMLDivElement } | undefined>(undefined);
  const suppressClickUntilRef = useRef(0);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [dragTransitionMs, setDragTransitionMs] = useState(0);
  const [windowDragActive, setWindowDragActive] = useState(false);
  const [agentInboxOpen, setAgentInboxOpen] = useState(false);
  const [todoPanelOpen, setTodoPanelOpen] = useState(false);
  const [agentEvents, setAgentEvents] = useState<AgentEvent[]>([]);
  const petWindowHitTest = usePetWindowHitTest(petSurfaceRef, agentInboxOpen || todoPanelOpen || windowDragActive);
  const showSpeech = useCallback((message: string, durationMs = 4200) => {
    setSpeech(message);
    if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
    if(durationMs>0)speechTimerRef.current = window.setTimeout(() => setSpeech(""), durationMs);
  }, []);
  useEffect(()=>window.petLordDesktop?.onDesktopWaste?.(result=>{showSpeech(result.ok?(result.warnings?.length?"文件已留下；图标或位置受系统限制，请在设置中查看。":"桌面上留下了一点小纪念，可以移到废纸篓。"):result.error??"无法创建桌面文件。",6000);}),[showSpeech]);
  const deferredActions = useMemo(()=>createDeferredPetActions(()=>Boolean(dragGestureRef.current?.dragging || petRuntimeRef.current.dragActive || petRuntimeRef.current.dragReturnPending),action=>petRuntimeRef.current.performAction(action)),[]);
  useEffect(()=>{
    const held=windowDragActive || petRuntime.dragActive || petRuntime.dragReturnPending;
    let cancelled=false;
    if(held)activityLoopRef.current?.suspend(true);
    else void deferredActions.flush().catch(()=>undefined).finally(()=>{if(!cancelled)activityLoopRef.current?.suspend(false);});
    window.petLordDesktop?.setPetDragging?.(windowDragActive || petRuntime.dragActive);
    return()=>{cancelled=true;};
  },[deferredActions,windowDragActive,petRuntime.dragActive,petRuntime.dragReturnPending,manifest?.id]);
  const pluginDeclarations = useMemo(() => manifest?.plugins ?? [], [manifest]);
  useEffect(()=>()=>deferredActions.clear(),[deferredActions,manifest?.id]);
  const pluginContextFactory = useCallback((pluginId: string) => createContext(pluginId, {
    getSnapshot: () => snapshotRef.current,
    perform: (action) => performRef.current(action),
    onSpeak: showSpeech,
    setActivityLoop: async action => activityLoopRef.current?.set(action) ?? {accepted:false,reason:"宠物尚未载入"},
    listeners: listenersRef.current,
    events: agentBridge.events,
    integrations: agentBridge.integrations,
    clickListeners: pluginClickListenersRef.current,
    contextMenuListeners: pluginContextMenuListenersRef.current,
    openPanel: (id) => {
      if (id === "petlord.todo") setTodoPanelOpen(true);
      else setAgentInboxOpen(true);
    },
  }), [agentBridge.events, agentBridge.integrations, showSpeech]);
  const plugins = usePluginRuntime(pluginDeclarations, pluginContextFactory, settings);

  useEffect(() => {
    performRef.current = deferredActions.perform;
  }, [deferredActions]);

  useEffect(() => {
    const mode = settings.settings.gazeTrackingArea;
    petRuntimeRef.current.interruptPointerGaze();
    if (mode === "near") return;
    return window.petLordDesktop?.onGlobalPointerMoved((pointer) => {
      const surface = petSurfaceRef.current;
      if (!surface) return;
      const runtime = petRuntimeRef.current;
      runtime.onPointerMove(
        relativePointFromBounds(pointer.clientX, pointer.clientY, surface.getBoundingClientRect()),
        {
          gazeActivationRadius: mode === "wide" ? Math.max(4, runtime.pointerGaze?.activationRadius ?? 0) : undefined,
          forceGaze: mode === "screen",
          trackInteractions: false,
        },
      );
    });
  }, [settings.settings.gazeTrackingArea]);

  useEffect(() => {
    if (manifest) showSpeech(`${manifest.characterName} 来啦` , 2200);
  }, [manifest, showSpeech]);

  useEffect(() => () => {
    if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
  }, []);

  useEffect(() => {
    if (!manifest?.runtimePresentation) return;
    const signature = `${manifest.id}:${manifest.runtimePresentation.defaultFrameRate}:${manifest.runtimePresentation.defaultRenderResolution}:${manifest.runtimePresentation.defaultPixelGridSize ?? 64}:${manifest.runtimePresentation.defaultDisplaySize ?? 320}:${manifest.runtimePresentation.pixelated}`;
    const storageKey = "petlord.desktop.applied-presentation";
    if (localStorage.getItem(storageKey) === signature) return;
    localStorage.setItem(storageKey, signature);
    void settings.update({
      frameRate: manifest.runtimePresentation.defaultFrameRate,
      renderResolution: manifest.runtimePresentation.defaultRenderResolution,
      pixelGridSize: manifest.runtimePresentation.defaultPixelGridSize ?? 64,
      displaySize: manifest.runtimePresentation.defaultDisplaySize ?? 320,
      pixelated: manifest.runtimePresentation.pixelated,
    });
  }, [manifest?.id, manifest?.runtimePresentation?.defaultDisplaySize, manifest?.runtimePresentation?.defaultFrameRate, manifest?.runtimePresentation?.defaultPixelGridSize, manifest?.runtimePresentation?.defaultRenderResolution, manifest?.runtimePresentation?.pixelated]);

  useEffect(() => {
    const snapshot: PetSnapshot = {
      runtimeId: activityRuntimeId,
      stateId: petRuntime.snapshot.currentStateId,
      logicalStateId: petRuntime.currentState?.logicalStateId ?? "",
      availableActions: Object.keys(manifest?.semanticActions ?? {}),
    };
    snapshotRef.current = snapshot;
    for (const listener of listenersRef.current) listener(snapshot);
  }, [activityRuntimeId,manifest?.semanticActions, petRuntime.currentState?.logicalStateId, petRuntime.snapshot.currentStateId]);

  useEffect(() => {
    const controller = plugins.session<TodoController>("petlord.todo");
    controllerRef.current = controller ?? null;
    setItems(controller?.list() ?? []);
  }, [plugins.revision]);

  useEffect(() => {
    const controller = plugins.session<AgentActivityController>("petlord.agent-activity");
    agentControllerRef.current = controller ?? null;
    const synchronize = () => setAgentEvents(controller?.list() ?? []);
    synchronize();
    return controller?.subscribe(synchronize);
  }, [plugins.revision]);

  async function addItem(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !controllerRef.current) return;
    await controllerRef.current.add(title);
    setTitle("");
    setItems(controllerRef.current.list());
    showSpeech("记下啦，我陪你一起完成");
  }

  async function completeItem(id: string) {
    if (!controllerRef.current) return;
    await controllerRef.current.complete(id);
    setItems(controllerRef.current.list());
    showSpeech("完成一项，真不错");
  }

  async function removeItem(id: string) {
    if (!controllerRef.current) return;
    await controllerRef.current.remove(id);
    setItems(controllerRef.current.list());
  }

  function onStagePointerMove(event: PointerEvent<HTMLElement>) {
    petWindowHitTest.sample(event.clientX, event.clientY);
    const surface = petSurfaceRef.current;
    if (surface) petRuntime.onPointerMove(relativePointFromBounds(event.clientX, event.clientY, surface.getBoundingClientRect()));
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (!gesture.dragging && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < 6) return;
    if (!gesture.dragging) {
      activityLoopRef.current?.suspend(true);
      window.petLordDesktop?.setPetDragging?.(true);
      gesture.dragging = petRuntime.dragInteraction ? petRuntime.beginDrag().accepted : true;
      if (!gesture.dragging) {activityLoopRef.current?.suspend(false);window.petLordDesktop?.setPetDragging?.(false);return;}
      setWindowDragActive(true);
      setDragTransitionMs(window.petLordDesktop ? 0 : petRuntime.dragInteraction?.alignmentDurationMs ?? 0);
    } else if (!window.petLordDesktop) setDragTransitionMs(48);
    if (window.petLordDesktop) {
      const position = petWindowPositionForAnchor(
        { x: event.screenX, y: event.screenY },
        gesture.bounds,
        gesture.anchor,
      );
      setDragOffset({ x: 0, y: 0 });
      window.petLordDesktop.movePetWindow({ ...position, pointerX: event.screenX, pointerY: event.screenY });
      return;
    }
    setDragOffset({
      x: event.clientX - (gesture.bounds.left + gesture.anchor.x * gesture.bounds.width),
      y: event.clientY - (gesture.bounds.top + gesture.anchor.y * gesture.bounds.height),
    });
  }

  function onPetPointerDown(event: PointerEvent<HTMLDivElement>) {
    petWindowHitTest.interactive();
    if (event.button !== 0 || !petSurfaceRef.current || (!petRuntime.dragInteraction && settings.settings.dock !== "free")) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const bounds = petSurfaceRef.current.getBoundingClientRect();
    dragGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      bounds,
      anchor: petRuntime.dragInteraction?.anchor ?? normalizedPointerAnchor({ x: event.clientX, y: event.clientY }, bounds),
      capturer: event.currentTarget,
    };
  }

  function onPetPointerUp(event: PointerEvent<HTMLElement>) {
    const gesture = dragGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.capturer.hasPointerCapture(event.pointerId)) gesture.capturer.releasePointerCapture(event.pointerId);
    if (gesture.dragging) {
      suppressClickUntilRef.current = Date.now() + 350;
      setWindowDragActive(false);
      setDragTransitionMs(window.petLordDesktop ? 0 : petRuntime.dragInteraction?.returnDurationMs ?? 0);
      setDragOffset({ x: 0, y: 0 });
      if (petRuntime.dragInteraction) petRuntime.endDrag();
    }
    dragGestureRef.current = undefined;
  }

  async function runPluginInteraction(listeners: Set<() => boolean | Promise<boolean>>) {
    for (const listener of listeners) if (await listener()) return true;
    return false;
  }

  async function onPetClick(event: MouseEvent<HTMLDivElement>) {
    if (Date.now() < suppressClickUntilRef.current) return;
    const point = pointFromEvent(event);
    if (await runPluginInteraction(pluginClickListenersRef.current)) return;
    petRuntime.onClick(point);
  }

  async function simulateAgentCompletion(source: "claude" | "codex") {
    const sessionId = `${source}-preview-${crypto.randomUUID()}`;
    await agentBridge.simulate(source, source === "codex" ? {
      type: "agent-turn-complete",
      "thread-id": sessionId,
      "turn-id": crypto.randomUUID(),
      cwd: "/tmp/petlord-preview",
      "input-messages": ["验证 PetLord 通知闭环"],
      "last-assistant-message": "测试任务已经完成。点击宠物可打开对应会话。",
    } : {
      hook_event_name: "Stop",
      session_id: sessionId,
      cwd: "/tmp/petlord-preview",
      last_assistant_message: "测试任务已经完成。点击宠物可打开对应会话。",
      title: "验证 PetLord 通知闭环",
    });
  }

  return {
    ...petPackage,
    companionFacing,
    settings,
    plugins,
    agentIntegrations,
    agentActivityAvailable: plugins.isActive("petlord.agent-activity"),
    agentInboxOpen,
    setAgentInboxOpen,
    todoPanelOpen,
    setTodoPanelOpen,
    agentEvents,
    unreadAgentEventCount: agentEvents.filter((event) => !event.acknowledgedAt).length,
    openAgentEvent: (id: string) => agentControllerRef.current?.open(id),
    acknowledgeAgentEvent: (id: string) => agentControllerRef.current?.acknowledge(id),
    simulateAgentEvent: simulateAgentCompletion,
    todoAvailable: plugins.isActive("petlord.todo"),
    items,
    title,
    setTitle,
    speech,
    currentState: petRuntime.currentState,
    activeTransition: petRuntime.activeTransition,
    bridgeProgress: petRuntime.snapshot.bridgeProgress,
    activeTransitionRunId: petRuntime.snapshot.activeTransitionRunId,
    activePlaybackCycles: petRuntime.snapshot.activePlaybackCycles,
    pointerGaze: petRuntime.pointerGaze,
    pointerGazeActive: petRuntime.pointerGazeActive,
    pointerGazeProgress: petRuntime.pointerGazeProgress,
    pointerGazeBlendProgress: petRuntime.pointerGazeBlendProgress,
    dragActive: petRuntime.dragActive || windowDragActive,
    dragInteraction: petRuntime.dragInteraction,
    petSurfaceRef,
    dragOffset,
    dragTransitionMs,
    runtimePhase: petRuntime.snapshot.phase,
    queuedTransitionIds: petRuntime.snapshot.queuedTransitionIds,
    addItem,
    completeItem,
    removeItem,
    onTransitionVideoTimeUpdate: petRuntime.videoTimeReached,
    onTransitionVideoEnded: petRuntime.videoEnded,
    onPetClick,
    onPetDoubleClick: (event: MouseEvent<HTMLDivElement>) => petRuntime.onDoubleClick(pointFromEvent(event)),
    onPetContextMenu: async (event: MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const point = pointFromEvent(event);
      if (await runPluginInteraction(pluginContextMenuListenersRef.current)) return;
      if (plugins.isActive("petlord.todo")) {
        setTodoPanelOpen(true);
        return;
      }
      petRuntime.onContextMenu(point);
    },
    onStagePointerMove,
    onStagePointerLeave: () => {
      petRuntime.onPointerLeave();
      petWindowHitTest.leave();
    },
    onPetPointerDown,
    onPetPointerUp,
  };
}
