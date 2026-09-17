import type { PersistentJobCost } from "@petlord/generation";
import { CreateEntityDialog } from "./CreateEntityDialog";
import { SelectField, Button, Input, TextArea } from "@petlord/ui";
import {
  Check,
  ClockCounterClockwise,
  Coins,
  FilmStrip,
  ImageSquare,
  Palette,
  PawPrint,
  Play,
  Plus,
  Sparkle,
  SpinnerGap,
} from "@phosphor-icons/react";
import type { StudioController } from "../hooks/useStudioController";
import { useStyleLibraryWorkspace } from "../hooks/useStyleLibraryWorkspace";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";

const revisionSourceLabels = { manual: "手动保存", "image-test": "图片试验", "video-test": "视频试验" } as const;

export function styleExperimentCostLabel(cost?: PersistentJobCost) {
  if (typeof cost?.actualCny === "number" && Number.isFinite(cost.actualCny)) return `实耗 ¥${cost.actualCny.toFixed(2)}`;
  if (typeof cost?.estimatedMaxCny === "number" && Number.isFinite(cost.estimatedMaxCny)) return `预估 ¥${cost.estimatedMaxCny.toFixed(2)}`;
  return "费用未知";
}

export function StyleLibraryWorkspace({ studio }: { studio: StudioController }) {
  const controller = useStyleLibraryWorkspace(studio);
  const profile = controller.selected;
  const lab = controller.experiment;
  return (
    <main className="page-workspace style-library-workspace">
      <header className="page-heading style-library-heading">
        <div><span>风格</span><h1>调试图片与视频规则。</h1><p>用真实形象验证提示词并保存版本。</p></div>
        <CreateEntityDialog label="新增风格" title="新增风格" description="为这套视觉规则起名，创建后继续编辑并验证效果。" fieldLabel="风格名称" placeholder="例如：乡村像素伙伴" onCreate={controller.createStyle} />
      </header>

      <div className="style-library-layout">
        <aside className="style-profile-list">
          <div className="section-title"><h2>风格档案</h2><span>{studio.styleLibrary.profiles.length}</span></div>
          <div className="style-profile-list__items">
            {studio.styleLibrary.profiles.map((candidate) => {
              const active = candidate.id === profile?.id;
              return <button type="button" className={active ? "is-active" : ""} onClick={() => controller.setSelectedId(candidate.id)} key={candidate.id}><Palette size={20} weight={active ? "fill" : "thin"} /><span><strong>{candidate.name}</strong><small>{studio.styleLibrary.projectCounts.get(candidate.id) ?? 0} 个项目 · {candidate.revisions.length} 次试验快照</small></span>{active && <Check size={15} weight="bold" />}</button>;
            })}
          </div>
        </aside>

        {profile && <section className="style-profile-editor">
          <header className="style-profile-editor__header">
            <div><span>当前风格</span><h2>{profile.name}</h2><p>{profile.description}</p></div>
            <div>
              <Button type="default" className="secondary-button" htmlType="button" onClick={() => { studio.styleLibrary.applyProfile(profile.id); studio.setActiveArea("graph"); }}><Sparkle size={15} weight="fill" />应用到当前项目</Button>
              <Button type="primary" className="primary-button" htmlType="button" disabled={!lab.identity} onClick={lab.createStarterProject}><Plus size={15} weight="bold" />创建四状态项目</Button>
            </div>
          </header>

          <div className="style-workbench">
            <section className="style-prompt-console">
              <div className="style-editor-meta">
                <label><span>风格名称</span><Input value={profile.name} onChange={(event) => studio.styleLibrary.updateProfile(profile.id, { name: event.target.value })} /></label>
                <label><span>用途说明</span><Input value={profile.description} onChange={(event) => studio.styleLibrary.updateProfile(profile.id, { description: event.target.value })} /></label>
              </div>
              <article className="prompt-channel prompt-channel--image">
                <header><span><ImageSquare size={17} weight="fill" /><strong>图片通道</strong></span><small>造型、色块、五官、静态构图</small></header>
                <TextArea rows={11} value={profile.imagePrompt} aria-label="图片风格提示词" onChange={(event) => studio.styleLibrary.updateProfile(profile.id, { imagePrompt: event.target.value })} />
              </article>
              <article className="prompt-channel prompt-channel--video">
                <header><span><FilmStrip size={17} weight="fill" /><strong>视频通道</strong></span><small>跨帧身份、线条、色块与动作稳定</small></header>
                <TextArea rows={10} value={profile.videoPrompt} aria-label="视频风格提示词" onChange={(event) => studio.styleLibrary.updateProfile(profile.id, { videoPrompt: event.target.value })} />
              </article>
              <div className="style-budget-editor"><span><Coins size={16} weight="fill" /><strong>试验预算</strong></span><label>¥<Input type="number" min={1} max={500} value={profile.experimentBudgetCny} onChange={(event) => studio.styleLibrary.updateProfile(profile.id, { experimentBudgetCny: Math.max(1, Math.min(500, Number(event.target.value) || 1)) })} /></label></div>
            </section>

            <section className="style-experiment-panel">
              <header><div><span>调试</span><h3>形象实测</h3></div><div className="style-budget-meter"><strong>¥{lab.remainingCny.toFixed(2)}</strong><span>剩余 / ¥{lab.budgetCny.toFixed(2)}</span></div></header>

              <div className="experiment-step">
                <div className="experiment-step__number">01</div>
                <div className="experiment-step__body">
                  <div className="experiment-step__heading"><span><PawPrint size={16} weight="fill" /><strong>选择形象与图片目标</strong></span><small>实际使用身份库素材</small></div>
                  <label><span>调试形象</span><SelectField value={lab.selectedIdentityId} onChange={(event) => lab.setSelectedIdentityId(event.target.value)}>{studio.identities.map((identity) => <option value={identity.id} key={identity.id}>{identity.name} · {identity.referenceArtifacts.length} 份参考</option>)}</SelectField></label>
                  <div className="experiment-inline-fields">
                    <label><span>目标状态</span><Input value={lab.targetStateLabel} onChange={(event) => lab.setTargetStateLabel(event.target.value)} /></label>
                    <label><span>候选数量</span><SelectField value={lab.candidateCount} onChange={(event) => lab.setCandidateCount(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((count) => <option value={count} key={count}>{count} 张</option>)}</SelectField></label>
                  </div>
                  <label><span>本轮状态描述</span><TextArea rows={3} value={lab.statePrompt} onChange={(event) => lab.setStatePrompt(event.target.value)} /></label>
                  <details className="experiment-prompt-preview"><summary>查看图片最终完整提示词</summary><pre>{lab.imagePromptPreview}</pre></details>
                  <div className="experiment-submit-row"><span><small>预计消耗</small><strong>{lab.imageEstimate ? `¥${lab.imageEstimate.maximumCny.toFixed(2)}` : "费用待配置"}</strong></span><Button type="primary" className="primary-button" htmlType="button" disabled={!lab.identity?.referenceArtifacts.length || lab.imageBusy || lab.loading || !lab.imageEstimate} onClick={lab.generateImageTest}>{lab.imageBusy || lab.loading ? <SpinnerGap className="spin" size={16} /> : <Sparkle size={16} weight="fill" />}{lab.imageBusy ? lab.imageStatusLabel : `生成 ${lab.candidateCount} 张图片`}</Button></div>
                </div>
              </div>

              {!lab.imageEstimate && <p className="provider-workspace-footnote">请先在模型服务中配置图片模型与预算预估。<Button type="text" className="text-button" onClick={() => studio.setActiveArea("providers")}>前往配置</Button></p>}
              {lab.imageCandidates.length > 0 && <PreviewableImageGroup><div className="style-result-gallery">{lab.imageCandidates.map((candidate, index) => <article className={lab.selectedImageUri === candidate.uri ? "is-active" : ""} key={candidate.uri}><span className="checkerboard"><PreviewableImage src={candidate.uri} alt={`${profile.name} 图片候选 ${index + 1}`} /></span><button type="button" onClick={() => lab.setSelectedImageUri(candidate.uri)}><strong>候选 {index + 1}</strong>{lab.selectedImageUri === candidate.uri ? <em><Check size={12} weight="bold" />视频起点</em> : <em>选为起点</em>}</button></article>)}</div></PreviewableImageGroup>}

              <div className="experiment-step">
                <div className="experiment-step__number">02</div>
                <div className="experiment-step__body">
                  <div className="experiment-step__heading"><span><FilmStrip size={16} weight="fill" /><strong>测试跨帧稳定性</strong></span><small>480p · 4 秒 · 无声 · 自动透明</small></div>
                  <label><span>测试动作</span><TextArea rows={4} value={lab.videoActionPrompt} onChange={(event) => lab.setVideoActionPrompt(event.target.value)} /></label>
                  <details className="experiment-prompt-preview"><summary>查看视频最终完整提示词</summary><pre>{lab.videoPromptPreview}</pre></details>
                  <div className="experiment-submit-row"><span><small>预计消耗</small><strong>{lab.videoEstimate ? `¥${lab.videoEstimate.maximumCny.toFixed(2)}` : "费用待配置"}</strong></span><Button type="primary" className="primary-button" htmlType="button" disabled={!lab.selectedImageUri || lab.videoBusy || lab.loading || !lab.videoEstimate} onClick={lab.generateVideoTest}>{lab.videoBusy || lab.loading ? <SpinnerGap className="spin" size={16} /> : <Play size={16} weight="fill" />}{lab.videoBusy ? lab.videoStatusLabel : "生成测试视频"}</Button></div>
                </div>
              </div>

              {!lab.videoEstimate && <p className="provider-workspace-footnote">请先在模型服务中配置视频模型与预算预估。<Button type="text" className="text-button" onClick={() => studio.setActiveArea("providers")}>前往配置</Button></p>}
              {lab.latestVideoJob?.result?.video && <div className="style-video-result"><header><span><Check size={14} weight="bold" />最近一次视频试验</span><small>{styleExperimentCostLabel(lab.latestVideoJob.cost)}</small></header><div className="checkerboard"><video src={lab.latestVideoJob.result.video.uri} controls loop muted playsInline /></div><details><summary>查看这次实际使用的提示词</summary><pre>{lab.latestVideoJob.assembledPrompt}</pre></details></div>}
            </section>
          </div>

          <section className="style-revision-history">
            <header><span><ClockCounterClockwise size={17} /><strong>提示词版本</strong></span><small>每次提交试验前自动留档，最多保留 30 版</small></header>
            {profile.revisions.length === 0 ? <p>还没有试验快照。调整提示词并生成一次图片后，这里会出现可恢复版本。</p> : <div>{profile.revisions.slice(0, 8).map((revision) => <article key={revision.id}><span><strong>{revisionSourceLabels[revision.source]}</strong><small>{new Date(revision.createdAt).toLocaleString("zh-CN", { hour12: false })}</small></span><p>{revision.imagePrompt.slice(0, 86)}{revision.imagePrompt.length > 86 ? "…" : ""}</p><Button type="default" htmlType="button" onClick={() => studio.styleLibrary.restoreRevision(profile.id, revision.id)}>恢复</Button></article>)}</div>}
          </section>
        </section>}
      </div>
    </main>
  );
}
