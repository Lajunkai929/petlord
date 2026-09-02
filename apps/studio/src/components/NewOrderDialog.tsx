import * as Dialog from "@radix-ui/react-dialog";
import { Graph, PawPrint, Plus, SquaresFour, X } from "@phosphor-icons/react";
import type { IdentityProfile } from "@petlord/schema";
import { type NewOrderInput, type ProjectTemplateDefinition } from "../projectTemplate";
import { useNewOrderDialog } from "../hooks/useNewOrderDialog";
import type { StyleProfile } from "../styleLibrary";

export function NewOrderDialog({ identities, styles, templates, activeIdentityId, activeStyleProfileId, onCreate }: { identities: IdentityProfile[]; styles: StyleProfile[]; templates: ProjectTemplateDefinition[]; activeIdentityId?: string; activeStyleProfileId?: string; onCreate: (input: NewOrderInput, duplicateCurrent: boolean) => void }) {
  const dialog = useNewOrderDialog(identities, styles, templates, activeIdentityId, activeStyleProfileId, onCreate);
  return (
    <Dialog.Root open={dialog.open} onOpenChange={dialog.setOpen}>
      <Dialog.Trigger asChild><button className="primary-button" type="button" disabled={identities.length === 0}><Plus size={15} weight="bold" />新建项目</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content order-dialog">
          <div className="dialog-heading"><div><Dialog.Title>新建项目</Dialog.Title><Dialog.Description>选择形象、风格和状态模板。</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="关闭"><X size={18} /></Dialog.Close></div>
          <form onSubmit={dialog.submit}>
            <section className="identity-project-picker">
              <header><PawPrint size={15} weight="fill" /><span><strong>形象</strong></span></header>
              <div>{identities.map((identity) => {
                const cover = identity.referenceArtifacts[0];
                return <button type="button" className={dialog.form.identityProfileId === identity.id ? "is-active" : ""} onClick={() => dialog.selectIdentity(identity.id)} key={identity.id}><span className="identity-picker-thumb checkerboard">{cover ? <img src={cover.uri} alt="" /> : <PawPrint size={18} />}</span><span><strong>{identity.name}</strong><small>{identity.referenceArtifacts.length} 份身份素材</small></span></button>;
              })}</div>
            </section>
            <div className="project-definition-fields">
              <label><span>项目名称 *</span><input value={dialog.form.projectName ?? ""} onChange={(event) => dialog.patch({ projectName: event.target.value })} placeholder="例如 Lottery · 手绘治愈版" autoFocus /></label>
              <label><span>风格</span><select value={dialog.form.styleProfileId ?? "custom"} onChange={(event) => dialog.selectStyle(event.target.value)}>{styles.map((style) => <option value={style.id} key={style.id}>{style.name}</option>)}<option value="custom">自由文本</option></select></label>
            </div>
            <details className="project-advanced-style"><summary>高级风格提示词</summary><div><label><span>图片提示词</span><textarea rows={3} value={dialog.form.imageStylePrompt ?? dialog.form.stylePrompt ?? ""} onChange={(event) => dialog.editStylePrompt(event.target.value)} /></label><label><span>视频提示词</span><textarea rows={3} value={dialog.form.videoStylePrompt ?? dialog.form.stylePrompt ?? ""} onChange={(event) => dialog.editVideoStylePrompt(event.target.value)} /></label></div></details>
            <section className="service-template-picker">
              <header><SquaresFour size={15} weight="fill" /><span><strong>状态模板</strong></span></header>
              <div className="template-option-list">{dialog.templateOptions.map(({ template, stateCount, transitionCount }) => (
                <button type="button" className={dialog.form.projectTemplateId === template.id ? "is-active" : ""} onClick={() => dialog.selectProjectTemplate(template.id)} key={template.id}>
                  <Graph size={17} weight={dialog.form.projectTemplateId === template.id ? "fill" : "regular"} /><span><strong>{template.name}{template.kind === "custom" && <em>自定义</em>}</strong></span><b>{stateCount} 状态 · {transitionCount} 动画</b>
                </button>
              ))}</div>
              <p className="template-selection-summary">{dialog.selectedStateLabels.length > 0 ? dialog.selectedStateLabels.join(" · ") : "空白画布"}</p>
            </section>
            <footer><Dialog.Close asChild><button className="secondary-button" type="button">取消</button></Dialog.Close><button className="primary-button" type="submit" disabled={!dialog.form.identityProfileId || !dialog.form.projectName?.trim()}>创建项目</button></footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
