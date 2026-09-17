import { useId, useRef, useState, type FormEvent } from "react";

import { Alert, Button, Input, DialogContent, Dialog } from "@petlord/ui";
import { CloudArrowDown, X } from "@phosphor-icons/react";

import { normalizeSubscriptionServerUrl } from "../hooks/useDesktopPetPackage";
import type { DesktopSettingsWindowController } from "../hooks/useDesktopSettingsWindow";

export function SubscriptionBrowser({ petPackages }: { petPackages: DesktopSettingsWindowController["petPackages"] }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const connecting = useRef(false);
  const id = useId();
  const busy = petPackages.subscriptionLoading || Boolean(petPackages.importingPublicationId);
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (connecting.current || busy) return;
    let normalized: string;
    try { normalized = normalizeSubscriptionServerUrl(draft); }
    catch { setError("请输入有效的 HTTP 或 HTTPS 服务器地址。"); return; }
    connecting.current = true; setError("");
    try { if (await petPackages.refreshSubscription(normalized)) setDraft(normalized); }
    finally { connecting.current = false; }
  }
  return <Dialog.Root open={open} onOpenChange={next => {
    if (busy || connecting.current) return;
    if (next) { setDraft(petPackages.subscriptionUrl); setError(""); }
    setOpen(next);
  }}>
    <div className="subscription-entry"><div><strong>创作者作品</strong><small>通过创作者提供的地址浏览和订阅宠物。</small></div><Dialog.Trigger asChild><Button type="default" icon={<CloudArrowDown size={16} />}>浏览作品</Button></Dialog.Trigger></div>
    <Dialog.Portal><Dialog.Overlay className="import-dialog-overlay" /><DialogContent className="import-dialog-content subscription-dialog-content" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy) event.preventDefault(); }}>
      <Dialog.Title>从创作者订阅</Dialog.Title><Dialog.Description>连接服务器，选择作品后导入并使用。连接成功后会记住地址。</Dialog.Description>
      <Dialog.Close asChild><Button type="text" className="import-dialog-close" aria-label="关闭" disabled={busy} icon={<X size={17} />} /></Dialog.Close>
      <form className="subscription-connect-form" onSubmit={event => { void connect(event); }} noValidate>
        <label htmlFor={id}>服务器地址</label><Input id={id} aria-label="服务器地址" type="url" autoFocus value={draft} disabled={busy} placeholder="https://pets.example.com" status={error ? "error" : undefined} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => { setDraft(event.target.value); setError(""); }} />
        {error && <span id={`${id}-error`} className="subscription-field-error" role="alert">{error}</span>}
        <Button type="primary" htmlType="submit" loading={petPackages.subscriptionLoading} disabled={Boolean(petPackages.importingPublicationId)}>连接并浏览</Button>
      </form>
      {petPackages.subscriptionError && <Alert type="error" showIcon title={petPackages.subscriptionError} role="alert" />}
      {petPackages.subscriptionMessage && <Alert type="success" showIcon title={petPackages.subscriptionMessage} role="status" />}
      {petPackages.subscriptionPackages.length > 0 && <div className="subscription-package-list">{petPackages.subscriptionPackages.map(item => <article key={item.publicationId}><i>{item.characterName.slice(0, 1)}</i><span><strong>{item.name}</strong><small>{item.characterName} · {item.stateCount} 个状态 · {item.transitionCount} 段动画</small><time>{new Date(item.publishedAt).toLocaleString("zh-CN")}</time></span><Button disabled={busy} loading={petPackages.importingPublicationId === item.publicationId} onClick={() => { void petPackages.importSubscriptionPackage(item); }}>{petPackages.installedPackages.some(installed => installed.name.trim().toLocaleLowerCase() === item.name.trim().toLocaleLowerCase()) ? "更新并使用" : "导入并使用"}</Button></article>)}</div>}
      <footer className="subscription-dialog-footer"><Dialog.Close asChild><Button type="default" disabled={busy}>关闭</Button></Dialog.Close></footer>
    </DialogContent></Dialog.Portal>
  </Dialog.Root>;
}
