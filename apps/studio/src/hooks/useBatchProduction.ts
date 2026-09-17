import { useMemo, useState } from "react";
import { estimateImageGenerationCost, estimateVideoGenerationCost, type CostEstimate, type GenerationProvidersSnapshot } from "@petlord/generation";
import type { CharacterProject } from "@petlord/schema";
import { resolveTransitionSourceArtifact } from "@petlord/state-engine";
import { providerModelSelection } from "./providerModelSelection";
import { summarizeGenerationBudget } from "../orderOperations";

export type BatchAction = "generate-state" | "generate-transition" | "transparentize" | "approve";

export interface BatchProductionItem {
  key: string;
  action: BatchAction;
  entityId: string;
  label: string;
  detail: string;
  cost: CostEstimate | null;
  unknownPrice: boolean;
}

interface BatchActions {
  generateState: (stateId: string) => Promise<void>;
  generateTransition: (transitionId: string) => Promise<void>;
  transparentize: (transitionId: string) => Promise<void>;
  approve: (transitionId: string) => void;
}

export function buildBatchProductionItems(project: CharacterProject, snapshot?: GenerationProvidersSnapshot | null): BatchProductionItem[] {
  const hasIdentityReferences = project.referenceArtifactIds.some((id) => project.artifacts.some((artifact) => artifact.id === id));
  const stateCost = estimateImageGenerationCost(project.generationSettings.imageModel, project.generationSettings.imageCandidateCount, providerModelSelection(snapshot, "image", project.generationSettings.imageProviderId));
  const stateItems: BatchProductionItem[] = hasIdentityReferences ? project.logicalStates.filter((state) => !state.referenceArtifactId).map((state) => ({
    key: `generate-state:${state.id}`,
    action: "generate-state",
    entityId: state.id,
    label: state.label,
    detail: `生成 ${project.generationSettings.imageCandidateCount} 张权威参考候选`,
    cost: stateCost,
    unknownPrice: stateCost === null,
  })) : [];
  const transitionItems: BatchProductionItem[] = [];
  for (const transition of project.transitions) {
    const video = project.artifacts.find((artifact) => artifact.id === transition.videoArtifactId);
    if (!transition.videoArtifactId && transition.targetDraftArtifactId && resolveTransitionSourceArtifact(project, transition.id)) {
      const cost = estimateVideoGenerationCost({
        model: project.generationSettings.videoModel,
        models: providerModelSelection(snapshot, "video", project.generationSettings.videoProviderId),
        resolution: project.generationSettings.videoResolution,
        durationMode: transition.durationMode,
        durationSeconds: transition.durationSeconds,
      });
      transitionItems.push({
        key: `generate-transition:${transition.id}`,
        action: "generate-transition",
        entityId: transition.id,
        label: transition.label,
        detail: transition.durationMode === "smart" ? "生成透明过渡视频 · 智能时长" : `生成透明过渡视频 · ${transition.durationSeconds ?? 4} 秒`,
        cost,
        unknownPrice: cost === null,
      });
      continue;
    }
    if (transition.videoArtifactId && video?.hasAlpha !== true) {
      transitionItems.push({
        key: `transparentize:${transition.id}`,
        action: "transparentize",
        entityId: transition.id,
        label: transition.label,
        detail: "Apple Vision 本机抠图 · 保留普通原视频",
        cost: null,
        unknownPrice: false,
      });
      continue;
    }
    if (transition.status === "review" && transition.videoArtifactId && (transition.extractedTailArtifactId || transition.endFrameSource === "authority-reference")) {
      transitionItems.push({
        key: `approve:${transition.id}`,
        action: "approve",
        entityId: transition.id,
        label: transition.label,
        detail: "批准当前视频与选帧 · 必须已人工预览",
        cost: null,
        unknownPrice: false,
      });
    }
  }
  return [...stateItems, ...transitionItems];
}

export function useBatchProduction(project: CharacterProject, actions: BatchActions, snapshot?: GenerationProvidersSnapshot | null) {
  const [open, setOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [message, setMessage] = useState("");
  const items = useMemo(() => buildBatchProductionItems(project, snapshot), [project, snapshot]);

  const selected = items.filter((item) => selectedKeys.includes(item.key));
  const cost = selected.reduce((sum, item) => ({
    minimumCny: sum.minimumCny + (item.cost?.minimumCny ?? 0),
    maximumCny: sum.maximumCny + (item.cost?.maximumCny ?? 0),
  }), { minimumCny: 0, maximumCny: 0 });
  const unknownPrice = selected.some(item => item.unknownPrice);
  const budget = summarizeGenerationBudget(project);
  const budgetExceeded = cost.maximumCny > budget.remainingCny + 1e-9;

  function toggle(key: string) {
    setSelectedKeys((current) => current.includes(key) ? current.filter((candidate) => candidate !== key) : [...current, key]);
  }

  function selectAction(action: BatchAction) {
    const keys = items.filter((item) => item.action === action).map((item) => item.key);
    setSelectedKeys((current) => keys.every((key) => current.includes(key))
      ? current.filter((key) => !keys.includes(key))
      : [...new Set([...current, ...keys])]);
  }

  async function execute() {
    if (running || selected.length === 0) return;
    if (unknownPrice) {
      setMessage("所选生成任务费用待配置，请在模型服务中补充模型预估费用。");
      return;
    }
    if (budgetExceeded) {
      setMessage(`预算保护已阻止执行：所选任务最高 ¥${cost.maximumCny.toFixed(2)}，剩余额度 ¥${budget.remainingCny.toFixed(2)}。`);
      return;
    }
    setRunning(true);
    setProgress({ completed: 0, total: selected.length });
    setMessage("");
    for (let index = 0; index < selected.length; index += 1) {
      const item = selected[index];
      if (item.action === "generate-state") await actions.generateState(item.entityId);
      if (item.action === "generate-transition") await actions.generateTransition(item.entityId);
      if (item.action === "transparentize") await actions.transparentize(item.entityId);
      if (item.action === "approve") actions.approve(item.entityId);
      setProgress({ completed: index + 1, total: selected.length });
    }
    setMessage(`已处理 ${selected.length} 项；生成任务会继续在任务中心运行。`);
    setSelectedKeys([]);
    setRunning(false);
  }

  return { open, setOpen, items, selectedKeys, selected, cost, unknownPrice, budget, budgetExceeded, running, progress, message, toggle, selectAction, execute };
}

export type BatchProductionController = ReturnType<typeof useBatchProduction>;
