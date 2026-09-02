import {
  CheckCircle,
  ChatCenteredText,
  DownloadSimple,
  FileArrowUp,
  Hourglass,
  NotePencil,
  PaperPlaneTilt,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { CharacterProject, CustomerReviewRound } from "@petlord/schema";
import type { CustomerReviewController } from "../hooks/useCustomerReview";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";

const statusLabel = {
  draft: "草稿",
  exported: "等待反馈",
  responded: "已收到反馈",
} as const;

function roundStats(round: CustomerReviewRound) {
  return {
    approved: round.items.filter((item) => item.decision === "approved").length,
    changes: round.items.filter((item) => item.decision === "changes").length,
    pending: round.items.filter((item) => item.decision === "pending").length,
  };
}

export function ReviewWorkspace({ project, controller }: { project: CharacterProject; controller: CustomerReviewController }) {
  const latest = controller.rounds[0];
  const latestStats = latest ? roundStats(latest) : undefined;
  return (
    <main className="page-workspace review-workspace">
      <header className="review-page-heading">
        <div><span>评审</span><h1>逐项确认图片和动画。</h1><p>导出离线评审页，再导入反馈 JSON。</p></div>
        <div><button className="secondary-button" type="button" onClick={controller.chooseResponseFile}><FileArrowUp size={15} />导入反馈</button><button className="primary-button" type="button" disabled={Boolean(controller.exportingRoundId)} onClick={controller.createAndExportRound}>{controller.exportingRoundId ? <SpinnerGap className="spin" size={15} /> : <PaperPlaneTilt size={15} weight="fill" />}{controller.exportingRoundId ? `正在打包 ${controller.progress.completed}/${controller.progress.total}` : "新建评审"}</button></div>
      </header>
      <input ref={controller.responseInput} hidden type="file" accept="application/json,.json" onChange={controller.onResponseSelected} />
      {controller.error && <p className="review-error"><WarningCircle size={15} />{controller.error}</p>}

      <section className="review-summary-line"><span>评审 {controller.rounds.length} 轮</span><span>通过 {latestStats?.approved ?? 0}</span><span>需修改 {latestStats?.changes ?? 0}</span><span>修改记录 {project.order.revisionUsed}</span></section>

      {controller.rounds.length === 0 ? (
        <section className="review-empty"><ChatCenteredText size={34} weight="thin" /><h2>还没有评审记录</h2><p>准备好状态或动画后创建第一轮评审。</p><button className="primary-button" type="button" onClick={controller.createAndExportRound}>新建评审</button></section>
      ) : (
        <section className="review-rounds">
          <div className="section-title"><h2>评审历史</h2><span>{controller.rounds.length} 轮</span></div>
          {controller.rounds.map((round) => {
            const stats = roundStats(round);
            return (
              <article className={`review-round is-${round.status}`} key={round.id}>
                <header><div><em>第 {round.sequence} 轮</em><h3>{statusLabel[round.status]}</h3><small>{new Date(round.createdAt).toLocaleString("zh-CN")}</small></div><div className="review-round-stats"><span><CheckCircle size={13} />通过 {stats.approved}</span><span><NotePencil size={13} />修改 {stats.changes}</span><span><Hourglass size={13} />待定 {stats.pending}</span><button type="button" disabled={controller.exportingRoundId === round.id} onClick={() => controller.exportRound(round)}>{controller.exportingRoundId === round.id ? <SpinnerGap className="spin" size={13} /> : <DownloadSimple size={13} />}{round.status === "responded" ? "导出存档页" : "再次导出"}</button></div></header>
                <PreviewableImageGroup><div className="review-item-grid">{round.items.map((item) => {
                  const artifact = project.artifacts.find((candidate) => candidate.id === item.mediaArtifactId);
                  return (
                    <article className={`is-${item.decision}`} key={item.id}>
                      <div className="review-item-media checkerboard">{artifact && (item.mediaKind === "video" ? <video src={artifact.uri} muted playsInline controls /> : <PreviewableImage src={artifact.uri} alt={item.label} />)}</div>
                      <span><strong>{item.label}</strong><small>{item.decision === "approved" ? "已通过" : item.decision === "changes" ? "需要修改" : "等待确认"}</small>{item.comment && <p>{item.comment}</p>}</span>
                    </article>
                  );
                })}</div></PreviewableImageGroup>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
