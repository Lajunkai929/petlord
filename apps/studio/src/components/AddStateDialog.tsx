import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "@phosphor-icons/react";
import { useAddStateDialog } from "../hooks/useAddStateDialog";

interface AddStateDialogProps {
  onAdd: (input: { label: string; semanticKey: string; description: string }) => void;
}

export function AddStateDialog({ onAdd }: AddStateDialogProps) {
  const form = useAddStateDialog(onAdd);

  return (
    <Dialog.Root open={form.open} onOpenChange={form.setOpen}>
      <Dialog.Trigger asChild>
        <button className="secondary-button compact-button" type="button">
          <Plus size={16} weight="bold" />新增状态
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>新增逻辑状态</Dialog.Title>
              <Dialog.Description>先定义意图，再从现有实际变体创建转换。</Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="关闭">
              <X size={18} />
            </Dialog.Close>
          </div>
          <form onSubmit={form.submit} className="dialog-form">
            <div className="field-block">
              <label htmlFor="state-name">状态名称</label>
              <input id="state-name" value={form.label} onChange={(event) => form.setLabel(event.target.value)} autoFocus />
              <small>例如：翻肚皮、伸懒腰、专注工作。</small>
            </div>
            <div className="field-block">
              <label htmlFor="semantic-key">语义动作</label>
              <input
                id="semantic-key"
                value={form.semanticKey}
                onChange={(event) => form.setSemanticKey(event.target.value)}
                placeholder="例如 success"
              />
              <small>插件通过语义动作调用，不依赖宠物自己的状态名称。</small>
            </div>
            <div className="field-block">
              <label htmlFor="state-description">状态说明</label>
              <textarea
                id="state-description"
                rows={3}
                value={form.description}
                onChange={(event) => form.setDescription(event.target.value)}
              />
            </div>
            <div className="dialog-actions">
              <Dialog.Close asChild><button className="secondary-button" type="button">取消</button></Dialog.Close>
              <button className="primary-button" type="submit" disabled={!form.label.trim()}>创建状态</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
