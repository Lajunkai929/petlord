import { useId, useState, type FormEvent } from "react";
import { Alert, Button, Input, DialogContent, Dialog } from "@petlord/ui";
import { Plus, X } from "@phosphor-icons/react";

import "./EntityDialogs.css";

export function CreateEntityDialog({ label, title, description, fieldLabel, placeholder, disabled, onCreate }: {
  label: string;
  title: string;
  description: string;
  fieldLabel: string;
  placeholder?: string;
  disabled?: boolean;
  onCreate: (name: string) => unknown | Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  function changeOpen(next: boolean) {
    if (saving) return;
    setOpen(next);
    if (!next) { setName(""); setError(""); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    if (!name.trim()) { setError(`请输入${fieldLabel}。`); return; }
    setSaving(true); setError("");
    try {
      await onCreate(name.trim());
      setOpen(false); setName("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "保存失败，请重试。"); }
    finally { setSaving(false); }
  }
  return <Dialog.Root open={open} onOpenChange={changeOpen}>
    <Dialog.Trigger asChild><Button type="primary" disabled={disabled} icon={<Plus size={16} />}>{label}</Button></Dialog.Trigger>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><DialogContent className="dialog-content entity-create-dialog" onPointerDownOutside={event => event.preventDefault()} onEscapeKeyDown={event => { if (saving) event.preventDefault(); }}>
      <header className="entity-dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div><Dialog.Close asChild><Button type="text" aria-label="关闭" disabled={saving} icon={<X size={18} />} /></Dialog.Close></header>
      <form onSubmit={event => { void submit(event); }} noValidate>
        <label htmlFor={id}>{fieldLabel}</label>
        <Input id={id} aria-label={fieldLabel} value={name} onChange={event => { setName(event.target.value); setError(""); }} autoFocus maxLength={80} placeholder={placeholder} disabled={saving} aria-required="true" aria-invalid={Boolean(error)} status={error ? "error" : undefined} />
        {error && <Alert type="error" title={error} showIcon role="alert" />}
        <footer className="entity-dialog-footer"><Dialog.Close asChild><Button type="default" disabled={saving}>取消</Button></Dialog.Close><Button type="primary" htmlType="submit" loading={saving}>创建</Button></footer>
      </form>
    </DialogContent></Dialog.Portal>
  </Dialog.Root>;
}
