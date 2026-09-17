import { DialogContent, Button, Dialog } from "@petlord/ui";
import { Code, Eye, X } from "@phosphor-icons/react";

export function GenerationPromptDialog({
  title,
  prompt,
  model,
  chromaKeyColor,
  compact = false,
}: {
  title: string;
  prompt: string;
  model?: string;
  chromaKeyColor?: string;
  compact?: boolean;
}) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button type="default" className={compact ? "prompt-history-button" : "prompt-preview-button"} htmlType="button">{compact ? <Code size={12} /> : <Eye size={14} />}查看完整提示词</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent className="dialog-content generation-prompt-dialog">
          <div className="dialog-heading">
            <div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>以下文本就是实际提交给 Seedance 的生成提示词。</Dialog.Description></div>
            <Dialog.Close asChild><Button type="text" htmlType="button" className="icon-button" aria-label="关闭提示词"><X size={18} /></Button></Dialog.Close>
          </div>
          <div className="generation-prompt-meta">
            {model && <span><small>模型</small><strong>{model}</strong></span>}
            {chromaKeyColor && <span><small>抠图底色</small><strong><i style={{ "--video-key-color": chromaKeyColor } as React.CSSProperties} />{chromaKeyColor}</strong></span>}
          </div>
          <pre>{prompt}</pre>
          <p>身份、风格、动作、镜头锁定、背景和输出规格会在每次生成时重新组装；历史版本保存的是当时的快照。</p>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
