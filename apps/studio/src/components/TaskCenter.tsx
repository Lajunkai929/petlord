import { Button } from "@petlord/ui";
import { ArrowSquareOut, CheckCircle, Clock, Queue, SpinnerGap, WarningCircle, X } from "@phosphor-icons/react";
import type { PersistentGenerationJob } from "@petlord/generation";

interface TaskCenterProps {
  open: boolean;
  jobs: PersistentGenerationJob[];
  onClose: () => void;
  onNavigate: (job: PersistentGenerationJob) => void;
}

const statusText = {
  queued: "排队中",
  submitting: "正在提交",
  running: "生成中",
  succeeded: "已完成",
  failed: "失败",
} as const;

function JobIcon({ status }: { status: PersistentGenerationJob["status"] }) {
  if (status === "succeeded") return <CheckCircle size={20} weight="fill" />;
  if (status === "failed") return <WarningCircle size={20} weight="fill" />;
  if (status === "running" || status === "submitting") return <SpinnerGap className="spin" size={20} />;
  return <Clock size={20} weight="fill" />;
}

function visibleStatus(job: PersistentGenerationJob, jobs: PersistentGenerationJob[]) {
  if (job.status !== "queued") return statusText[job.status];
  const ahead = jobs.filter((candidate) => ["queued", "submitting", "running"].includes(candidate.status) && candidate.createdAt < job.createdAt).length;
  return ahead > 0 ? `排队中 · 前方 ${ahead} 项` : "排队中";
}

export function TaskCenter({ open, jobs, onClose, onNavigate }: TaskCenterProps) {
  if (!open) return null;
  return (
    <div className="task-center-backdrop" role="presentation" onMouseDown={onClose}>
      <aside className="task-center" role="dialog" aria-modal="true" aria-label="生成任务中心" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div><Queue size={20} weight="fill" /><span>任务中心</span><b>{jobs.length}</b></div>
          <Button type="text" htmlType="button" className="icon-button" onClick={onClose} aria-label="关闭任务中心"><X size={18} /></Button>
        </header>
        <div className="task-center-list">
          {jobs.length === 0 ? (
            <div className="task-center-empty"><Queue size={28} weight="thin" /><strong>暂无生成任务</strong></div>
          ) : jobs.map((job) => (
            <button className={`task-card is-${job.status}`} type="button" key={job.id} onClick={() => onNavigate(job)}>
              <span className="task-card-icon"><JobIcon status={job.status} /></span>
              <span className="task-card-body">
                <span className="task-card-title"><strong>{job.trigger.label}</strong><em>{visibleStatus(job, jobs)}</em></span>
                <span className="task-card-meta">{job.trigger.projectId.startsWith("style-lab:") ? "风格实验" : job.kind === "state-image" ? "状态参考图" : job.trigger.entityType === "pointer-gaze" ? "注视视频" : "转换视频"} · {job.model}</span>
                {job.cost && <span className="task-card-cost">{job.cost.status === "settled" && job.cost.actualCny !== undefined ? `已结算 ¥${job.cost.actualCny.toFixed(2)}` : `预计 ¥${job.cost.estimatedMinCny.toFixed(2)}–¥${job.cost.estimatedMaxCny.toFixed(2)}`}</span>}
                <span className="task-progress"><i style={{ transform: `scaleX(${job.progress / 100})` }} /></span>
                {job.error && <span className="task-error">{job.error}</span>}
              </span>
              <ArrowSquareOut size={16} />
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
}
