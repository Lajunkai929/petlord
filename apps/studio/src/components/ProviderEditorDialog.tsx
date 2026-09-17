import { useId, useRef, useState, type FormEvent } from "react";
import { Alert, Button, Input, InputNumber, Select, Switch, Tag, DialogContent, SelectField, Dialog } from "@petlord/ui";
import { ArrowLeft, ArrowRight, Check, PlugsConnected, X } from "@phosphor-icons/react";

import type { GenerationProviderCapability, GenerationProviderConfiguration, GenerationProvidersSnapshot } from "@petlord/generation";
import type { GenerationProvidersController } from "../hooks/useGenerationProviders";
import { buildProviderInput, editProviderDraft, newProviderDraft, presetName, protocolHelp, providerDraftErrors, providerProtocols, type ProviderDraft, type ProviderDraftErrors } from "./providerEditorModel";
import "./ProviderWorkspace.css";

export function ProviderEditorDialog({ provider, snapshot, providers, onClose }: {
  provider?: GenerationProviderConfiguration;
  snapshot: GenerationProvidersSnapshot;
  providers: Pick<GenerationProvidersController, "create" | "update">;
  onClose: (saved?: boolean) => void;
}) {
  const [draft, setDraft] = useState<ProviderDraft | null>(() => provider ? editProviderDraft(provider) : null);
  const [errors, setErrors] = useState<ProviderDraftErrors>({});
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const content = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null);
  const id = useId();
  const protocols = providerProtocols(snapshot);
  const preset = draft && snapshot.catalog.find(entry => (entry.id ?? entry.type) === draft.presetId);
  function patch(next: Partial<ProviderDraft>) { setDraft(current => current ? { ...current, ...next } : current); setErrors({}); setFailure(""); }
  function close() { if (!busy.current) onClose(); }
  function capabilityChanged(capability: GenerationProviderCapability) {
    if (!draft || provider) return;
    if (preset) { setDraft({ ...newProviderDraft(snapshot, draft.presetId, capability), apiKey: draft.apiKey, baseUrl: draft.baseUrl }); return; }
    const type = protocols.find(protocol => protocol.capabilities.includes(capability))!.id;
    patch({ capability, type, modelIds: [], modelPrices: {} });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || busy.current) return;
    const invalid = providerDraftErrors(draft, snapshot);
    setErrors(invalid); setFailure("");
    if (Object.keys(invalid).length) { requestAnimationFrame(() => content.current?.querySelector<HTMLInputElement>('[aria-invalid="true"]')?.focus()); return; }
    busy.current = true; setSaving(true);
    try {
      const payload = buildProviderInput(draft, provider);
      if (provider) {
        const { capability: _capability, ...update } = payload;
        await providers.update(provider.id, update);
      } else await providers.create({ ...payload, apiKey: draft.apiKey.trim() });
      onClose(true);
    } catch (caught) { setFailure(caught instanceof Error ? caught.message : "保存失败，请重试。"); }
    finally { busy.current = false; setSaving(false); }
  }
  const feedback = (field: keyof ProviderDraftErrors) => errors[field] && <span className="provider-field-error" id={`${id}-${field}-error`} role="alert">{errors[field]}</span>;
  const describedBy = (field: keyof ProviderDraftErrors) => errors[field] ? `${id}-${field}-error` : undefined;
  return <Dialog.Root open onOpenChange={open => { if (!open) close(); }}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><DialogContent ref={content} className={`dialog-content provider-config-dialog ${draft ? "is-configuring" : "is-choosing"}`} onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (busy.current) event.preventDefault(); }} onOpenAutoFocus={event => { event.preventDefault(); (content.current?.querySelector<HTMLElement>('[aria-label="服务名称"]') ?? content.current?.querySelector<HTMLElement>(".provider-preset-option"))?.focus(); }} onCloseAutoFocus={event => { event.preventDefault(); (returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>(".provider-workspace-heading button"))?.focus(); }}>
      <header className="entity-dialog-heading"><div><Dialog.Title>{provider ? "编辑模型服务" : draft ? `配置${presetName(draft.presetId) ?? preset?.label ?? "模型服务"}` : "添加模型服务"}</Dialog.Title><Dialog.Description>{draft ? "配置连接、调用协议和你要使用的模型。" : "选择一个服务商，或连接兼容协议的其他服务。"}</Dialog.Description></div><Button type="text" aria-label="关闭" disabled={saving} onClick={close} icon={<X size={18} />} /></header>
      {!draft ? <>
        <div className="provider-preset-list">{snapshot.catalog.map(entry => {
          const presetId = entry.id ?? entry.type;
          return <button type="button" key={presetId} className="provider-preset-option" onClick={() => setDraft(newProviderDraft(snapshot, presetId))}>
            <span className="provider-vendor-mark">{(presetName(presetId) ?? entry.label).slice(0, 1)}</span><span><strong>{presetName(presetId) ?? entry.label}</strong><small>{entry.capabilities.map(capability => capability === "image" ? "图片生成" : "视频生成").join(" · ")}</small></span><ArrowRight size={17} />
          </button>;
        })}<button type="button" className="provider-preset-option is-custom" onClick={() => setDraft(newProviderDraft(snapshot, "other"))}><span className="provider-vendor-mark"><PlugsConnected size={21} /></span><span><strong>其他服务</strong><small>自定义地址、协议和模型列表</small></span><ArrowRight size={17} /></button></div>
        <footer className="entity-dialog-footer"><Button onClick={close}>取消</Button></footer>
      </> : <form onSubmit={event => { void submit(event); }} noValidate>
        <div className="provider-config-fields">
          <div className="provider-field"><label htmlFor={`${id}-name`}>服务名称</label><Input id={`${id}-name`} aria-label="服务名称" autoFocus maxLength={80} disabled={saving} value={draft.name} onChange={event => patch({ name: event.target.value })} status={errors.name ? "error" : undefined} aria-invalid={Boolean(errors.name)} aria-describedby={describedBy("name")} />{feedback("name")}</div>
          <div className="provider-field"><label htmlFor={`${id}-capability`}>生成用途</label>{provider ? <div className="provider-purpose"><Tag>{draft.capability === "image" ? "图片生成" : "视频生成"}</Tag></div> : <SelectField id={`${id}-capability`} aria-label="生成用途" disabled={saving} value={draft.capability} onChange={event => capabilityChanged(event.target.value as GenerationProviderCapability)}>{(preset?.capabilities ?? ["image", "video"]).map(capability => <option key={capability} value={capability}>{capability === "image" ? "图片生成" : "视频生成"}</option>)}</SelectField>}</div>
          <div className="provider-field is-wide"><label htmlFor={`${id}-protocol`}>调用协议</label><SelectField id={`${id}-protocol`} aria-label="调用协议" disabled={saving} value={draft.type} onChange={event => patch({ type: event.target.value as ProviderDraft["type"] })} aria-invalid={Boolean(errors.type)} aria-describedby={describedBy("type")}>{protocols.filter(protocol => protocol.capabilities.includes(draft.capability)).map(protocol => <option value={protocol.id} key={protocol.id}>{protocol.label}</option>)}</SelectField><small>{protocolHelp[draft.type] ?? protocols.find(protocol => protocol.id === draft.type)?.description}</small>{feedback("type")}</div>
          <div className="provider-field is-wide"><label htmlFor={`${id}-url`}>Base URL</label><Input id={`${id}-url`} aria-label="Base URL" placeholder="https://api.example.com/v1" disabled={saving} value={draft.baseUrl} onChange={event => patch({ baseUrl: event.target.value })} status={errors.baseUrl ? "error" : undefined} aria-invalid={Boolean(errors.baseUrl)} aria-describedby={describedBy("baseUrl")} />{feedback("baseUrl")}</div>
          <div className="provider-field is-wide"><label htmlFor={`${id}-key`}>API Key</label><Input.Password id={`${id}-key`} aria-label="API Key" autoComplete="new-password" placeholder={provider ? "留空保留已保存的密钥" : "输入此服务的 API Key"} disabled={saving} value={draft.apiKey} onChange={event => patch({ apiKey: event.target.value })} status={errors.apiKey ? "error" : undefined} aria-invalid={Boolean(errors.apiKey)} aria-describedby={describedBy("apiKey")} /><small>{provider ? `已保存 ${provider.credentialHint}；填写新密钥才会替换。` : "密钥只保存在本机。"}</small>{feedback("apiKey")}</div>
          <div className="provider-field is-wide"><label htmlFor={`${id}-models`}>模型列表</label><div className="pl-select-control provider-model-tags"><Select id={`${id}-models`} aria-label="模型列表" mode="tags" placeholder="输入模型 ID，按 Enter 添加" disabled={saving} value={draft.modelIds} onChange={modelIds => patch({ modelIds })} tokenSeparators={[",", "\n", "，"]} options={preset?.models[draft.capability].map(model => ({ value: model.id, label: model.id }))} status={errors.modelIds ? "error" : undefined} aria-invalid={Boolean(errors.modelIds)} aria-describedby={describedBy("modelIds")} getPopupContainer={trigger => trigger.closest('[role="dialog"]') as HTMLElement} /></div><small>可使用你自己的模型或部署 ID，名称需要与服务商提供的一致。</small>{feedback("modelIds")}</div>
          {draft.modelIds.length > 0 && <div className="provider-model-pricing is-wide"><div><strong>预算预估</strong><small>可选，实际费用由服务商结算。未内置价格的模型需要填写后才能生成。</small></div>{draft.modelIds.map(modelId => <label key={modelId}><code title={modelId}>{modelId}</code><InputNumber aria-label={`${modelId} 预估费用`} value={Object.hasOwn(draft.modelPrices, modelId) ? draft.modelPrices[modelId] : undefined} min={.0001} max={5000} step={.01} precision={4} placeholder="未设置" disabled={saving} onChange={value => patch({ modelPrices: { ...draft.modelPrices, [modelId]: value ?? undefined } })} /><span>元/{draft.capability === "image" ? "张" : "秒"}</span></label>)}</div>}
          <div className="provider-enabled-field is-wide"><label htmlFor={`${id}-enabled`}>启用这个服务</label><Switch id={`${id}-enabled`} aria-label="启用这个服务" checked={draft.enabled} disabled={saving} onChange={enabled => patch({ enabled })} /></div>
        </div>
        {failure && <Alert type="error" showIcon title={failure} role="alert" />}
        <footer className="entity-dialog-footer">{!provider && <Button type="text" className="provider-back-button" icon={<ArrowLeft size={15} />} disabled={saving} onClick={() => { setDraft(null); setErrors({}); setFailure(""); }}>选择服务商</Button>}<Button disabled={saving} onClick={close}>取消</Button><Button type="primary" htmlType="submit" loading={saving} icon={<Check size={15} />}>保存服务</Button></footer>
      </form>}
    </DialogContent></Dialog.Portal>
  </Dialog.Root>;
}
