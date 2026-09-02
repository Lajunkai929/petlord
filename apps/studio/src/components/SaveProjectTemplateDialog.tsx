import * as Dialog from "@radix-ui/react-dialog";
import { CheckCircle, FileArrowDown, Graph, MagicWand, X } from "@phosphor-icons/react";
import type { CharacterProject } from "@petlord/schema";
import { useSaveProjectTemplateDialog } from "../hooks/useSaveProjectTemplateDialog";

export function SaveProjectTemplateDialog({ project, onSave }: { project: CharacterProject; onSave: (name: string, description: string) => string | undefined }) {
  const controller = useSaveProjectTemplateDialog(project, onSave);
  return (
    <Dialog.Root open={controller.open} onOpenChange={controller.setOpen}>
      <button className="ghost-button" type="button" disabled={project.logicalStates.length === 0} onClick={() => controller.setOpen(true)}><FileArrowDown size={15} />保存模板</button>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content save-project-template-dialog">
          <div className="dialog-heading"><div><Dialog.Title>将当前项目保存为模板</Dialog.Title><Dialog.Description>复制状态机与交互规则，下一只宠物只需重新选择形象和风格。</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="关闭"><X size={18} /></Dialog.Close></div>
          <form onSubmit={controller.submit}>
            <div className="save-template-summary"><article><Graph size={19} weight="duotone" /><span><strong>{project.logicalStates.length} 个状态</strong><small>位置、描述与待机调度</small></span></article><article><MagicWand size={19} weight="duotone" /><span><strong>{project.transitions.length} 条转换</strong><small>提示词、触发与播放方式</small></span></article></div>
            <label><span>模板名称 *</span><input value={controller.name} onChange={(event) => controller.setName(event.target.value)} autoFocus /></label>
            <label><span>模板说明</span><textarea rows={3} value={controller.description} onChange={(event) => controller.setDescription(event.target.value)} /></label>
            <section className="template-snapshot-contract"><div><CheckCircle size={15} weight="fill" /><span><strong>会保存</strong><small>状态、动画、提示词、触发规则和插件声明</small></span></div><div><X size={15} /><span><strong>不会保存</strong><small>身份素材、生成媒体、任务和项目记录</small></span></div></section>
            <p className="template-variable-note"><MagicWand size={14} weight="fill" />检测到 {controller.dynamicPromptCount} 条提示词包含“{project.characterName}”，保存时会替换成宠物名称变量。</p>
            <footer><Dialog.Close asChild><button className="secondary-button" type="button">取消</button></Dialog.Close><button className="primary-button" type="submit" disabled={!controller.name.trim()}><FileArrowDown size={15} weight="fill" />保存到全局模板库</button></footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
