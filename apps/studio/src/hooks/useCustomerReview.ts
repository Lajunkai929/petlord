import { useRef, useState, type ChangeEvent } from "react";
import type { CharacterProject, CustomerReviewRound } from "@petlord/schema";

function downloadText(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function useCustomerReview(
  project: CharacterProject,
  updateProject: (updater: (current: CharacterProject) => CharacterProject) => void,
  inform: (message: string, kind?: "success" | "error" | "info") => void,
) {
  const responseInput = useRef<HTMLInputElement>(null);
  const [exportingRoundId, setExportingRoundId] = useState<string>();
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState("");

  async function exportRound(round: CustomerReviewRound, saveAsNew: boolean) {
    if (exportingRoundId) return;
    setExportingRoundId(round.id);
    setProgress({ completed: 0, total: round.items.length });
    setError("");
    try {
      const { buildCustomerReviewHtml } = await import("../customerReview");
      const html = await buildCustomerReviewHtml(project, round, (completed, total) => setProgress({ completed, total }));
      downloadText(html, `${project.characterName}-review-round-${round.sequence}.html`, "text/html;charset=utf-8");
      const exportedAt = new Date().toISOString();
      updateProject((current) => ({
        ...current,
        order: {
          ...current.order,
          status: saveAsNew ? "review" : current.order.status,
          reviewRounds: saveAsNew
            ? [{ ...round, status: "exported", exportedAt }, ...current.order.reviewRounds]
            : current.order.reviewRounds.map((candidate) => candidate.id === round.id ? { ...candidate, status: candidate.status === "responded" ? "responded" : "exported", exportedAt } : candidate),
        },
      }));
      inform(`第 ${round.sequence} 轮客户审稿页已导出。`, "success");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "客户审稿页导出失败";
      setError(message);
      inform(message, "error");
    } finally {
      setExportingRoundId(undefined);
    }
  }

  async function createAndExportRound() {
    try {
      const { createCustomerReviewRound } = await import("../customerReview");
      await exportRound(createCustomerReviewRound(project), true);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "无法创建审稿轮次";
      setError(message);
      inform(message, "error");
    }
  }

  async function onResponseSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const { applyCustomerReviewResponse, parseCustomerReviewResponse } = await import("../customerReview");
      const response = parseCustomerReviewResponse(await file.text());
      const updated = applyCustomerReviewResponse(project, response);
      updateProject(() => updated);
      const changes = response.items.filter((item) => item.decision === "changes").length;
      inform(changes > 0 ? `已导入客户反馈：${changes} 项需要修改。` : "客户已全部通过，订单进入待交付。", "success");
      setError("");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "客户反馈文件导入失败";
      setError(message);
      inform(message, "error");
    }
  }

  return {
    rounds: project.order.reviewRounds.slice().sort((left, right) => right.sequence - left.sequence),
    responseInput,
    exportingRoundId,
    progress,
    error,
    createAndExportRound,
    exportRound: (round: CustomerReviewRound) => exportRound(round, false),
    chooseResponseFile: () => responseInput.current?.click(),
    onResponseSelected,
  };
}

export type CustomerReviewController = ReturnType<typeof useCustomerReview>;
