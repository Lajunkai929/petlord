import { Button, Dialog, DialogContent, FormField, Input, Radio, SelectField, TextArea } from "@petlord/ui";
import { PawPrint, Plus, X } from "@phosphor-icons/react";
import type { IdentityProfile } from "@petlord/schema";
import { type NewOrderInput, type ProjectTemplateDefinition } from "../projectTemplate";
import { useNewOrderDialog } from "../hooks/useNewOrderDialog";
import type { StyleProfile } from "../styleLibrary";
import "./NewOrderDialog.css";

export function NewOrderDialog({ identities, styles, templates, activeIdentityId, activeStyleProfileId, onCreate }: { identities: IdentityProfile[]; styles: StyleProfile[]; templates: ProjectTemplateDefinition[]; activeIdentityId?: string; activeStyleProfileId?: string; onCreate: (input: NewOrderInput, duplicateCurrent: boolean) => void | boolean }) {
  const dialog = useNewOrderDialog(identities, styles, templates, activeIdentityId, activeStyleProfileId, onCreate);
  const identity = identities.find(candidate => candidate.id === dialog.form.identityProfileId);
  const cover = identity?.referenceArtifacts[0];
  return (
    <Dialog.Root open={dialog.open} onOpenChange={dialog.setOpen}>
      <Dialog.Trigger asChild><Button type="primary" icon={<Plus size={15} weight="bold" />}>新建项目</Button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent className="dialog-content new-project-dialog">
          <div className="dialog-heading"><div><Dialog.Title>新建项目</Dialog.Title><Dialog.Description>为宠物建立一个项目，随后自由绘制、生成或导入素材。</Dialog.Description></div><Dialog.Close asChild><Button type="text" aria-label="关闭" icon={<X size={18} />} /></Dialog.Close></div>
          <form onSubmit={dialog.submit}>
            <div className="new-project-fields">
              <FormField label="项目名称" required><Input value={dialog.form.projectName ?? ""} onChange={event => dialog.patch({ projectName: event.target.value })} placeholder="例如 Lottery · 手绘治愈版" autoFocus /></FormField>
              <div className="new-project-identity" data-field="identity">
                <FormField label="宠物形象"><SelectField value={dialog.form.identityProfileId ?? "new"} onChange={event => dialog.selectIdentity(event.target.value)}><option value="new">新宠物 · 从空白开始</option>{identities.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</SelectField></FormField>
                <div className="new-project-identity-preview" aria-live="polite">
                  <span className="new-project-identity-thumb">{cover ? <img src={cover.uri} style={{ imageRendering: cover.nativePixel ? "pixelated" : "auto" }} alt="" /> : identity ? <PawPrint size={22} /> : <Plus size={22} />}</span>
                  <span><strong>{identity?.name ?? "新宠物"}</strong><small>{identity ? `${identity.referenceArtifacts.length} 份身份素材 · 沿用形象与名称` : "从空白开始，稍后添加素材"}</small></span>
                </div>
              </div>
              <div className="new-project-field-pair">
                <FormField label="宠物名称" required><Input aria-label="宠物名称" value={dialog.form.characterName} disabled={Boolean(dialog.form.identityProfileId)} onChange={event => dialog.patch({ characterName: event.target.value })} /></FormField>
                <div data-field="style"><FormField label="风格"><SelectField value={dialog.form.styleProfileId ?? "custom"} onChange={event => dialog.selectStyle(event.target.value)}>{styles.map(style => <option value={style.id} key={style.id}>{style.name}</option>)}<option value="custom">自由文本</option></SelectField></FormField></div>
              </div>
              <fieldset className="new-project-templates">
                <legend>状态模板</legend>
                <Radio.Group name="new-project-template" value={dialog.form.projectTemplateId} onChange={event => dialog.selectProjectTemplate(event.target.value)} className="new-project-template-options">
                  {dialog.templateOptions.map(({ template, stateCount, transitionCount }) => <Radio value={template.id} key={template.id}><span className="new-project-template-copy"><strong>{template.name}{template.kind === "custom" && <small>自定义</small>}</strong><span>{stateCount} 状态 · {transitionCount} 动画</span></span></Radio>)}
                </Radio.Group>
                <p className="new-project-state-summary" aria-live="polite">{dialog.selectedStateLabels.length > 0 ? dialog.selectedStateLabels.join(" · ") : "空白画布"}</p>
              </fieldset>
              <details className="new-project-advanced"><summary>高级风格提示词</summary><div className="new-project-field-pair"><FormField label="图片提示词"><TextArea rows={3} value={dialog.form.imageStylePrompt ?? dialog.form.stylePrompt ?? ""} onChange={event => dialog.editStylePrompt(event.target.value)} /></FormField><FormField label="视频提示词"><TextArea rows={3} value={dialog.form.videoStylePrompt ?? dialog.form.stylePrompt ?? ""} onChange={event => dialog.editVideoStylePrompt(event.target.value)} /></FormField></div></details>
            </div>
            <footer className="new-project-footer"><Dialog.Close asChild><Button>取消</Button></Dialog.Close><Button type="primary" htmlType="submit" disabled={!dialog.form.projectName?.trim() || !dialog.form.characterName.trim()}>创建项目</Button></footer>
          </form>
        </DialogContent>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
