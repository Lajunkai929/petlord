import { Button, Popover, Tag, Tooltip, Checkbox } from "@petlord/ui";
import { Check, CheckCircle, Code, Database, Play, PuzzlePiece, Robot, ShieldCheck } from "@phosphor-icons/react";
import type { AgentEventSource, PluginPermission } from "@petlord/schema";
import { useAgentPluginStudio } from "../hooks/useAgentPluginStudio";
import type { StudioController } from "../hooks/useStudioController";

const permissionLabels: Record<PluginPermission, string> = {
  "pet:read": "读取宠物状态",
  "pet:control": "触发语义动作",
  storage: "保存插件数据",
  "ui:panel": "显示插件面板",
  "ui:context-menu": "添加右键菜单",
  notifications: "显示任务提醒",
  "background:events": "后台接收事件",
  "integration:claude:events": "接收 Claude 事件",
  "integration:claude:open-session": "打开 Claude 会话",
  "integration:codex:events": "接收 Codex 事件",
  "integration:codex:open-session": "打开 Codex 会话",
};

function PluginToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return <Checkbox className={checked ? "is-active" : ""} checked={checked} onChange={(event) => onChange(event.target.checked)}><span>{checked ? "已加入" : "加入项目"}</span></Checkbox>;
}

function PermissionPopover({ permissions }: { permissions: PluginPermission[] }) {
  return <Popover placement="bottomRight" trigger="click" content={<div className="plugin-permission-popover">{permissions.map((permission) => <span key={permission}><CheckCircle size={13} weight="fill" />{permissionLabels[permission]}</span>)}</div>}><Button size="small" icon={<ShieldCheck size={14} />}>{permissions.length} 项权限</Button></Popover>;
}

function sourceLabel(source: AgentEventSource) {
  return source === "claude" ? "Claude" : "Codex";
}

export function PluginWorkspace({ studio }: { studio: StudioController }) {
  const agentStudio = useAgentPluginStudio();
  const todo = studio.project.plugins.find((plugin) => plugin.id === "petlord.todo");
  const agent = studio.project.plugins.find((plugin) => plugin.id === "petlord.agent-activity");

  return (
    <main className="page-workspace plugin-workspace">
      <header className="page-heading compact-page-heading"><span>扩展</span><h1>插件</h1></header>
      <div className="plugin-v1-grid">
        <section className="plugin-v1-card is-agent">
          <header><div className="plugin-v1-icon"><Robot size={22} weight="duotone" /></div><div><h2>Agent Activity</h2><p>Claude Code + Codex</p></div><PluginToggle checked={Boolean(agent)} onChange={studio.setAgentActivityPluginIncluded} /></header>
          <div className="plugin-v1-summary"><span><i /><strong>后台事件</strong></span><span><i /><strong>宠物反应</strong></span><span><i /><strong>点击回会话</strong></span></div>
          <div className="plugin-v1-actions">
            <PermissionPopover permissions={agent?.permissions ?? ["pet:read", "pet:control", "ui:panel", "ui:context-menu", "notifications", "background:events", "integration:claude:events", "integration:claude:open-session", "integration:codex:events", "integration:codex:open-session"]} />
            <span />
            {(["claude", "codex"] as const).map((source) => <Tooltip title={`写入一条真实的 ${sourceLabel(source)} 完成事件`} key={source}><Button size="small" loading={agentStudio.sending === source} icon={<Play size={13} weight="fill" />} onClick={() => { void agentStudio.simulate(source); }}>测试 {sourceLabel(source)}</Button></Tooltip>)}
          </div>
          <div className="plugin-event-preview">
            <header><strong>事件通道</strong><Tag color={agentStudio.error ? "error" : "success"}>{agentStudio.error ? "服务异常" : "SQLite 已连接"}</Tag></header>
            {agentStudio.events.length === 0 ? <p>发送一条测试事件验证连接。</p> : agentStudio.events.slice(0, 4).map((event) => <article className={event.acknowledgedAt ? "is-read" : ""} key={event.id}><i data-source={event.source}>{event.source === "claude" ? "C" : "X"}</i><span><strong>{event.title}</strong><small>{sourceLabel(event.source)} · {event.type}</small></span>{event.acknowledgedAt ? <Check size={14} /> : <Button type="default" htmlType="button" onClick={() => { void agentStudio.acknowledge(event.id); }} aria-label="标为已读"><Check size={13} /></Button>}</article>)}
          </div>
        </section>

        <section className="plugin-v1-card">
          <header><div className="plugin-v1-icon"><PuzzlePiece size={22} weight="duotone" /></div><div><h2>To Do</h2><p>官方基础示例</p></div><PluginToggle checked={Boolean(todo)} onChange={studio.setTodoPluginIncluded} /></header>
          <div className="plugin-v1-summary is-two"><span><Database size={15} /><strong>SQLite 数据</strong></span><span><CheckCircle size={15} /><strong>完成反馈</strong></span></div>
          <div className="plugin-v1-actions"><PermissionPopover permissions={todo?.permissions ?? ["pet:read", "pet:control", "storage", "ui:panel", "notifications"]} /><span /></div>
          <div className="plugin-sdk-mini"><Code size={16} /><span><strong>SDK 示例</strong><small>导入后授权，停用不会删除数据。</small></span><code>context.pet.perform(&quot;play&quot;)</code></div>
        </section>
      </div>
    </main>
  );
}
