import { DialogContent, Button, Input, TextArea, Dialog } from "@petlord/ui";
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
        <Button type="default" size="small" className="secondary-button compact-button" htmlType="button">
          <Plus size={16} weight="bold" />新增状态
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent className="dialog-content">
          <div className="dialog-heading">
            <div>
              <Dialog.Title>新增逻辑状态</Dialog.Title>
              <Dialog.Description>先定义意图，再从现有实际变体创建转换。</Dialog.Description>
            </div>
            <Dialog.Close asChild><Button type="text" htmlType="button" className="icon-button" aria-label="关闭">
              <X size={18} />
            </Button></Dialog.Close>
          </div>
          <form onSubmit={form.submit} className="dialog-form">
            <div className="field-block">
              <label htmlFor="state-name">状态名称</label>
              <Input id="state-name" value={form.label} onChange={(event) => form.setLabel(event.target.value)} autoFocus />
              <small>例如：翻肚皮、伸懒腰、专注工作。</small>
            </div>
            <div className="field-block">
              <label htmlFor="semantic-key">语义动作</label>
              <Input
                id="semantic-key"
                value={form.semanticKey}
                onChange={(event) => form.setSemanticKey(event.target.value)}
                placeholder="例如 success"
              />
              <small>插件通过语义动作调用，不依赖宠物自己的状态名称。</small>
            </div>
            <div className="field-block">
              <label htmlFor="state-description">状态说明</label>
              <TextArea
                id="state-description"
                rows={3}
                value={form.description}
                onChange={(event) => form.setDescription(event.target.value)}
              />
            </div>
            <div className="dialog-actions">
              <Dialog.Close asChild><Button type="default" className="secondary-button" htmlType="button">取消</Button></Dialog.Close>
              <Button type="primary" className="primary-button" htmlType="submit" disabled={!form.label.trim()}>创建状态</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
