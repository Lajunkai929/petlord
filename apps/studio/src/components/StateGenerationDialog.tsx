import { DialogContent, SelectField, Button, TextArea, Checkbox, Dialog } from "@petlord/ui";
import { ArrowRight, CheckCircle, Code, Images, Sparkle, SpinnerGap, X } from "@phosphor-icons/react";
import type { CharacterProject, LogicalState } from "@petlord/schema";
import type { StyleProfile } from "../styleLibrary";
import type { StateGenerationOptions } from "../hooks/useStudioController";
import { useStateGenerationDialog } from "../hooks/useStateGenerationDialog";
import { GenerationCostNotice } from "./GenerationCostNotice";
import { estimateImageGenerationCost } from "@petlord/generation";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";

export function StateGenerationDialog({
  project,
  state,
  profiles,
  activeStyleProfileId,
  busy,
  onGenerate,
}: {
  project: CharacterProject;
  state: LogicalState;
  profiles: StyleProfile[];
  activeStyleProfileId?: string;
  busy: boolean;
  onGenerate: (stateId: string, options?: StateGenerationOptions) => Promise<void>;
}) {
  const controller = useStateGenerationDialog({ project, state, profiles, activeStyleProfileId, onGenerate });
  const estimate = estimateImageGenerationCost(project.generationSettings.imageModel, project.generationSettings.imageCandidateCount);
  return (
    <>
      <Button type="primary" className="primary-button" htmlType="button" disabled={busy || controller.references.length === 0} onClick={() => void onGenerate(state.id)}>
        {busy ? <SpinnerGap className="spin" size={16} /> : <Sparkle size={16} weight="fill" />}
        生成 {project.generationSettings.imageCandidateCount} 张
      </Button>
      <Dialog.Root open={controller.open} onOpenChange={controller.setOpen}>
        <Dialog.Trigger asChild><Button type="default" className="secondary-button" htmlType="button"><Code size={15} />AI 生成</Button></Dialog.Trigger>
        <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <DialogContent className="dialog-content state-generation-dialog">
          <div className="dialog-heading"><div><Dialog.Title>生成“{state.label}”权威参考候选</Dialog.Title><Dialog.Description>提交前核对模型真正会收到的参考图与每一段提示词。</Dialog.Description></div><Dialog.Close asChild><Button type="text" htmlType="button" className="icon-button" aria-label="关闭"><X size={18} /></Button></Dialog.Close></div>
          <form onSubmit={controller.submit}>
            <section className="generation-contract-summary">
              <span><small>模型</small><strong>{project.generationSettings.imageModel}</strong></span>
              <ArrowRight size={14} />
              <span><small>输出</small><strong>{project.generationSettings.imageResolution} · {project.generationSettings.ratio} · {project.generationSettings.imageCandidateCount} 张</strong></span>
            </section>
            <section className="generation-reference-contract">
              <header><div><Images size={16} weight="fill" /><span><strong>形象参考图</strong><small>展示全部 {controller.references.length} 张；模型实际使用前 {controller.submittedReferenceCount} 张</small></span></div><em>{controller.references.length > 0 ? "已就绪" : "缺少参考"}</em></header>
              <PreviewableImageGroup><div>{controller.references.map((reference, index) => <figure className="checkerboard" key={reference.id}><PreviewableImage nativePixel={reference.nativePixel} src={reference.uri} alt={reference.label ?? `形象参考 ${index + 1}`} /><figcaption><span>#{index + 1}</span>{index < 10 ? <strong><CheckCircle size={12} weight="fill" />参与提交</strong> : <strong>超出模型上限</strong>}</figcaption></figure>)}</div></PreviewableImageGroup>
            </section>
            <section className="generation-style-contract">
              <header><Sparkle size={16} weight="fill" /><span><strong>项目风格段</strong><small>默认继承项目风格，也可以为本次生成选择全局风格或改自由文本</small></span></header>
              <label><span>来源</span><SelectField value={controller.styleProfileId ?? "custom"} onChange={(event) => controller.selectStyle(event.target.value)}>{profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}<option value="custom">自由文本</option></SelectField></label>
              <TextArea rows={5} value={controller.stylePrompt} onChange={(event) => controller.editStylePrompt(event.target.value)} aria-label="本次生成风格提示词" />
              <Checkbox className="generation-default-style-toggle" checked={controller.saveAsProjectDefault} onChange={(event) => controller.setSaveAsProjectDefault(event.target.checked)}><span><strong>同时设为项目默认风格</strong><small>之后生成状态图和过渡视频都会继承这段风格</small></span></Checkbox>
            </section>
            <section className="generation-prompt-segments">
              <header><Code size={16} /><span><strong>提示词组装顺序</strong><small>下面五段按顺序拼接，不再隐藏额外风格词</small></span></header>
              <div>{controller.segments.map((segment, index) => <article key={segment.id}><span>{index + 1}</span><div><strong>{segment.label}</strong><p>{segment.content}</p></div></article>)}</div>
              <details><summary>查看最终完整提示词</summary><pre>{controller.assembledPrompt}</pre></details>
            </section>
            <GenerationCostNotice estimate={estimate} />
            <footer><Dialog.Close asChild><Button type="default" className="secondary-button" htmlType="button">取消</Button></Dialog.Close><Button type="primary" className="primary-button" htmlType="submit" disabled={busy || controller.references.length === 0 || !controller.stylePrompt.trim()}><Sparkle size={16} weight="fill" />确认并提交生成</Button></footer>
          </form>
        </DialogContent>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
