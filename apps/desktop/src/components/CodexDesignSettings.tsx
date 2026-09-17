import { Button } from "@petlord/ui";
import { useCallback, useEffect, useState } from "react";
import { ArrowClockwise, Bell, Check, Copy, Plug, SpinnerGap } from "@phosphor-icons/react";
import type { CodexDesignStatus } from "../desktopBridge";
import type { CodexNotificationsBridge, CodexNotificationStatus } from "../codexNotificationTypes";
import "./CodexDesignSettings.css";

const starterPrompt = "请使用 PetLord Design 工具查看我的本地项目。先检查当前宠物的画布、调色板、状态与动画，再按我的要求编辑每一帧。请保持角色轮廓一致，预览修改结果，验证后安装到我的桌面。";

export function CodexDesignSettings() {
  const [status, setStatus] = useState<CodexDesignStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true); setError("");
    try { setStatus(await window.petLordDesktop?.getCodexDesignStatus()); }
    catch { setError("无法读取 Codex 连接配置。请确认 Codex 已安装，再刷新重试。"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  async function connect() {
    setBusy(true); setError("");
    try { setStatus(await window.petLordDesktop?.connectCodexDesign()); }
    catch (caught) { setError(`接入失败：${caught instanceof Error ? caught.message : "请刷新重试。"}`); }
    finally { setBusy(false); }
  }
  const detail = status?.conflict ? "Codex 已有同名的其他连接或自定义配置。请先在 Codex 的 MCP 设置中检查 petlord-design。"
    : status?.disabled ? "PetLord Design 已配置，但在 Codex 中被停用。请在 Codex 的 MCP 设置中启用 petlord-design，然后刷新。"
    : status?.restricted ? "PetLord Design 使用了自定义连接参数或工具范围。请在 Codex 的 MCP 设置中检查 petlord-design，确认需要的创作工具已启用。"
    : status?.connected ? "连接已保存。重启 Codex 的 MCP 连接或重新启动 Codex，即可在新任务中使用。"
    : status && !status.available ? "未找到 Codex。安装并打开 Codex 后，点击刷新。"
    : "接入后，Codex 可以读取本地项目、绘制像素帧、调整动画并安装宠物。";
  return <section className="settings-view settings-agent-view">
    <header><div><h1>接入 Agent</h1><p>让你正在使用的 Codex 直接参与宠物创作。</p></div><Button type="default" className="settings-secondary-action" htmlType="button" disabled={busy} onClick={() => { void refresh(); }} aria-label="刷新 Codex 连接"><ArrowClockwise size={17} /></Button></header>
    <article className="codex-design-card">
      <div className="codex-design-title"><Plug size={28} weight="duotone" /><div><h2>Codex</h2><p>PetLord Design</p></div>{status?.connected && <span><Check size={14} />已接入</span>}</div>
      <p role="status">{detail}</p>
      {!status?.connected && <Button type="default" className="codex-connect-button" htmlType="button" disabled={busy || !status?.available || status.conflict || status.requiresManualAction} onClick={() => { void connect(); }}>{busy ? <SpinnerGap className="spin" size={17} /> : <Plug size={17} />}一键接入 Codex</Button>}
      <small>首次接入会备份并更新本机 Codex 连接配置。使用时请保持 PetLord 运行。</small>
    </article>
    <CodexNotificationSettings />
    {error && <div className="settings-inline-error" role="alert">{error}</div>}
    <div className="codex-start-guide"><h2>接好之后，直接告诉它你想画什么</h2><p>例如：“把 Lottery 的尾巴摆动改得慢一点，再加两帧眨眼。”</p><Button type="default" htmlType="button" className="settings-secondary-action" onClick={() => { void navigator.clipboard.writeText(starterPrompt).then(() => setCopied(true), () => setError("复制失败，请直接将上面的创作要求发送给 Codex。")); }}><Copy size={16} />{copied ? "已复制开始指令" : "复制给 Codex 的开始指令"}</Button></div>
  </section>;
}


function CodexNotificationSettings() {
  const [status, setStatus] = useState<CodexNotificationStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bridge = window.petLordDesktop as (typeof window.petLordDesktop & Partial<CodexNotificationsBridge>);
  const run = useCallback(async (operation: "refresh" | "install" | "test") => {
    setBusy(true); setError("");
    try {
      const api = window.petLordDesktop as (typeof window.petLordDesktop & Partial<CodexNotificationsBridge>);
      const method = operation === "refresh" ? api?.getCodexNotificationStatus : operation === "install" ? api?.installCodexNotifications : api?.testCodexNotifications;
      if (!method) throw new Error("请更新 PetLord 后配置任务提醒。");
      const next = await method(); setStatus(next);
      if (next.error) setError(next.error);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "任务提醒配置失败，请重试。"); }
    finally { setBusy(false); }
  }, []);
  useEffect(() => { void run("refresh"); }, [run]);
  const configured = status?.configured && status.helperReady;
  return <article className="codex-design-card">
    <div className="codex-design-title"><Bell size={28} weight="duotone" /><div><h2>任务提醒</h2><p>Codex → 桌面宠物</p></div><span>{status?.lastLiveEventAt ? "已收到真实任务" : configured ? "等待真实任务" : "尚未配置"}</span></div>
    <p>开始工作时持续刨坑，气泡显示公开小标题、可见进度或工具状态；完成、需要操作或中断时切换动作。</p>
    <p role="status">{!status?.available ? "请先安装并打开 Codex。" : configured ? "配置已写入。首次使用请在 Codex 的 /hooks 中审查并信任 PetLord hooks，再开始一个任务。" : "一键写入提醒 hooks，保留已有通知与其他 hooks。"}</p>
    <div className="codex-notification-actions">
      <Button type="primary" htmlType="button" loading={busy} disabled={!status?.available || !bridge?.installCodexNotifications} onClick={() => { void run("install"); }}>{configured ? "修复提醒配置" : "配置任务提醒"}</Button>
      <Button type="default" htmlType="button" disabled={busy || !configured} onClick={() => { void run("test"); }}>发送自测提醒</Button>
      <Button type="default" htmlType="button" disabled={busy} aria-label="刷新任务提醒状态" onClick={() => { void run("refresh"); }}><ArrowClockwise size={17} /></Button>
    </div>
    {status?.lastTestAt && <small>自测已送达，仅验证 PetLord 提醒通路；真实 Codex 任务仍需通过 hooks 验证。</small>}
    <small>使用时保持 PetLord 运行。公开摘要只取小标题，缺失时使用可见进度或工具状态。</small>
    {error && <div className="settings-inline-error" role="alert">{error}</div>}
  </article>;
}
