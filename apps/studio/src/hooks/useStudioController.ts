import { useEffect, useRef, useState } from "react";
import { executeStudioDesignCommand } from "../pixel/designCommand";
import { hasDrawingDraft, useDrawingDraftStatus } from "../pixel/drawingDrafts";
import { workspaceClient } from "../workspaceApi";
import {
  defaultPointerGazeDirectionKeyframesMs,
  type Artifact,
  type AuthorityBridge,
  type CharacterProject,
  type DragInteraction,
  type IdentityProfile,
  type IdleScheduler,
  type IdleTransitionRule,
  type PointerGaze,
  type TransparencyProcessing,
  type TransitionPlayback,
  type TransitionTrigger,
} from "@petlord/schema";
import {
  CHARACTER_NAME_PROMPT_VARIABLE,
  assembleStateDraftPrompt,
  assembleTransitionPrompt,
  estimateImageGenerationCost,
  estimateVideoGenerationCost,
  submitStateDraftJob,
  submitTransitionJob,
  templateCharacterNamePrompt,
  toPersistentJobCost,
  parseJsonResponse,
  type GeneratedMedia,
  type PersistentGenerationJob,
} from "@petlord/generation";
import { reconcileTransitionEndpointVariants, resolveTransitionSourceArtifact } from "@petlord/state-engine";
import type { StudioArea, StudioSelection } from "../studioTypes";
import { importImageFile, importVideoFile } from "../lib/media";
import { ensureTransitionMediaVersions } from "../transitionMedia";
import { calculateAutoChromaColor } from "../lib/chromaBackground";
import { usePersistentGeneration } from "./usePersistentGeneration";
import { useVideoBackgroundSettings } from "./useVideoBackgroundSettings";
import { activateProjectAfterPersist, useProjectWorkspace } from "./useProjectWorkspace";
import {
  activateAuthorityReference,
  createBlankIdentityProfile,
  createBlankProject,
  duplicateProjectForOrder,
  promoteReferenceToInitialState,
  type NewOrderInput,
} from "../projectTemplate";
import { useCustomerReview } from "./useCustomerReview";
import { agentActivityPluginDeclaration, todoPluginDeclaration } from "../firstPartyPlugins";
import { generationBudgetAllows } from "../orderOperations";
import { approveProjectTransition } from "../transitionApproval";
import { calculateStateGraphLayout } from "../graphLayout";
import { useStudioAppearance } from "./useStudioAppearance";
import {
  dragPoseStateDescription,
  dragPoseTransitionPrompt,
  shouldRefreshDragPoseDescription,
  shouldRefreshDragTransitionPrompt,
} from "../dragPose";
import { useStyleLibrary } from "./useStyleLibrary";
import { useProjectTemplateLibrary } from "./useProjectTemplateLibrary";
import { readStudioRoute } from "../studioRoute";
import { useStudioUrlState } from "./useStudioUrlState";
import { createPortableProjectSource, resolveProjectGenerationContext } from "../generationContext";
import { applyProjectReferenceChange, projectWithResolvedReferences } from "../projectReferences";
import type { ProjectReferenceRequest } from "../components/ProjectReferenceDialog";
import { usePetLordTheme } from "@petlord/ui";
import { providerModelSelection } from "./providerModelSelection";
import { useGenerationProviders } from "./useGenerationProviders";

const now = () => new Date().toISOString();

export interface StateGenerationOptions {
  stylePrompt?: string;
  styleProfileId?: string;
  persistProjectStyle?: boolean;
  throwOnFailure?: boolean;
}

