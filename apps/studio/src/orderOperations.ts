import { estimateImageGenerationCost, estimateVideoGenerationCost } from "@petlord/generation";
import type { CharacterProject, CustomerOrder, DeliveryChecklist, GenerationJob } from "@petlord/schema";
import { buildPetPackage } from "@petlord/state-engine";

export interface OrderLedgerRow {
  id: string;
  label: string;
  category: "image" | "video" | "manual";
  status: "settled" | "reconciled" | "estimated" | "failed";
  amountCny: number;
  basis: string;
  createdAt: string;
}

export interface OrderEconomics {
  quotedCny: number;
  receivedCny: number;
  outstandingCny: number;
  generationSettledCny: number;
  generationPendingCny: number;
  failedEstimateCny: number;
  manualCostCny: number;
  actualCostCny: number;
  projectedCostCny: number;
  actualProfitCny: number;
  projectedProfitCny: number;
  projectedMarginRatio: number | null;
  ledger: OrderLedgerRow[];
}

export interface GenerationBudgetSummary {
  limitCny: number;
  committedCny: number;
  remainingCny: number;
  usageRatio: number;
}

function legacySettledCost(project: CharacterProject, job: GenerationJob) {
  if (job.status !== "succeeded") return undefined;
  if (job.kind === "state-draft") {
    const outputCount = Math.max(1, job.outputArtifactIds.length || project.artifacts.filter((artifact) => artifact.sourceJobId === job.id && artifact.kind === "state-draft").length);
    return estimateImageGenerationCost(job.model, outputCount)?.maximumCny;
  }
  if (job.kind === "transition") {
    const version = project.transitions.flatMap((transition) => transition.mediaVersions).find((candidate) => candidate.sourceJobId === job.id);
    if (!version) return undefined;
    return estimateVideoGenerationCost({
      model: job.model,
      resolution: project.generationSettings.videoResolution,
      durationMode: "fixed",
      durationSeconds: version.durationMs / 1000,
    })?.maximumCny;
  }
  return undefined;
}

function generationRow(project: CharacterProject, job: GenerationJob): OrderLedgerRow | undefined {
  const settled = job.cost?.actualCny ?? legacySettledCost(project, job);
  if (settled !== undefined) {
    return {
      id: job.id,
      label: job.prompt || (job.kind === "state-draft" ? "状态参考图" : "过渡视频"),
      category: job.kind === "state-draft" ? "image" : "video",
      status: job.cost?.source === "duration-reconciled" || !job.cost ? "reconciled" : "settled",
      amountCny: settled,
      basis: job.cost?.basis ?? "按已完成输出回算",
      createdAt: job.createdAt,
    };
  }
  if (!job.cost) return undefined;
  return {
    id: job.id,
    label: job.prompt || (job.kind === "state-draft" ? "状态参考图" : "过渡视频"),
    category: job.kind === "state-draft" ? "image" : "video",
    status: job.status === "failed" ? "failed" : "estimated",
    amountCny: job.cost.estimatedMaxCny,
    basis: job.cost.basis,
    createdAt: job.createdAt,
  };
}

