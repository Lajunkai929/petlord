import { useRef, useState } from "react";
import { Alert, Button, Empty, Spin, Switch, Tag, DialogContent, Dialog } from "@petlord/ui";
import { ArrowClockwise, CheckCircle, ImageSquare, PencilSimple, PlugsConnected, Plus, Trash, VideoCamera, X } from "@phosphor-icons/react";

import type { GenerationProviderConfiguration } from "@petlord/generation";
import type { GenerationProvidersController } from "../hooks/useGenerationProviders";
import { ProviderEditorDialog } from "./ProviderEditorDialog";
import { presetName, providerProtocols } from "./providerEditorModel";
import "./ProviderWorkspace.css";

export function ProviderWorkspace({ providers }: { providers: GenerationProvidersController }) {
  const [editor, setEditor] = useState<GenerationProviderConfiguration | "new" | null>(null);
  const [removing, setRemoving] = useState<GenerationProviderConfiguration | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [tested, setTested] = useState<Record<string, boolean>>({});
  const deleteOpener = useRef<HTMLElement | null>(null);
  const snapshot = providers.snapshot;
  const protocols = providerProtocols(snapshot);
  async function action(id: string, operation: () => Promise<unknown>, success: string) {
    if (actionId) return;
    setActionId(id); setFeedback(null);
    try { await operation(); setFeedback({ error: false, text: success }); }
    catch (error) { setFeedback({ error: true, text: error instanceof Error ? error.message : "操作失败，请重试。" }); }
    finally { setActionId(null); }
  }
  function beginEdit(provider: GenerationProviderConfiguration | "new") { setFeedback(null); setEditor(provider); }
  return <main className="page-workspace provider-workspace">
    <header className="page-heading provider-workspace-heading"><div><span>应用设置</span><h1>模型服务</h1><p>连接你选择的图片与视频服务，管理协议、模型和凭据。</p></div><Button type="primary" icon={<Plus size={16} />} disabled={providers.status !== "online"} onClick={() => beginEdit("new")}>添加服务</Button></header>
    {providers.status === "loading" && <div className="provider-loading"><Spin /><span>正在读取本机配置</span></div>}
    {providers.status === "offline" && <Alert type="error" showIcon title="暂时无法连接本机服务" description="请确认 PetLord 正在运行，然后重试。" action={<Button icon={<ArrowClockwise size={15} />} onClick={() => { void providers.refresh().catch(() => undefined); }}>重试</Button>} />}
    {feedback && <Alert type={feedback.error ? "error" : "success"} showIcon title={feedback.text} closable onClose={() => setFeedback(null)} role="status" />}
    {snapshot && snapshot.providers.length > 0 ? <section className="provider-connection-list" aria-label="已配置的模型服务">
      {snapshot.providers.map(provider => <article className="provider-connection" key={provider.id}>
        <div className="provider-connection-icon">{provider.capability === "image" ? <ImageSquare size={25} /> : <VideoCamera size={25} />}</div>
        <div className="provider-connection-main"><header><h2>{provider.name}</h2><Tag>{provider.capability === "image" ? "图片" : "视频"}</Tag>{!provider.enabled && <Tag>已停用</Tag>}{tested[provider.id] && <span className="provider-tested"><CheckCircle size={14} />连接已验证</span>}</header>
          <p>{protocols.find(protocol => protocol.id === provider.type)?.label ?? presetName(provider.type) ?? provider.type}<span>·</span>{provider.models.length} 个模型</p>
          <code title={provider.baseUrl}>{provider.baseUrl}</code>
          <div className="provider-connection-models">{provider.models.slice(0, 4).map(model => <Tag key={model.id}>{model.label || model.id}</Tag>)}{provider.models.length > 4 && <span>另 {provider.models.length - 4} 个</span>}</div>
        </div>
        <div className="provider-connection-actions"><label><span>启用</span><Switch aria-label={`启用 ${provider.name}`} checked={provider.enabled} disabled={Boolean(actionId)} onChange={enabled => { void action(provider.id, () => providers.update(provider.id, { enabled }), enabled ? `${provider.name} 已启用。` : `${provider.name} 已停用。`); }} /></label>
          <div><Button type="text" disabled={Boolean(actionId) || !provider.enabled} loading={actionId === `test:${provider.id}`} onClick={() => { void action(`test:${provider.id}`, async () => { await providers.test(provider.id); setTested(current => ({ ...current, [provider.id]: true })); }, `${provider.name} 连接验证成功，未执行生成。`); }}>验证连接</Button><Button type="text" icon={<PencilSimple size={16} />} aria-label={`编辑 ${provider.name}`} disabled={Boolean(actionId)} onClick={() => beginEdit(provider)}>编辑</Button><Button type="text" danger icon={<Trash size={16} />} aria-label={`删除 ${provider.name}`} disabled={Boolean(actionId)} onClick={event => { deleteOpener.current = event.currentTarget; setFeedback(null); setRemoving(provider); }} /></div>
        </div>
      </article>)}
    </section> : providers.status === "online" && <section className="provider-workspace-empty"><PlugsConnected size={42} weight="thin" /><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<><strong>连接你的第一个模型服务</strong><p>选择服务商预设快速添加，也可以手动配置兼容服务。</p></>} /><Button type="primary" onClick={() => beginEdit("new")}>添加模型服务</Button></section>}
    <p className="provider-workspace-footnote">添加后，可在项目的“生成设置”中选择服务和模型。原生像素创作不需要配置模型服务。</p>
    {editor && snapshot && <ProviderEditorDialog provider={editor === "new" ? undefined : editor} snapshot={snapshot} providers={providers} onClose={saved => { if (saved && editor !== "new") setTested(current => ({ ...current, [editor.id]: false })); if (saved) setFeedback({ error: false, text: "模型服务已保存。" }); setEditor(null); }} />}
    <Dialog.Root open={Boolean(removing)} onOpenChange={open => { if (!open && !actionId) setRemoving(null); }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><DialogContent className="dialog-content provider-delete-dialog" onOpenAutoFocus={event => { event.preventDefault(); document.querySelector<HTMLButtonElement>("[data-delete-cancel]")?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); (deleteOpener.current?.isConnected ? deleteOpener.current : document.querySelector<HTMLElement>(".provider-workspace-heading button"))?.focus(); }} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (actionId) event.preventDefault(); }}>
      <header className="entity-dialog-heading"><div><Dialog.Title>删除模型服务</Dialog.Title><Dialog.Description>删除“{removing?.name}”？此服务的连接设置与密钥会从本机移除。</Dialog.Description></div><Dialog.Close asChild><Button type="text" icon={<X size={18} />} aria-label="关闭" disabled={Boolean(actionId)} /></Dialog.Close></header>
      {feedback?.error && <Alert type="error" showIcon title={feedback.text} role="alert" />}
      <footer className="entity-dialog-footer"><Dialog.Close asChild><Button type="default" data-delete-cancel disabled={Boolean(actionId)}>取消</Button></Dialog.Close><Button danger type="primary" loading={Boolean(actionId)} onClick={() => { if (removing) void action(removing.id, async () => { await providers.remove(removing.id); setRemoving(null); }, "模型服务已删除。"); }}>删除服务</Button></footer>
    </DialogContent></Dialog.Portal></Dialog.Root>
  </main>;
}
