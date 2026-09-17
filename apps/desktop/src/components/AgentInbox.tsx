import { Button } from "@petlord/ui";
import { ArrowSquareOut, Check, Code, Robot, X } from "@phosphor-icons/react";
import type { AgentEvent, AgentEventSource } from "@petlord/schema";

function timeLabel(value: string) {
  return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function sourceLabel(source: AgentEventSource) {
  return source === "claude" ? "Claude" : "Codex";
}

export function AgentInbox({
  events,
  onClose,
  onOpen,
  onAcknowledge,
  onSimulate,
}: {
  events: AgentEvent[];
  onClose: () => void;
  onOpen: (id: string) => void;
  onAcknowledge: (id: string) => void;
  onSimulate: (source: AgentEventSource) => void;
}) {
  return (
    <aside className="agent-inbox">
      <header><div><Robot size={17} weight="fill" /><span><strong>Agent 收件箱</strong><small>{events.filter((event) => !event.acknowledgedAt).length} 条未读</small></span></div><Button type="text" size="small" icon={<X size={15} />} htmlType="button" onClick={onClose} aria-label="关闭 Agent 收件箱" /></header>
      <div className="agent-inbox-list">
        {events.length === 0 ? <div className="agent-inbox-empty"><Code size={25} /><span>还没有任务通知</span><small>可先发送一条测试事件。</small></div> : events.map((event) => (
          <article className={event.acknowledgedAt ? "is-read" : ""} key={event.id}>
            <i data-source={event.source}>{event.source === "claude" ? "C" : "X"}</i>
            <span><strong>{event.title}</strong><small>{sourceLabel(event.source)} · {timeLabel(event.receivedAt)}</small>{event.summary && <p>{event.summary}</p>}</span>
            <div><Button type="default" size="small" icon={<ArrowSquareOut size={13} />} htmlType="button" onClick={() => onOpen(event.id)}>打开</Button>{!event.acknowledgedAt && <Button type="text" size="small" icon={<Check size={13} />} htmlType="button" onClick={() => onAcknowledge(event.id)} aria-label="标为已读" />}</div>
          </article>
        ))}
      </div>
      <footer><span>发送测试</span><Button type="default" size="small" htmlType="button" onClick={() => onSimulate("claude")}>Claude</Button><Button type="default" size="small" htmlType="button" onClick={() => onSimulate("codex")}>Codex</Button></footer>
    </aside>
  );
}