export function useStudioController() {
  const initialRoute = useRef(readStudioRoute()).current;
  const workspace = useProjectWorkspace(initialRoute.projectId);
  const appearance = useStudioAppearance();
  const { project, setProject } = workspace;
  const designProjectRef = useRef(project);
  designProjectRef.current = project;
  const designPendingRef = useRef(false);
  const [designBusy, setDesignBusy] = useState(false);
  async function runDesignCommand(command: string, input: unknown) {
    if (designPendingRef.current) throw new Error("请等待当前设计操作完成。");
    designPendingRef.current = true;
    setDesignBusy(true);
    try {
      return await executeStudioDesignCommand(command, input, {
        persist: workspace.persistProject,
        current: () => designProjectRef.current,
        adopt: snapshot => workspaceClient.adopt("project", snapshot),
        commit: next => { designProjectRef.current = next; setProject(next); },
      });
    } finally { designPendingRef.current = false; setDesignBusy(false); }
  }
  const drawingPending = useDrawingDraftStatus(project);
  const [activeArea, setActiveAreaState] = useState<StudioArea>(initialRoute.area);
  const [previewSessionRevision, setPreviewSessionRevision] = useState(0);
  const [selection, setSelectionState] = useState<StudioSelection>(initialRoute.selection ?? { kind: "state", id: "state-sitting" });
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [previewTransitionId, setPreviewTransitionId] = useState<string | null>(null);
  const { theme, setTheme } = usePetLordTheme(window.petLordStudio);
  const [notice, setNotice] = useState("正在检查生成服务");
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [graphLayoutRevision, setGraphLayoutRevision] = useState(0);
  const referenceInput = useRef<HTMLInputElement>(null);
  const generationProviders = useGenerationProviders();
  const apiConfigured = generationProviders.status === "loading"
    ? null
    : generationProviders.status === "online"
      ? Boolean(generationProviders.snapshot?.defaults.image && generationProviders.snapshot?.defaults.video)
      : false;
  const { projectJobs, activeJobs, allJobs, allActiveJobs, upsertPersistentJob } = usePersistentGeneration(project, setProject);
  const artifacts = new Map(project.artifacts.map((artifact) => [artifact.id, artifact]));
  const imageProviderType = generationProviders.snapshot?.providers.find((provider) => provider.id === (
    project.generationSettings.imageProviderId ?? generationProviders.snapshot?.defaults.image
  ))?.type ?? "unconfigured";
  const videoProviderType = generationProviders.snapshot?.providers.find((provider) => provider.id === (
    project.generationSettings.videoProviderId ?? generationProviders.snapshot?.defaults.video
  ))?.type ?? "unconfigured";

  useEffect(() => {
    if (generationProviders.status === "loading") return;
    if (generationProviders.status === "offline") {
      setNotice("生成服务未启动");
      return;
    }
    const imageReady = Boolean(generationProviders.snapshot?.defaults.image);
    const videoReady = Boolean(generationProviders.snapshot?.defaults.video);
    setNotice(imageReady && videoReady ? "图片与视频 Provider 已就绪" : "生成服务已启动，请配置 Provider");
  }, [generationProviders.snapshot?.defaults.image, generationProviders.snapshot?.defaults.video, generationProviders.status]);

  useEffect(() => {
    setPreviewTransitionId(null);
    setMobileInspectorOpen(false);
  }, [project.id]);

  function inform(message: string, kind: "success" | "error" | "info" = "info") {
    setNotice(message);
    void import("sonner").then(({ toast }) => toast[kind](message));
  }

  function setSelection(next: StudioSelection) {
    setSelectionState(next);
    setMobileInspectorOpen(Boolean(next));
  }

  function setActiveArea(next: StudioArea) {
    if ((next === "preview" || next === "publish") && hasDrawingDraft(project.id)) {
      inform("请先保存绘图工作台中的画布或动画草稿。", "info");
      setActiveAreaState("drawing");
      return;
    }
    if (next === "preview") {
      workspace.preparePreviewSnapshot();
      setPreviewSessionRevision((revision) => revision + 1);
    }
    setActiveAreaState(next);
  }

  useStudioUrlState({
    project,
    ready: workspace.hydrated,
    activeArea,
    selection,
    activateProject: workspace.activateProject,
    setActiveArea,
    setSelection: setSelectionState,
  });

  useEffect(() => window.petLordStudio?.onOpenProject?.(projectId => {
    void activateProjectAfterPersist(projectId, {
      persist: workspace.persistProject,
      activate: workspace.activateProject,
    }).then(() => {
      setActiveArea("graph");
      inform("已打开这个本机宠物的项目。", "success");
    }).catch(caught => inform(caught instanceof Error ? caught.message : "无法打开关联项目。", "error"));
  }), [workspace.persistProject, workspace.activateProject]);

  function updateProject(updater: (current: CharacterProject) => CharacterProject) {
    setProject((current) => ({ ...updater(current), updatedAt: now() }));
  }

  const styleLibrary = useStyleLibrary(project, workspace.projects, updateProject, inform);
  const generationContext = resolveProjectGenerationContext(project, workspace.identities, styleLibrary.profiles, styleLibrary.activeProfileId);
  const resolvedProject = projectWithResolvedReferences(project, generationContext);
  const exportSourceProject = createPortableProjectSource(project, generationContext);
  const templateLibrary = useProjectTemplateLibrary(project, inform);
  const videoBackgroundSettings = useVideoBackgroundSettings(project, updateProject, inform);
  const customerReview = useCustomerReview(project, updateProject, inform);

  function moveState(id: string, position: { x: number; y: number }) {
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((state) => state.id === id ? { ...state, position } : state),
    }));
  }

  function autoArrangeStates() {
    const positions = calculateStateGraphLayout(project);
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((state) => ({ ...state, position: positions[state.id] ?? state.position })),
    }));
    setGraphLayoutRevision((revision) => revision + 1);
    inform(`已按状态关系整理 ${project.logicalStates.length} 个节点，并为双向连线分配独立轨道。`, "success");
  }

  function updateGenerationSettings(settings: CharacterProject["generationSettings"]) {
    updateProject((current) => ({ ...current, generationSettings: settings }));
    inform("项目生成参数已更新", "success");
  }

  function activateCustomerProject(projectId: string) {
    if (!workspace.activateProject(projectId)) {
      inform("项目数据不存在或已经损坏。", "error");
      return;
    }
    setActiveArea("graph");
    inform("已切换项目。", "success");
  }

  function createCustomerProject(input: NewOrderInput, duplicateCurrent = false) {
    const identity = workspace.identities.find((candidate) => candidate.id === input.identityProfileId);
    if (input.identityProfileId && !identity) {
      inform("所选形象已不存在，请重新选择。", "error");
      return false;
    }
    const normalizedInput = { ...input, characterName: identity?.name ?? input.characterName, identityProfileId: identity?.id };
    const next = duplicateCurrent
      ? duplicateProjectForOrder(project, normalizedInput, identity)
      : createBlankProject(normalizedInput, identity);
    if (!workspace.addProject(next)) {
      inform("无法保存新项目，请检查浏览器存储空间。", "error");
      return false;
    }
    setActiveArea("graph");
    inform(`已为“${identity?.name ?? input.characterName}”创建项目“${next.name}”。`, "success");
    return true;
  }

  function createIdentityProfile(name: string) {
    const normalized = name.trim();
    if (!normalized) return;
    const identity = createBlankIdentityProfile(normalized);
    workspace.addIdentity(identity);
    inform(`已创建形象“${normalized}”，请上传实拍参考。`, "success");
  }

  function activateIdentityProfile(id: string) {
    if (!workspace.activateIdentity(id)) {
      inform("这个形象不存在。", "error");
      return;
    }
    inform("已切换全局形象。", "success");
  }

  function updateIdentityProfile(patch: Partial<Pick<IdentityProfile, "name" | "identityPrompt">>) {
    const identity = workspace.activeIdentity;
    if (!identity) return;
    if (patch.name !== undefined && !patch.name.trim()) {
      inform("形象名称不能为空。", "error");
      return;
    }
    workspace.updateIdentity(identity.id, (current) => {
      const nextName = patch.name?.trim() || current.name;
      const nextPrompt = patch.identityPrompt !== undefined
        ? templateCharacterNamePrompt(patch.identityPrompt, current.name)
        : templateCharacterNamePrompt(current.identityPrompt, current.name);
      return { ...current, ...patch, name: nextName, identityPrompt: nextPrompt };
    });
  }

  function updateOrder(order: Partial<CharacterProject["order"]>) {
    updateProject((current) => ({ ...current, order: { ...current.order, ...order } }));
  }

  function setTodoPluginIncluded(included: boolean) {
    updateProject((current) => ({
      ...current,
      plugins: included
        ? [...current.plugins.filter((plugin) => plugin.id !== todoPluginDeclaration.id), structuredClone(todoPluginDeclaration)]
        : current.plugins.filter((plugin) => plugin.id !== todoPluginDeclaration.id),
    }));
    inform(included ? "To Do 示例插件会随宠物包发布。" : "To Do 示例插件已从当前项目移除。", "success");
  }

  function setAgentActivityPluginIncluded(included: boolean) {
    updateProject((current) => ({
      ...current,
      plugins: included
        ? [...current.plugins.filter((plugin) => plugin.id !== agentActivityPluginDeclaration.id), structuredClone(agentActivityPluginDeclaration)]
        : current.plugins.filter((plugin) => plugin.id !== agentActivityPluginDeclaration.id),
    }));
    inform(included ? "Agent Activity 会随宠物包发布。" : "Agent Activity 已从当前项目移除。", "success");
  }

  function addState(input: { label: string; semanticKey: string; description: string }) {
    const id = `state-${crypto.randomUUID()}`;
    updateProject((current) => ({
      ...current,
      logicalStates: [...current.logicalStates, {
        id,
        label: input.label,
        semanticKey: input.semanticKey || undefined,
        description: input.description,
        position: { x: 220 + current.logicalStates.length * 220, y: 430 },
        referenceArtifactIds: [],
        idleScheduler: {
          enabled: false,
          strategy: "weighted-random",
          minIntervalMs: 8000,
          maxIntervalMs: 18_000,
          avoidImmediateRepeat: true,
        },
      }],
    }));
    setSelection({ kind: "state", id });
    inform(`已创建“${input.label}”。请先基于全局身份素材生成权威参考图。`, "success");
  }

  function connectStates(sourceStateId: string, targetStateId: string) {
    if (sourceStateId === targetStateId) {
      addIdleTransition(sourceStateId);
      return;
    }
    const sourceState = project.logicalStates.find((state) => state.id === sourceStateId);
    const targetState = project.logicalStates.find((state) => state.id === targetStateId);
    const sourceVariant = project.variants.find((variant) => variant.id === sourceState?.preferredOutboundVariantId) ??
      project.variants.find((variant) => variant.id === sourceState?.defaultVariantId) ??
      project.variants.find((variant) => variant.logicalStateId === sourceStateId && variant.status === "approved");
    if (!sourceState || !targetState || !sourceVariant) {
      inform("请先为起点状态添加并确认一张图片。", "error");
      return;
    }
    const duplicate = project.transitions.find(
      (transition) => transition.fromVariantId === sourceVariant.id && transition.toLogicalStateId === targetStateId,
    );
    if (duplicate) {
      setSelection({ kind: "transition", id: duplicate.id });
      inform("这两个状态之间已经存在一条过渡线。", "info");
      return;
    }
    const id = `transition-${crypto.randomUUID()}`;
    const isDragTarget = Boolean(project.dragInteraction?.enabled && project.dragInteraction.targetLogicalStateId === targetState.id);
    const defaultTrigger: TransitionTrigger = {
      id: `trigger-${crypto.randomUUID()}`,
      event: "left-click",
      enabled: true,
      region: { shape: "ellipse", x: 0.12, y: 0.12, width: 0.76, height: 0.76 },
    };
    updateProject((current) => ({
      ...current,
      transitions: [...current.transitions, {
        id,
        label: `${sourceState.label}到${targetState.label}`,
        fromVariantId: sourceVariant.id,
        toLogicalStateId: targetState.id,
        targetDraftArtifactId: targetState.referenceArtifactId,
        mediaVersions: [],
        endFrameSource: "authority-reference",
        status: targetState.referenceArtifactId ? "target-ready" : "draft",
        prompt: isDragTarget
          ? dragPoseTransitionPrompt(sourceState.label)
          : `角色从${sourceState.label}自然转换到${targetState.label}，动作稳定且身份保持一致。`,
        durationMs: 4000,
        durationMode: project.generationSettings.durationMode,
        durationSeconds: project.generationSettings.durationSeconds,
        transparentVideo: true,
        transparencyProcessing: { keyColor: "#00FF00", similarity: 0.34 },
        authorityBridge: { mode: "crossfade", durationMs: 700 },
        triggers: [defaultTrigger],
      }],
    }));
    setSelection({ kind: "transition", id });
    inform(targetState.referenceArtifactId
      ? "过渡线已建立，默认使用左键单击触发；现在可以继续配置并生成视频。"
      : "过渡线已建立，默认使用左键单击触发；请先为目标状态准备权威参考图。", "success");
  }

  function addIdleTransition(stateId: string) {
    const state = project.logicalStates.find((candidate) => candidate.id === stateId);
    const sourceVariant = project.variants.find((variant) => variant.id === state?.preferredOutboundVariantId) ??
      project.variants.find((variant) => variant.id === state?.defaultVariantId) ??
      project.variants.find((variant) => variant.logicalStateId === stateId && variant.status === "approved");
    if (!state || !sourceVariant) {
      inform("这个状态还没有实际展示图，暂时不能创建待机动画。", "error");
      return;
    }
    const sequence = project.transitions.filter((transition) =>
      transition.fromVariantId === sourceVariant.id && transition.toLogicalStateId === stateId && transition.idleRule).length + 1;
    const id = `transition-idle-${crypto.randomUUID()}`;
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((candidate) => candidate.id === stateId
        ? { ...candidate, idleScheduler: { ...candidate.idleScheduler, enabled: true } }
        : candidate),
      transitions: [...current.transitions, {
        id,
        label: `${state.label} · 待机动作 ${sequence}`,
        fromVariantId: sourceVariant.id,
        toLogicalStateId: stateId,
        targetDraftArtifactId: state.referenceArtifactId,
        mediaVersions: [],
        endFrameSource: "source-frame",
        status: state.referenceArtifactId ? "target-ready" : "draft",
        prompt: `${CHARACTER_NAME_PROMPT_VARIABLE} 保持“${state.label}”的整体姿态，只做一次轻微、自然的待机动作，最后回到与起始画面完全相同的位置、比例和轮廓。`,
        durationMs: 4000,
        entryBlendMs: 320,
        durationMode: project.generationSettings.durationMode,
        durationSeconds: project.generationSettings.durationSeconds,
        transparentVideo: true,
        transparencyProcessing: { keyColor: "#00FF00", similarity: 0.34 },
        authorityBridge: { mode: "crossfade", durationMs: 360 },
        idleRule: { enabled: true, weight: 1, cooldownMs: 20_000 },
        triggers: [],
      }],
    }));
    setSelection({ kind: "transition", id });
    inform(`已创建“${state.label}”待机动画 ${sequence}，动画结束会回到原实际静态帧。`, "success");
  }

  function updateIdleScheduler(stateId: string, idleScheduler: IdleScheduler) {
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((state) => state.id === stateId ? { ...state, idleScheduler } : state),
    }));
  }

  function updatePointerGaze(stateId: string, pointerGaze: PointerGaze) {
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((state) => state.id === stateId ? { ...state, pointerGaze } : state),
    }));
  }

  function updateStateDefinition(stateId: string, patch: Partial<Pick<CharacterProject["logicalStates"][number], "label" | "semanticKey" | "description">>) {
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((state) => state.id === stateId ? { ...state, ...patch } : state),
    }));
  }

  function updateDragInteraction(dragInteraction?: DragInteraction) {
    updateProject((current) => {
      if (dragInteraction && dragInteraction.targetLogicalStateId !== current.dragInteraction?.targetLogicalStateId) dragInteraction = { ...dragInteraction, targetVariantId: undefined };
      const targetStateId = dragInteraction?.enabled ? dragInteraction.targetLogicalStateId : undefined;
      if (!targetStateId) return { ...current, dragInteraction };
      return {
        ...current,
        dragInteraction,
        logicalStates: current.logicalStates.map((state) => state.id === targetStateId && shouldRefreshDragPoseDescription(state.description)
          ? { ...state, description: dragPoseStateDescription }
          : state),
        transitions: current.transitions.map((transition) => {
          if (transition.toLogicalStateId !== targetStateId || !shouldRefreshDragTransitionPrompt(transition.prompt)) return transition;
          const sourceStateId = current.variants.find((variant) => variant.id === transition.fromVariantId)?.logicalStateId;
          const sourceLabel = current.logicalStates.find((state) => state.id === sourceStateId)?.label ?? "当前状态";
          return { ...transition, prompt: dragPoseTransitionPrompt(sourceLabel) };
        }),
      };
    });
  }

  function activatePointerGazeVideo(stateId: string, videoArtifactId: string) {
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((state) => state.id === stateId && state.pointerGaze
        ? { ...state, pointerGaze: { ...state.pointerGaze, videoArtifactId } }
        : state),
    }));
  }

  async function generatePointerGazeVideo(stateId: string) {
    if (busy) return;
    const state = project.logicalStates.find((candidate) => candidate.id === stateId);
    const gaze = state?.pointerGaze;
    const sourceVariant = project.variants.find((variant) => variant.id === state?.preferredOutboundVariantId)
      ?? project.variants.find((variant) => variant.id === state?.defaultVariantId)
      ?? project.variants.find((variant) => variant.logicalStateId === stateId && variant.status === "approved");
    const sourceArtifactId = sourceVariant?.imageArtifactId ?? state?.referenceArtifactId;
    const sourceImage = project.artifacts.find((artifact) => artifact.id === sourceArtifactId);
    if (!state || !gaze?.enabled || !sourceImage) {
      inform("请先启用注视鼠标，并为当前状态准备实际展示图。", "error");
      return;
    }
    const identityReferences = generationContext.identityReferences.map((artifact) => artifact.uri);
    const chromaBackgroundColor = project.videoBackground.mode === "manual"
      ? project.videoBackground.manualColor
      : project.videoBackground.autoColor;
    const motionPrompt = gaze.motionTarget === "eyes"
      ? `${CHARACTER_NAME_PROMPT_VARIABLE} 保持“${state.label}”的身体姿态完全固定。摄影机、角色包围盒、身体尺寸、位置和透明画布边距从第一帧到最后一帧完全不变。头部必须像冻结的单张照片一样逐像素锁定：两只耳朵、头顶轮廓、眼周全部花纹、鼻子、口鼻、嘴角和下巴的位置、角度、大小绝对不能变化。禁止转头、歪头、抬头、低头、伸脖子、缩脖子、动耳朵、眨眼或改变表情。唯一允许运动的是两只眼睛内部的瞳孔；左右瞳孔方向始终一致，每只眼睛只保留一个稳定自然高光。严格按 6 秒时间点生成：0.0–0.4 秒正前方静止；0.6 秒看左；1.2 秒看左上；1.8 秒看上；2.4 秒看右上；3.0 秒看右；3.6 秒看右下；4.2 秒看下；4.8 秒看左下；5.4–6.0 秒回到正前方并静止。`
      : `${CHARACTER_NAME_PROMPT_VARIABLE} 保持“${state.label}”的身体、四肢和尾巴完全固定，只让眼睛与头部小幅追踪屏幕周围目标。摄影机、角色包围盒、身体尺寸、位置和透明画布边距从第一帧到最后一帧完全不变，禁止身体旋转、位移、缩放或改变姿势。严格按 6 秒时间点生成：0.0–0.4 秒正前方静止；0.6 秒看左；1.2 秒看左上；1.8 秒看上；2.4 秒看右上；3.0 秒看右；3.6 秒看右下；4.2 秒看下；4.8 秒看左下；5.4–6.0 秒准确回到正前方并静止。所有转动小幅、均匀、连续。`;
    const durationSeconds = 6;
    const estimate = estimateVideoGenerationCost({
      model: project.generationSettings.videoModel,
      models: providerModelSelection(generationProviders.snapshot, "video", project.generationSettings.videoProviderId),
      resolution: project.generationSettings.videoResolution,
      durationMode: "fixed",
      durationSeconds,
    });
    if (!estimate) {
      inform("请在模型服务中补充此视频模型的预估费用，再生成。", "error");
      return;
    }
    const budget = generationBudgetAllows(project, estimate.maximumCny);
    if (!budget.allowed) {
      inform(`预算保护：本次最高 ¥${estimate.maximumCny.toFixed(2)}，项目剩余预算不足。`, "error");
      return;
    }
    const settings = { ...project.generationSettings, durationMode: "fixed" as const, durationSeconds };
    const assembledPrompt = assembleTransitionPrompt({
      characterName: generationContext.characterName,
      identityPrompt: generationContext.identityPrompt,
      stylePrompt: generationContext.videoStylePrompt,
      prompt: motionPrompt,
      settings,
      transparentVideo: true,
      chromaBackgroundColor,
    });
    const jobId = crypto.randomUUID();
    setBusy(true);
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((candidate) => candidate.id === stateId && candidate.pointerGaze
        ? {
            ...candidate,
            pointerGaze: {
              ...candidate.pointerGaze,
              directionKeyframesMs: candidate.pointerGaze.directionKeyframesMs ?? [...defaultPointerGazeDirectionKeyframesMs],
              blendDurationMs: candidate.pointerGaze.blendDurationMs ?? 240,
            },
          }
        : candidate),
      jobs: [{
        id: jobId,
        kind: "transition",
        status: "queued",
        progress: 0,
        prompt: motionPrompt,
        provider: videoProviderType,
        model: settings.videoModel,
        createdAt: now(),
        outputArtifactIds: [],
        assembledPrompt,
        chromaKeyColor: chromaBackgroundColor,
        cost: toPersistentJobCost(estimate),
      }, ...current.jobs],
    }));
    try {
      await workspace.persistProject();
      const submitted = await submitTransitionJob({
        characterName: generationContext.characterName,
        jobId,
        trigger: { projectId: project.id, entityType: "pointer-gaze", entityId: state.id, label: `${state.label} · ${gaze.motionTarget === "eyes" ? "眼睛" : "头部"}注视` },
        fromStateImageUri: sourceImage.uri,
        targetDraftImageUri: sourceImage.uri,
        identityReferenceUris: identityReferences,
        identityPrompt: generationContext.identityPrompt,
        stylePrompt: generationContext.videoStylePrompt,
        prompt: motionPrompt,
        settings,
        durationMode: "fixed",
        durationSeconds,
        transparentVideo: true,
        transparencyKeyColor: chromaBackgroundColor,
        transparencySimilarity: 0.34,
        chromaBackgroundColor,
      });
      upsertPersistentJob(submitted);
      inform("注视视频已进入后台生成，页面关闭后仍会继续。", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "注视视频提交失败";
      updateProject((current) => ({
        ...current,
        jobs: current.jobs.map((job) => job.id === jobId ? { ...job, status: "failed", error: message } : job),
      }));
      inform(message, "error");
    } finally {
      setBusy(false);
    }
  }

  function updateIdleRule(transitionId: string, idleRule: IdleTransitionRule) {
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === transitionId ? { ...transition, idleRule } : transition),
    }));
  }

  function updateTransitionPrompt(transitionId: string, prompt: string) {
    const promptTemplate = templateCharacterNamePrompt(prompt, generationContext.characterName);
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === transitionId ? { ...transition, prompt: promptTemplate } : transition),
    }));
  }

  function updateTransitionTriggers(transitionId: string, triggers: TransitionTrigger[]) {
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === transitionId ? { ...transition, triggers } : transition),
    }));
  }

  function attachStateReference(stateId: string, artifact: Artifact) {
    updateProject((current) => activateAuthorityReference({
      ...current,
      artifacts: [...current.artifacts, artifact],
    }, stateId, artifact.id));
  }

  async function generateStateImage(stateId: string, options?: StateGenerationOptions) {
    if (busy) {
      if (options?.throwOnFailure) throw new Error("另一个生成任务正在提交，请稍后自动重试。");
      return;
    }
    const state = project.logicalStates.find((candidate) => candidate.id === stateId);
    if (!state) return;
    const references = generationContext.identityReferences.map((artifact) => artifact.uri);
    if (references.length === 0) {
      inform("请先在“项目风格规则”中配置至少一张角色参考图。", "error");
      if (options?.throwOnFailure) throw new Error("缺少身份参考图");
      return;
    }
    const stylePrompt = options?.stylePrompt?.trim() || generationContext.imageStylePrompt;
    const promptRequest = {
      characterName: generationContext.characterName,
      identityReferenceUris: references,
      identityPrompt: generationContext.identityPrompt,
      stylePrompt,
      targetStateLabel: state.label,
      prompt: state.description,
      settings: project.generationSettings,
    };
    const prompt = assembleStateDraftPrompt(promptRequest);
    if (options?.persistProjectStyle) {
      styleLibrary.bindProject(project.id, options.styleProfileId);
      const promptTemplate = templateCharacterNamePrompt(stylePrompt, generationContext.characterName);
      updateProject((current) => ({ ...current, styleProfileId: options.styleProfileId, stylePrompt: promptTemplate, imageStylePrompt: promptTemplate }));
    }
    const jobId = crypto.randomUUID();
    const estimate = estimateImageGenerationCost(
      project.generationSettings.imageModel,
      project.generationSettings.imageCandidateCount,
      providerModelSelection(generationProviders.snapshot, "image", project.generationSettings.imageProviderId),
    );
    if (!estimate) {
      inform("请在模型服务中补充此图片模型的预估费用，再生成。", "error");
      if (options?.throwOnFailure) throw new Error("请在模型服务中补充此图片模型的预估费用");
      return;
    }
    const budget = generationBudgetAllows(project, estimate.maximumCny);
    if (!budget.allowed) {
      inform(`预算保护：本项目已承诺 ¥${budget.committedCny.toFixed(2)}，本次最高 ¥${estimate.maximumCny.toFixed(2)}，不能超过 ¥${budget.limitCny.toFixed(2)}。`, "error");
      if (options?.throwOnFailure) throw new Error("项目剩余预算不足");
      return;
    }
    const cost = toPersistentJobCost(estimate);
    setBusy(true);
    setNotice(`正在提交“${state.label}”权威参考图任务`);
    updateProject((current) => ({
      ...current,
      jobs: [{
        id: jobId,
        kind: "state-draft",
        status: "queued",
        progress: 0,
        prompt,
        provider: imageProviderType,
        model: project.generationSettings.imageModel,
        createdAt: now(),
        outputArtifactIds: [],
        cost,
      }, ...current.jobs],
    }));
    try {
      await workspace.persistProject();
      const submitted = await submitStateDraftJob({
        jobId,
        trigger: { projectId: project.id, entityType: "state", entityId: state.id, label: state.label },
        ...promptRequest,
      });
      upsertPersistentJob(submitted);
      inform(`“${state.label}”权威参考图已进入后台生成。`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片生成任务提交失败";
      updateProject((current) => ({
        ...current,
        jobs: current.jobs.map((job) => job.id === jobId ? { ...job, status: "failed", error: message } : job),
      }));
      inform(message, "error");
      if (options?.throwOnFailure) throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadStateImage(stateId: string, file: File) {
    setBusy(true);
    try {
      const stored = await importImageFile(file);
      attachStateReference(stateId, {
        id: `artifact-upload-${crypto.randomUUID()}`,
        kind: "state-draft",
        uri: stored.uri,
        mimeType: stored.mimeType,
        createdAt: now(),
        provenance: "user-upload",
        label: file.name,
      });
      inform("上传图片已保存为当前状态的权威参考图。", "success");
    } catch (error) {
      inform(error instanceof Error ? error.message : "图片上传失败", "error");
    } finally {
      setBusy(false);
    }
  }

  function activateStateReference(stateId: string, artifactId: string) {
    updateProject((current) => activateAuthorityReference(current, stateId, artifactId));
    inform("已选择新的权威参考图，并设为这个状态的默认展示图；旧版本仍然保留。", "success");
  }

  function setInitialStateFromReference(stateId: string) {
    const state = project.logicalStates.find((candidate) => candidate.id === stateId);
    const reference = project.artifacts.find((artifact) => artifact.id === state?.referenceArtifactId);
    if (!state || !reference) {
      inform("请先为这个状态选择一张权威参考图。", "error");
      return;
    }
    updateProject((current) => promoteReferenceToInitialState(current, stateId));
    inform(`已将“${state.label}”设为桌面宠物的初始实际状态。`, "success");
  }

  function setPreferredOutboundVariant(stateId: string, variantId: string) {
    const variant = project.variants.find((candidate) => candidate.id === variantId && candidate.logicalStateId === stateId && candidate.status === "approved");
    if (!variant) {
      inform("这张图还不能作为过渡起点。", "error");
      return;
    }
    updateProject((current) => ({
      ...current,
      logicalStates: current.logicalStates.map((state) => state.id === stateId
        ? { ...state, preferredOutboundVariantId: variantId }
        : state),
    }));
    inform(`后续从这个状态新建过渡时，将使用“${variant.label}”作为首帧参考。`, "success");
  }

  function updateImageCandidateCount(count: number) {
    updateProject((current) => ({
      ...current,
      generationSettings: { ...current.generationSettings, imageCandidateCount: count },
    }));
  }

  async function generateTargetDraft(transitionId: string) {
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    if (transition) await generateStateImage(transition.toLogicalStateId);
  }

  function updateTransitionDuration(transitionId: string, mode: "smart" | "fixed", seconds?: number) {
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === transitionId
        ? { ...transition, durationMode: mode, durationSeconds: mode === "fixed" ? seconds : undefined }
        : transition),
    }));
  }

  function updateTransitionTransparency(transitionId: string, transparentVideo: boolean) {
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === transitionId
        ? { ...transition, transparentVideo }
        : transition),
    }));
    inform(transparentVideo
      ? "已开启透明视频：生成后会自动执行绿幕抠色和 Alpha 通道编码。"
      : "已关闭透明化处理，视频仍会统一为无声方形输出。", "success");
  }

  function updateTransitionTransparencyProcessing(transitionId: string, transparencyProcessing: TransparencyProcessing) {
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === transitionId
        ? { ...transition, transparencyProcessing }
        : transition),
    }));
  }

  function updateTransitionPlayback(transitionId: string, playback: TransitionPlayback) {
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => {
        if (transition.id !== transitionId) return transition;
        const versions = ensureTransitionMediaVersions(transition, current.artifacts);
        return {
          ...transition,
          playback,
          mediaVersions: versions.map((version) => version.id === transition.activeMediaVersionId
            ? { ...version, playback }
            : version),
        };
      }),
    }));
  }

  async function createPingPongTransitionVersion(transitionId: string, playback: TransitionPlayback) {
    if (busy) return;
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    const sourceVariant = project.variants.find((variant) => variant.id === transition?.fromVariantId);
    if (!transition || !sourceVariant || sourceVariant.logicalStateId !== transition.toLogicalStateId) {
      inform("正反往复版本只适用于回到同一状态的互动或待机动画。", "error");
      return;
    }
    const versions = ensureTransitionMediaVersions(transition, project.artifacts);
    const activeVersion = versions.find((version) => version.id === transition.activeMediaVersionId) ??
      versions.find((version) => version.videoArtifactId === transition.videoArtifactId) ?? versions.at(-1);
    const sourceVideoArtifactId = activeVersion?.sourceVideoArtifactId ?? activeVersion?.videoArtifactId ?? transition.videoArtifactId;
    const sourceVideo = project.artifacts.find((artifact) => artifact.id === sourceVideoArtifactId);
    const sourceVersion = versions.find((version) => version.videoArtifactId === sourceVideoArtifactId);
    const sourceDurationMs = sourceVersion?.durationMs ?? transition.sourceVideoDurationMs ?? transition.durationMs;
    const segmentStartMs = Math.max(0, Math.min(playback.segmentStartMs, sourceDurationMs - 100));
    const segmentEndMs = Math.max(segmentStartMs + 100, Math.min(playback.segmentEndMs ?? Math.min(2_000, sourceDurationMs), sourceDurationMs));
    if (!sourceVideo) {
      inform("找不到生成往复版本所需的原始正向视频。", "error");
      return;
    }
    setBusy(true);
    setNotice(`正在本机截取 ${(segmentStartMs / 1000).toFixed(1)}–${(segmentEndMs / 1000).toFixed(1)} 秒并生成正反往复版本`);
    try {
      const response = await fetch("/api/media/ping-pong", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUri: sourceVideo.uri,
          segmentStartMs,
          segmentEndMs,
          hasAlpha: sourceVideo.hasAlpha ?? false,
          pixelWidth: sourceVideo.pixelWidth,
          pixelHeight: sourceVideo.pixelHeight,
        }),
      });
      const payload = await parseJsonResponse<{
        durationMs?: number;
        video?: GeneratedMedia;
        tail?: GeneratedMedia;
      }>(response, "本机正反往复处理");
      if (!payload.video || !payload.tail || !payload.durationMs) throw new Error("往复处理完成，但服务没有返回完整媒体。");
      const durationMs = payload.durationMs;
      const createdAt = now();
      const normalizedPlayback: TransitionPlayback = {
        ...playback,
        mode: "ping-pong",
        segmentStartMs,
        segmentEndMs,
      };
      const videoArtifact: Artifact = {
        id: `artifact-ping-pong-video-${crypto.randomUUID()}`,
        kind: "transition-video",
        uri: payload.video.uri,
        mimeType: payload.video.mimeType,
        createdAt,
        sourceJobId: sourceVideo.sourceJobId,
        provenance: "generated",
        pixelWidth: payload.video.pixelWidth ?? sourceVideo.pixelWidth,
        pixelHeight: payload.video.pixelHeight ?? sourceVideo.pixelHeight,
        silent: true,
        hasAlpha: sourceVideo.hasAlpha ?? false,
        transparencyMethod: sourceVideo.transparencyMethod,
        alphaCoverage: payload.video.alphaCoverage ?? sourceVideo.alphaCoverage,
        label: `${transition.label} · ${(segmentStartMs / 1000).toFixed(1)}–${(segmentEndMs / 1000).toFixed(1)}s 正反往复`,
      };
      const tailArtifact: Artifact = {
        id: `artifact-ping-pong-tail-${crypto.randomUUID()}`,
        kind: "state-actual",
        uri: payload.tail.uri,
        mimeType: payload.tail.mimeType,
        createdAt,
        sourceJobId: sourceVideo.sourceJobId,
        provenance: "generated",
        pixelWidth: payload.tail.pixelWidth ?? sourceVideo.pixelWidth,
        pixelHeight: payload.tail.pixelHeight ?? sourceVideo.pixelHeight,
        hasAlpha: sourceVideo.hasAlpha ?? false,
        transparencyMethod: sourceVideo.transparencyMethod,
        alphaCoverage: payload.tail.alphaCoverage ?? sourceVideo.alphaCoverage,
        label: `${transition.label} · 往复循环接缝帧`,
      };
      const versionId = `media-version-ping-pong-${crypto.randomUUID()}`;
      updateProject((current) => ({
        ...current,
        artifacts: [...current.artifacts, videoArtifact, tailArtifact],
        transitions: current.transitions.map((candidate) => candidate.id === transitionId
          ? {
              ...candidate,
              videoArtifactId: videoArtifact.id,
              extractedTailArtifactId: tailArtifact.id,
              sourceVideoDurationMs: durationMs,
              selectedEndMs: durationMs,
              durationMs,
              endFrameSource: "source-frame",
              toVariantId: candidate.fromVariantId,
              playback: normalizedPlayback,
              mediaVersions: [...versions, {
                id: versionId,
                label: `${candidate.label} · 正反往复 ${versions.length + 1}`,
                videoArtifactId: videoArtifact.id,
                tailArtifactId: tailArtifact.id,
                sourceVideoArtifactId,
                createdAt,
                sourceJobId: sourceVideo.sourceJobId,
                transparent: sourceVideo.hasAlpha ?? false,
                durationMs,
                selectedEndMs: durationMs,
                generationPrompt: activeVersion?.generationPrompt ?? candidate.lastGenerationPrompt,
                generationModel: activeVersion?.generationModel ?? candidate.lastGenerationModel,
                chromaKeyColor: activeVersion?.chromaKeyColor ?? candidate.lastChromaKeyColor,
                playback: normalizedPlayback,
              }],
              activeMediaVersionId: versionId,
            }
          : candidate),
      }));
      inform(`倒放设置已保存并应用：每轮 ${(durationMs / 1000).toFixed(1)} 秒，原视频和全部历史版本均已保留。`, "success");
    } catch (caught) {
      inform(caught instanceof Error ? caught.message : "本机正反往复处理失败", "error");
    } finally {
      setBusy(false);
    }
  }

  async function transparentizeExistingTransition(transitionId: string) {
    if (busy) return;
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    const video = project.artifacts.find((artifact) => artifact.id === transition?.videoArtifactId);
    const tail = project.artifacts.find((artifact) => artifact.id === transition?.extractedTailArtifactId);
    if (!transition || !video || !tail) {
      inform("处理当前视频需要已生成的视频和对应的视频帧。", "error");
      return;
    }
    setBusy(true);
    setNotice("正在使用 Apple Vision 识别宠物主体并移除背景与地面阴影");
    const transparencyProcessing = transition.transparencyProcessing ?? { keyColor: "#00FF00", similarity: 0.34 };
    try {
      const response = await fetch("/api/media/transparentize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUri: video.uri,
          tailUri: tail.uri,
          resolution: project.generationSettings.videoResolution,
          keyColor: transparencyProcessing.keyColor,
          similarity: transparencyProcessing.similarity,
        }),
      });
      const payload = await parseJsonResponse<{
        video?: GeneratedMedia;
        tail?: GeneratedMedia;
        error?: { message?: string };
      }>(response, "Apple Vision 透明化");
      if (!payload.video || !payload.tail) {
        throw new Error("Apple Vision 透明化完成，但服务没有返回视频和结束帧。请重新执行。");
      }
      const createdAt = now();
      const videoArtifact: Artifact = {
        id: `artifact-transparent-video-${crypto.randomUUID()}`,
        kind: "transition-video",
        uri: payload.video.uri,
        mimeType: payload.video.mimeType,
        createdAt,
        sourceJobId: video.sourceJobId,
        provenance: "generated",
        pixelWidth: payload.video.pixelWidth,
        pixelHeight: payload.video.pixelHeight,
        silent: true,
        hasAlpha: true,
        transparencyMethod: payload.video.transparencyMethod,
        alphaCoverage: payload.video.alphaCoverage,
        label: `${transition.label} · Apple Vision 智能抠图`,
      };
      const tailArtifact: Artifact = {
        id: `artifact-transparent-tail-${crypto.randomUUID()}`,
        kind: "state-actual",
        uri: payload.tail.uri,
        mimeType: payload.tail.mimeType,
        createdAt,
        sourceJobId: tail.sourceJobId,
        provenance: "generated",
        pixelWidth: payload.tail.pixelWidth,
        pixelHeight: payload.tail.pixelHeight,
        hasAlpha: true,
        transparencyMethod: payload.tail.transparencyMethod,
        alphaCoverage: payload.tail.alphaCoverage,
        label: `${transition.label} · 智能抠图结束帧`,
      };
      const previousVersions = ensureTransitionMediaVersions(transition, project.artifacts);
      const sourceVersion = previousVersions.find((version) => version.id === transition.activeMediaVersionId) ??
        previousVersions.find((version) => version.videoArtifactId === transition.videoArtifactId) ??
        previousVersions.at(-1);
      const versionId = `media-version-transparent-${crypto.randomUUID()}`;
      updateProject((current) => ({
        ...current,
        artifacts: [...current.artifacts, videoArtifact, tailArtifact],
        variants: current.variants.map((variant) =>
          transition.endFrameSource === "video-frame" && variant.id === transition.toVariantId
            ? { ...variant, imageArtifactId: tailArtifact.id }
            : variant),
        transitions: current.transitions.map((candidate) => candidate.id === transitionId
          ? {
              ...candidate,
              videoArtifactId: videoArtifact.id,
              extractedTailArtifactId: tailArtifact.id,
              mediaVersions: [...previousVersions, {
                id: versionId,
                label: `${transition.label} · 智能抠图 ${previousVersions.length + 1}`,
                videoArtifactId: videoArtifact.id,
                tailArtifactId: tailArtifact.id,
                createdAt,
                sourceJobId: video.sourceJobId,
                transparent: true,
                durationMs: transition.sourceVideoDurationMs ?? transition.durationMs,
                selectedEndMs: transition.selectedEndMs,
                generationPrompt: sourceVersion?.generationPrompt ?? transition.lastGenerationPrompt,
                generationModel: sourceVersion?.generationModel ?? transition.lastGenerationModel,
                chromaKeyColor: sourceVersion?.chromaKeyColor ?? transition.lastChromaKeyColor,
                sourceVideoArtifactId: sourceVersion?.sourceVideoArtifactId,
                playback: sourceVersion?.playback ?? transition.playback,
              }],
              activeMediaVersionId: versionId,
            }
          : candidate),
      }));
      inform("Apple Vision 已移除背景和地面阴影；原视频与旧透明版本仍保留在历史中。", "success");
    } catch (caught) {
      inform(caught instanceof Error ? caught.message : "当前视频透明化失败", "error");
    } finally {
      setBusy(false);
    }
  }

  function activateTransitionMediaVersion(transitionId: string, versionId: string) {
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition) return;
    const versions = ensureTransitionMediaVersions(transition, project.artifacts);
    const version = versions.find((candidate) => candidate.id === versionId);
    if (!version) return;
    updateProject((current) => ({
      ...current,
      variants: current.variants.map((variant) =>
        transition.endFrameSource === "video-frame" && variant.id === transition.toVariantId
          ? { ...variant, imageArtifactId: version.tailArtifactId }
          : variant),
      transitions: current.transitions.map((candidate) => candidate.id === transitionId
        ? {
            ...candidate,
            mediaVersions: versions,
            activeMediaVersionId: version.id,
            videoArtifactId: version.videoArtifactId,
            extractedTailArtifactId: version.tailArtifactId,
            selectedEndMs: version.selectedEndMs ?? version.durationMs,
            sourceVideoDurationMs: version.durationMs,
            durationMs: version.selectedEndMs ?? version.durationMs,
            playback: version.playback ?? {
              mode: "forward",
              repeatMode: "fixed",
              minCycles: 1,
              maxCycles: 1,
              segmentStartMs: 0,
            },
          }
        : candidate),
    }));
    inform(`已切换到“${version.label}”${version.transparent ? "透明" : "普通"}版本。`, "success");
  }

  function updateTransitionEndFrameSource(
    transitionId: string,
    endFrameSource: "authority-reference" | "video-frame",
  ) {
    updateProject((current) => {
      const reconciled = reconcileTransitionEndpointVariants({
        ...current,
        transitions: current.transitions.map((transition) => transition.id === transitionId
          ? { ...transition, endFrameSource }
          : transition),
      });
      const updatedTransition = reconciled.transitions.find((transition) => transition.id === transitionId);
      return {
        ...reconciled,
        logicalStates: reconciled.logicalStates.map((state) =>
          state.id === updatedTransition?.toLogicalStateId && updatedTransition.status === "approved" && updatedTransition.toVariantId
            ? { ...state, preferredOutboundVariantId: updatedTransition.toVariantId }
            : state),
      };
    });
    inform(endFrameSource === "video-frame"
      ? "结束实际图已切换为视频选帧；后续过渡会从这张图开始。"
      : "结束实际图已切换为权威参考图；预览与发布会从冻结的视频末帧收口到这张图。", "success");
  }

  function updateTransitionAuthorityBridge(transitionId: string, authorityBridge: AuthorityBridge) {
    updateProject((current) => ({
      ...current,
      transitions: current.transitions.map((transition) => transition.id === transitionId
        ? { ...transition, authorityBridge }
        : transition),
    }));
    inform(authorityBridge.mode === "hard-cut"
      ? "权威参考图将直接切换。"
      : `已设置 ${(authorityBridge.durationMs / 1000).toFixed(2)} 秒双层重叠收口。`, "success");
  }

  async function generateTransition(transitionId: string, throwOnFailure = false) {
    if (busy) {
      if (throwOnFailure) throw new Error("另一个生成任务正在提交，请稍后自动重试。");
      return;
    }
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    const targetReference = project.artifacts.find((artifact) => artifact.id === transition?.targetDraftArtifactId);
    if (!transition || !targetReference) {
      inform("目标状态还没有权威参考图。", "error");
      if (throwOnFailure) throw new Error("目标状态还没有权威参考图");
      return;
    }
    const sourceImage = resolveTransitionSourceArtifact(project, transition.id);
    if (!sourceImage) {
      inform("起始状态缺少实际展示静态图。", "error");
      if (throwOnFailure) throw new Error("起始状态缺少实际展示静态图");
      return;
    }
    const identityReferences = generationContext.identityReferences.map((artifact) => artifact.uri);
    const transitionGuidanceReferences = (transition.guidanceArtifactIds ?? [])
      .map((id) => project.artifacts.find((artifact) => artifact.id === id)?.uri)
      .filter((uri): uri is string => Boolean(uri));
    const chromaBackgroundColor = project.videoBackground.mode === "manual"
      ? project.videoBackground.manualColor
      : project.videoBackground.autoColor;
    const assembledPrompt = assembleTransitionPrompt({
      characterName: generationContext.characterName,
      identityPrompt: generationContext.identityPrompt,
      stylePrompt: generationContext.videoStylePrompt,
      prompt: transition.prompt,
      settings: project.generationSettings,
      transparentVideo: transition.transparentVideo,
      chromaBackgroundColor,
    });
    const jobId = crypto.randomUUID();
    const estimate = estimateVideoGenerationCost({
      model: project.generationSettings.videoModel,
      models: providerModelSelection(generationProviders.snapshot, "video", project.generationSettings.videoProviderId),
      resolution: project.generationSettings.videoResolution,
      durationMode: transition.durationMode,
      durationSeconds: transition.durationSeconds,
    });
    if (!estimate) {
      inform("请在模型服务中补充此视频模型的预估费用，再生成。", "error");
      if (throwOnFailure) throw new Error("请在模型服务中补充此视频模型的预估费用");
      return;
    }
    const budget = generationBudgetAllows(project, estimate.maximumCny);
    if (!budget.allowed) {
      inform(`预算保护：本项目已承诺 ¥${budget.committedCny.toFixed(2)}，本次最高 ¥${estimate.maximumCny.toFixed(2)}，不能超过 ¥${budget.limitCny.toFixed(2)}。`, "error");
      if (throwOnFailure) throw new Error("项目剩余预算不足");
      return;
    }
    const cost = toPersistentJobCost(estimate);
    setBusy(true);
    updateProject((current) => ({
      ...current,
      jobs: [{
        id: jobId,
        kind: "transition",
        status: "queued",
        progress: 0,
        prompt: transition.prompt,
        provider: videoProviderType,
        model: project.generationSettings.videoModel,
        createdAt: now(),
        outputArtifactIds: [],
        assembledPrompt,
        chromaKeyColor: chromaBackgroundColor,
        cost,
      }, ...current.jobs],
      transitions: current.transitions.map((candidate) => candidate.id === transitionId ? {
        ...candidate,
        status: "generating",
        lastGenerationPrompt: assembledPrompt,
        lastGenerationModel: project.generationSettings.videoModel,
        lastChromaKeyColor: chromaBackgroundColor,
      } : candidate),
    }));
    try {
      await workspace.persistProject();
      const submitted = await submitTransitionJob({
        characterName: generationContext.characterName,
        jobId,
        trigger: { projectId: project.id, entityType: "transition", entityId: transition.id, label: transition.label },
        fromStateImageUri: sourceImage.uri,
        targetDraftImageUri: targetReference.uri,
        identityReferenceUris: [...new Set([...identityReferences, ...transitionGuidanceReferences])],
        identityPrompt: generationContext.identityPrompt,
        stylePrompt: generationContext.videoStylePrompt,
        prompt: transition.prompt,
        settings: project.generationSettings,
        durationMode: transition.durationMode,
        durationSeconds: transition.durationSeconds,
        transparentVideo: transition.transparentVideo,
        transparencyKeyColor: chromaBackgroundColor,
        transparencySimilarity: transition.transparencyProcessing?.similarity ?? 0.34,
        chromaBackgroundColor,
      });
      upsertPersistentJob(submitted);
      inform("过渡视频已进入后台生成；完成后会新增一个实际展示变体候选。", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "视频生成任务提交失败";
      updateProject((current) => ({
        ...current,
        jobs: current.jobs.map((job) => job.id === jobId ? { ...job, status: "failed", error: message } : job),
        transitions: current.transitions.map((candidate) => candidate.id === transitionId ? { ...candidate, status: "failed" } : candidate),
      }));
      inform(message, "error");
      if (throwOnFailure) throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function uploadTransitionVideo(transitionId: string, file: File) {
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition?.targetDraftArtifactId) {
      inform("请先准备目标状态的权威参考图。", "error");
      return;
    }
    setBusy(true);
    try {
      const stored = await importVideoFile(file);
      const timestamp = now();
      const artifact: Artifact = {
        id: `artifact-uploaded-video-${crypto.randomUUID()}`,
        kind: "transition-video",
        uri: stored.uri,
        mimeType: stored.mimeType,
        createdAt: timestamp,
        provenance: "user-upload",
        silent: false,
        hasAlpha: false,
        label: `${transition.label} · 上传视频`,
      };
      const versionId = `media-version-upload-${crypto.randomUUID()}`;
      const versions = ensureTransitionMediaVersions(transition, project.artifacts);
      updateProject((current) => ({
        ...current,
        artifacts: [...current.artifacts, artifact],
        transitions: current.transitions.map((candidate) => candidate.id === transitionId ? {
          ...candidate,
          status: "review",
          videoArtifactId: artifact.id,
          endFrameSource: candidate.endFrameSource === "source-frame" ? "source-frame" : "authority-reference",
          sourceVideoDurationMs: candidate.durationMs,
          selectedEndMs: candidate.durationMs,
          activeMediaVersionId: versionId,
          mediaVersions: [...versions, {
            id: versionId,
            label: `${candidate.label} · 上传 ${versions.length + 1}`,
            videoArtifactId: artifact.id,
            tailArtifactId: candidate.targetDraftArtifactId!,
            createdAt: timestamp,
            transparent: false,
            durationMs: candidate.durationMs,
            selectedEndMs: candidate.durationMs,
            playback: candidate.playback,
          }],
        } : candidate),
      }));
      inform("视频已保存到本地媒体库并关联到这条过渡；原有版本仍保留。", "success");
    } catch (caught) {
      inform(caught instanceof Error ? caught.message : "视频上传失败", "error");
    } finally {
      setBusy(false);
    }
  }

  function selectTransitionFrame(
    transitionId: string,
    frame: {
      uri: string;
      mimeType: string;
      timeMs: number;
      durationMs: number;
      pixelWidth: number;
      pixelHeight: number;
      hasAlpha: boolean;
    },
  ) {
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition) return;
    const sourceJobId = project.artifacts.find((artifact) => artifact.id === transition?.videoArtifactId)?.sourceJobId;
    const versions = ensureTransitionMediaVersions(transition, project.artifacts);
    const activeVersionId = transition.activeMediaVersionId ??
      versions.find((version) => version.videoArtifactId === transition.videoArtifactId)?.id ??
      versions.at(-1)?.id;
    const artifact: Artifact = {
      id: `artifact-frame-${crypto.randomUUID()}`,
      kind: "state-actual",
      uri: frame.uri,
      mimeType: frame.mimeType,
      createdAt: now(),
      sourceJobId,
      provenance: "generated",
      pixelWidth: frame.pixelWidth,
      pixelHeight: frame.pixelHeight,
      hasAlpha: frame.hasAlpha,
      label: `${transition?.label ?? "过渡"} · 用户选定 ${Math.round(frame.timeMs)}ms`,
    };
    updateProject((current) => ({
      ...current,
      artifacts: [...current.artifacts, artifact],
      variants: current.variants.map((variant) =>
        variant.id === transition.toVariantId
          ? { ...variant, imageArtifactId: artifact.id }
          : variant),
      transitions: current.transitions.map((candidate) => candidate.id === transitionId ? {
        ...candidate,
        extractedTailArtifactId: artifact.id,
        selectedEndMs: frame.timeMs,
        sourceVideoDurationMs: frame.durationMs,
        durationMs: Math.max(1, frame.timeMs),
        endFrameSource: "video-frame",
        mediaVersions: versions.map((version) => version.id === activeVersionId
          ? { ...version, tailArtifactId: artifact.id, selectedEndMs: frame.timeMs, durationMs: frame.durationMs }
          : version),
        activeMediaVersionId: activeVersionId,
      } : candidate),
    }));
    inform(`已将 ${(frame.timeMs / 1000).toFixed(2)} 秒处设为实际展示静态图。`, "success");
  }

  function approveTransition(transitionId: string, throwOnFailure = false) {
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    if (!transition) return;
    try {
      const approvalPreview = approveProjectTransition(project, transitionId);
      updateProject((current) => approveProjectTransition(current, transitionId).project);
      inform(approvalPreview.kind === "source-frame"
        ? `已批准“${transition.label}”，播放结束后回到原实际静态帧。`
        : approvalPreview.createdVariant
          ? `已为“${approvalPreview.targetLabel}”新增实际展示变体 ${approvalPreview.previousVariantCount + 1}。`
          : `已批准“${transition.label}”，播放结束后平滑回到“${approvalPreview.targetLabel}”权威图。`, "success");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "过渡批准失败";
      inform(message, "error");
      if (throwOnFailure) throw new Error(message);
    }
  }

  function previewTransition(transitionId: string) {
    const transition = project.transitions.find((candidate) => candidate.id === transitionId);
    const sourceVariant = project.variants.find((variant) => variant.id === transition?.fromVariantId);
    const source = project.artifacts.find((artifact) => artifact.id === sourceVariant?.imageArtifactId);
    const video = project.artifacts.find((artifact) => artifact.id === transition?.videoArtifactId);
    const sourceArtifactId = project.variants.find((variant) => variant.id === transition?.fromVariantId)?.imageArtifactId;
    const targetArtifactId = transition?.endFrameSource === "authority-reference"
      ? transition.targetDraftArtifactId
      : transition?.endFrameSource === "source-frame"
        ? sourceArtifactId
        : transition?.extractedTailArtifactId;
    const target = project.artifacts.find((artifact) => artifact.id === targetArtifactId);
    if (!transition || !source || !video || !target) {
      inform("过渡预览需要起始实际图、已生成视频和结束图。", "error");
      return;
    }
    setPreviewTransitionId(transitionId);
    setNotice("正在预览起始静态图、无声视频和结束静态图的连续性");
  }

  function closeTransitionPreview() {
    setPreviewTransitionId(null);
    setNotice("过渡预览已关闭");
  }

  async function saveProjectReferences(request: ProjectReferenceRequest) {
    if (busy) throw new Error("请等待当前操作完成。");
    const projectId = project.id;
    setBusy(true);
    try {
      let change;
      if (request.kind === "upload") {
        if (!request.files.length || request.files.some(file => !file.type.startsWith("image/"))) throw new Error("请选择至少一张图片文件。");
        const additions: Artifact[] = await Promise.all(request.files.map(async file => {
          const stored = await importImageFile(file);
          return { id: `artifact-reference-${crypto.randomUUID()}`, kind: "identity-reference", uri: stored.uri, mimeType: stored.mimeType, createdAt: now(), provenance: "user-upload", label: file.name };
        }));
        change = { kind: "upload" as const, artifacts: additions };
      } else change = request;
      if (designProjectRef.current.id !== projectId) throw new Error("项目已切换，请在目标项目中重新配置参考图。");
      await workspace.persistProjectChange(current => {
        if (current.id !== projectId) throw new Error("项目已切换，请重新配置参考图。");
        return applyProjectReferenceChange(current, workspace.identities, change);
      });
      inform("项目角色参考图配置已保存。", "success");
    } finally { setBusy(false); }
  }

  async function uploadReferences(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const additions: Artifact[] = await Promise.all(Array.from(files).map(async (file) => {
        if (!file.type.startsWith("image/")) throw new Error("当前版本先支持实拍图片；视频身份素材将在媒体上传接口完成后开放。");
        const stored = await importImageFile(file);
        return {
          id: `artifact-reference-${crypto.randomUUID()}`,
          kind: "identity-reference" as const,
          uri: stored.uri,
          mimeType: stored.mimeType,
          createdAt: now(),
          provenance: "user-upload",
          label: file.name,
        };
      }));
      const identity = workspace.activeIdentity;
      if (!identity) throw new Error("请先创建一个全局宠物形象。");
      const existingReferenceUris = identity.referenceArtifacts.map((artifact) => artifact.uri);
      const autoColor = await calculateAutoChromaColor([...existingReferenceUris, ...additions.map((artifact) => artifact.uri)]);
      workspace.updateIdentity(identity.id, (current) => ({
        ...current,
        referenceArtifacts: [...current.referenceArtifacts, ...additions],
      }));
      if (project.identityProfileId === identity.id) {
        updateProject((current) => ({
          ...current,
          videoBackground: { ...current.videoBackground, autoColor, analyzedAt: now() },
        }));
      }
      inform(`已向全局形象“${identity.name}”加入 ${additions.length} 个实拍素材，并将自动抠图底色更新为 ${autoColor}。`, "success");
    } catch (error) {
      inform(error instanceof Error ? error.message : "参考素材上传失败", "error");
    } finally {
      setBusy(false);
    }
  }

  function navigateToJob(job: PersistentGenerationJob) {
    setTaskCenterOpen(false);
    if (job.trigger.projectId.startsWith("style-lab:")) {
      setActiveArea("style");
      setNotice(`已定位到“${job.trigger.label}”的风格实验。`);
      return;
    }
    if (job.trigger.projectId !== project.id && !workspace.activateProject(job.trigger.projectId)) {
      inform("任务所属项目不存在或已损坏。", "error");
      return;
    }
    setActiveArea("graph");
    setSelection({ kind: job.trigger.entityType === "pointer-gaze" ? "state" : job.trigger.entityType, id: job.trigger.entityId });
    setNotice(`已定位到“${job.trigger.label}”的触发位置`);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    void setTheme(next).catch(() => inform("主题保存失败，请重试。", "error"));
  }

  const previewTransitionData = project.transitions.find((transition) => transition.id === previewTransitionId);
  const previewSourceVariant = project.variants.find((variant) => variant.id === previewTransitionData?.fromVariantId);
  const previewSourceArtifact = previewSourceVariant ? artifacts.get(previewSourceVariant.imageArtifactId) : undefined;
  const previewVideoArtifact = previewTransitionData?.videoArtifactId ? artifacts.get(previewTransitionData.videoArtifactId) : undefined;
  const previewUsesVideoFrame = previewTransitionData?.endFrameSource === "video-frame";
  const previewTargetArtifactId = previewTransitionData?.endFrameSource === "source-frame"
    ? previewSourceVariant?.imageArtifactId
    : previewUsesVideoFrame
      ? previewTransitionData?.extractedTailArtifactId
      : previewTransitionData?.targetDraftArtifactId;
  const previewTargetArtifact = previewTargetArtifactId ? artifacts.get(previewTargetArtifactId) : undefined;
  const transitionPreview = previewTransitionData && previewSourceArtifact && previewVideoArtifact && previewTargetArtifact
    ? {
        id: previewTransitionData.id,
        label: previewTransitionData.label,
        sourceUri: previewSourceArtifact.uri,
      sourceNativePixel: previewSourceArtifact.nativePixel,
      targetNativePixel: previewTargetArtifact.nativePixel,
        videoUri: previewVideoArtifact.uri,
        targetUri: previewTargetArtifact.uri,
        targetMode: previewTransitionData.endFrameSource,
        stopAtMs: previewUsesVideoFrame
          ? previewTransitionData.selectedEndMs ?? previewTransitionData.sourceVideoDurationMs ?? previewTransitionData.durationMs
          : previewTransitionData.sourceVideoDurationMs ?? previewTransitionData.durationMs,
        transparentVideo: previewVideoArtifact.hasAlpha ?? false,
        authorityBridge: previewTransitionData.authorityBridge,
        entryBlendMs: previewTransitionData.entryBlendMs,
        playback: previewTransitionData.playback,
        pixelSize: previewVideoArtifact.pixelWidth,
        pixelated: project.runtimePresentation?.pixelated,
        pixelGridSize: project.runtimePresentation?.defaultPixelGridSize,
        pixelArtProfileKey: project.id,
      }
    : null;
  const previewing = Boolean(transitionPreview);

  return {
    runDesignCommand, drawingPending, designBusy,
    project: resolvedProject, exportSourceProject, projects: workspace.projects, identities: workspace.identities, activeIdentity: workspace.activeIdentity, workspaceStorageError: workspace.storageError, pendingProjectChangeError: workspace.pendingProjectChangeError, retryPendingProjectChanges: workspace.retryPendingProjectChanges, workspaceStorageConflict: workspace.storageConflict, reloadWorkspace: workspace.reloadWorkspace, saveWorkspaceConflictCopy: workspace.saveConflictCopy, persistProject: workspace.persistProject,
    activeArea, previewSessionRevision, selection, mobileInspectorOpen, busy, previewing, theme, notice, apiConfigured, generationProviders, videoBackgroundSettings, customerReview, graphLayoutRevision, appearance, styleLibrary, templateLibrary,
    taskCenterOpen, referenceInput, projectJobs, activeJobs, allJobs, allActiveJobs, artifacts, transitionPreview,
    setActiveArea, setSelection, setMobileInspectorOpen, setTaskCenterOpen, updateProject, moveState, autoArrangeStates, updateGenerationSettings,
    activateCustomerProject, createCustomerProject, createIdentityProfile, activateIdentityProfile, updateIdentityProfile, updateOrder, setTodoPluginIncluded, setAgentActivityPluginIncluded,
    addState, addIdleTransition, connectStates, updateStateDefinition, updateIdleScheduler, updatePointerGaze, updateDragInteraction, activatePointerGazeVideo, generatePointerGazeVideo, updateIdleRule, updateTransitionPrompt, updateTransitionDuration, updateTransitionTransparency, updateTransitionTransparencyProcessing, updateTransitionPlayback, createPingPongTransitionVersion, transparentizeExistingTransition, activateTransitionMediaVersion, updateTransitionEndFrameSource, updateTransitionAuthorityBridge, updateTransitionTriggers,
    updateImageCandidateCount,
    generateStateImage, uploadStateImage, activateStateReference, setInitialStateFromReference, setPreferredOutboundVariant, generateTargetDraft, generateTransition, uploadTransitionVideo,
    selectTransitionFrame, approveTransition, previewTransition, closeTransitionPreview, uploadReferences, saveProjectReferences, navigateToJob, toggleTheme,
  };
}

export type StudioController = ReturnType<typeof useStudioController>;