export function summarizeOrderEconomics(project: CharacterProject): OrderEconomics {
  const generationRows = project.jobs.flatMap((job) => {
    const row = generationRow(project, job);
    const rows = row ? [row] : [];
    if (job.cost?.priorAttemptsReservedCny) rows.push({ id: `${job.id}-prior-attempts`, label: "此前失败尝试的费用预留", category: job.kind === "state-draft" ? "image" : "video", status: "failed", amountCny: job.cost.priorAttemptsReservedCny, basis: "此前尝试可能已被 Provider 计费，核实前继续保留预算。", createdAt: job.createdAt });
    return rows;
  });
  const manualRows: OrderLedgerRow[] = project.order.manualCosts.map((entry) => ({
    id: entry.id,
    label: entry.label,
    category: "manual",
    status: "settled",
    amountCny: entry.amountCny,
    basis: entry.note || ({ labor: "人工成本", tool: "工具成本", delivery: "交付成本", other: "其他成本" } as const)[entry.category],
    createdAt: entry.createdAt,
  }));
  const generationSettledCny = generationRows.filter((row) => row.status === "settled" || row.status === "reconciled").reduce((sum, row) => sum + row.amountCny, 0);
  const generationPendingCny = generationRows.filter((row) => row.status === "estimated").reduce((sum, row) => sum + row.amountCny, 0);
  const failedEstimateCny = generationRows.filter((row) => row.status === "failed").reduce((sum, row) => sum + row.amountCny, 0);
  const manualCostCny = manualRows.reduce((sum, row) => sum + row.amountCny, 0);
  const actualCostCny = generationSettledCny + manualCostCny;
  const projectedCostCny = actualCostCny + generationPendingCny;
  const quotedCny = project.order.quotedPriceCny;
  const receivedCny = project.order.depositCny + project.order.finalPaymentCny;
  return {
    quotedCny,
    receivedCny,
    outstandingCny: Math.max(0, quotedCny - receivedCny),
    generationSettledCny,
    generationPendingCny,
    failedEstimateCny,
    manualCostCny,
    actualCostCny,
    projectedCostCny,
    actualProfitCny: quotedCny - actualCostCny,
    projectedProfitCny: quotedCny - projectedCostCny,
    projectedMarginRatio: quotedCny > 0 ? (quotedCny - projectedCostCny) / quotedCny : null,
    ledger: [...generationRows, ...manualRows].sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

export function summarizeGenerationBudget(project: CharacterProject): GenerationBudgetSummary {
  const economics = summarizeOrderEconomics(project);
  const limitCny = project.generationBudgetCny;
  const committedCny = economics.generationSettledCny + economics.generationPendingCny + economics.failedEstimateCny;
  return {
    limitCny,
    committedCny,
    remainingCny: Math.max(0, limitCny - committedCny),
    usageRatio: Math.min(1, committedCny / Math.max(0.01, limitCny)),
  };
}

export function generationBudgetAllows(project: CharacterProject, requestedMaximumCny: number) {
  const budget = summarizeGenerationBudget(project);
  return {
    ...budget,
    requestedMaximumCny,
    allowed: Number.isFinite(requestedMaximumCny) && requestedMaximumCny >= 0 && budget.committedCny + requestedMaximumCny <= budget.limitCny + 1e-9,
  };
}

export type ManualDeliveryKey = Exclude<keyof DeliveryChecklist, "packageExportedAt">;

export interface DeliveryItem {
  id: string;
  label: string;
  detail: string;
  complete: boolean;
  manualKey?: ManualDeliveryKey;
}

function packageIsReady(project: CharacterProject) {
  try {
    buildPetPackage(project);
    return true;
  } catch {
    return false;
  }
}

export function buildOrderDeliveryItems(project: CharacterProject, economics = summarizeOrderEconomics(project)): DeliveryItem[] {
  const approvedTransitions = project.transitions.filter((transition) => transition.status === "approved").length;
  const transitionReady = project.transitions.length > 0 && approvedTransitions === project.transitions.length;
  return [
    { id: "identity", label: "客户实拍身份素材已归档", detail: `${project.referenceArtifactIds.length} 份素材`, complete: project.referenceArtifactIds.length > 0 },
    { id: "initial", label: "初始实际状态已确认", detail: "桌面宠物启动画面", complete: Boolean(project.initialVariantId) },
    { id: "animations", label: "全部过渡已批准", detail: `${approvedTransitions}/${project.transitions.length} 条动画`, complete: transitionReady },
    { id: "customer", label: "客户已确认终稿", detail: "手动确认审稿结果", complete: project.order.deliveryChecklist.customerApproved, manualKey: "customerApproved" },
    { id: "runtime", label: "桌面运行预览已验收", detail: "触发、透明边缘与连续性", complete: project.order.deliveryChecklist.desktopTested, manualKey: "desktopTested" },
    { id: "package", label: "可交付宠物包已导出", detail: packageIsReady(project) ? "发布检查通过" : "仍有发布阻塞项", complete: Boolean(project.order.deliveryChecklist.packageExportedAt) && packageIsReady(project) },
    { id: "payment", label: "尾款已收齐", detail: `已收 ¥${economics.receivedCny.toFixed(2)} / ¥${economics.quotedCny.toFixed(2)}`, complete: economics.quotedCny > 0 && economics.outstandingCny <= 0 },
    { id: "delivered", label: "安装包与宠物包已交付", detail: "手动确认客户已收到", complete: project.order.deliveryChecklist.packageDelivered, manualKey: "packageDelivered" },
  ];
}

export function deliveryProgress(project: CharacterProject) {
  const items = buildOrderDeliveryItems(project);
  return { completed: items.filter((item) => item.complete).length, total: items.length };
}

export function updateDeliveryChecklist(order: CustomerOrder, key: ManualDeliveryKey, complete: boolean): CustomerOrder {
  return { ...order, deliveryChecklist: { ...order.deliveryChecklist, [key]: complete } };
}
