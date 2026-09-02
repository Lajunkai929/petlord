import {
  ArrowsLeftRight,
  ArrowRight,
  Check,
  Code,
  ImageSquare,
  Heartbeat,
  Play,
  Plus,
  Sparkle,
  SpinnerGap,
  SpeakerSlash,
  Square,
  UploadSimple,
  Warning,
  X,
} from "@phosphor-icons/react";
import type {
  AuthorityBridge,
  CharacterProject,
  DragInteraction,
  IdleScheduler,
  IdleTransitionRule,
  PointerGaze,
  TransparencyProcessing,
  Transition,
  TransitionPlayback,
  TransitionTrigger,
} from "@petlord/schema";
import { estimateImageGenerationCost, estimateVideoGenerationCost, type PersistentGenerationJob } from "@petlord/generation";
import { VideoFrameSelector } from "./VideoFrameSelector";
import { TransitionTriggerEditor } from "./TransitionTriggerEditor";
import { GenerationCostNotice } from "./GenerationCostNotice";
import { StateCandidatePicker } from "./StateCandidatePicker";
import { TransitionMediaHistory } from "./TransitionMediaHistory";
import { TransitionPlaybackEditor } from "./TransitionPlaybackEditor";
import { GenerationPromptDialog } from "./GenerationPromptDialog";
import { useInspectorScrollReset } from "../hooks/useInspectorScrollReset";
import { useTransitionGenerationContract } from "../hooks/useTransitionGenerationContract";
import { ensureTransitionMediaVersions, resolveActiveMediaVersion } from "../transitionMedia";
import type { StyleProfile } from "../styleLibrary";
import type { StateGenerationOptions } from "../hooks/useStudioController";
import { StateGenerationDialog } from "./StateGenerationDialog";
import { sourceStateIdFromVariant } from "../projectTemplates";
import { PreviewableImage, PreviewableImageGroup } from "./PreviewableImage";
import { Tooltip } from "antd";
import { StatePointerGazeEditor } from "./StatePointerGazeEditor";
import { DragAnchorEditor } from "./DragAnchorEditor";

type Selection = { kind: "state" | "transition"; id: string } | null;

interface InspectorProps {
  project: CharacterProject;
  styleProfiles: StyleProfile[];
  activeStyleProfileId?: string;
  persistentJobs: PersistentGenerationJob[];
  selection: Selection;
  busy: boolean;
  previewing: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
  onGenerate: (transitionId: string) => void;
  onUploadTransitionVideo: (transitionId: string, file: File) => void;
  onGenerateDraft: (transitionId: string) => void;
  onApprove: (transitionId: string) => void;
  onPreview: (transitionId: string) => void;
  onUpdateTransitionPrompt: (transitionId: string, prompt: string) => void;
  onUpdateTransitionDuration: (transitionId: string, mode: "smart" | "fixed", seconds?: number) => void;
  onUpdateTransitionTransparency: (transitionId: string, transparentVideo: boolean) => void;
  onUpdateTransitionTransparencyProcessing: (transitionId: string, settings: TransparencyProcessing) => void;
  onUpdateTransitionPlayback: (transitionId: string, playback: TransitionPlayback) => void;
  onCreatePingPongTransitionVersion: (transitionId: string, playback: TransitionPlayback) => void;
  onTransparentizeExistingTransition: (transitionId: string) => void;
  onActivateTransitionMediaVersion: (transitionId: string, versionId: string) => void;
  onUpdateTransitionEndFrameSource: (
    transitionId: string,
    source: "authority-reference" | "video-frame",
  ) => void;
  onUpdateTransitionAuthorityBridge: (transitionId: string, bridge: AuthorityBridge) => void;
  onUpdateIdleRule: (transitionId: string, rule: IdleTransitionRule) => void;
  onAddIdleTransition: (stateId: string) => void;
  onUpdateIdleScheduler: (stateId: string, scheduler: IdleScheduler) => void;
  onUpdatePointerGaze: (stateId: string, pointerGaze: PointerGaze) => void;
  onActivatePointerGazeVideo: (stateId: string, artifactId: string) => void;
  onGeneratePointerGazeVideo: (stateId: string) => void;
  onUpdateDragInteraction: (dragInteraction?: DragInteraction) => void;
  onUpdateStateDefinition: (stateId: string, patch: { label?: string; semanticKey?: string; description?: string }) => void;
  onSelectTransition: (transitionId: string) => void;
  onUpdateTransitionTriggers: (transitionId: string, triggers: TransitionTrigger[]) => void;
  onUpdateImageCandidateCount: (count: number) => void;
  onGenerateStateImage: (stateId: string, options?: StateGenerationOptions) => Promise<void>;
  onUploadStateImage: (stateId: string, file: File) => void;
  onActivateStateReference: (stateId: string, artifactId: string) => void;
  onSetInitialStateFromReference: (stateId: string) => void;
  onSetPreferredOutboundVariant: (stateId: string, variantId: string) => void;
  onSelectTransitionFrame: (
    transitionId: string,
    selection: {
      uri: string;
      mimeType: string;
      timeMs: number;
      durationMs: number;
      pixelWidth: number;
      pixelHeight: number;
      hasAlpha: boolean;
    },
  ) => void;
}

function resolveVariantImage(project: CharacterProject, variantId: string) {
  const variant = project.variants.find((candidate) => candidate.id === variantId);
  return project.artifacts.find((artifact) => artifact.id === variant?.imageArtifactId)?.uri;
}

function TransitionInspector({
  project,
  transition,
  busy,
  previewing,
  onGenerate,
  onUploadTransitionVideo,
  onGenerateDraft,
  onApprove,
  onPreview,
  onUpdateTransitionPrompt,
  onUpdateTransitionDuration,
  onUpdateTransitionTransparency,
  onUpdateTransitionTransparencyProcessing,
  onUpdateTransitionPlayback,
  onCreatePingPongTransitionVersion,
  onTransparentizeExistingTransition,
  onActivateTransitionMediaVersion,
  onUpdateTransitionEndFrameSource,
  onUpdateTransitionAuthorityBridge,
  onUpdateIdleRule,
  onUpdateTransitionTriggers,
  onSelectTransitionFrame,
  persistentJobs,
}: Omit<InspectorProps, "selection"> & { transition: Transition }) {
  const source = resolveVariantImage(project, transition.fromVariantId);
  const draft = project.artifacts.find((artifact) => artifact.id === transition.targetDraftArtifactId)?.uri;
  const tail = project.artifacts.find((artifact) => artifact.id === transition.extractedTailArtifactId)?.uri;
  const videoArtifact = project.artifacts.find((artifact) => artifact.id === transition.videoArtifactId);
  const video = videoArtifact?.uri;
  const transparencyProcessing: TransparencyProcessing = transition.transparencyProcessing ?? { keyColor: "#00FF00", similarity: 0.34 };
  const usesSmartMatting = videoArtifact?.transparencyMethod === "apple-vision-foreground-mask";
  const generationContract = useTransitionGenerationContract(project, transition);
  const idleRule: IdleTransitionRule | null = transition.idleRule ? {
    enabled: transition.idleRule.enabled ?? true,
    weight: transition.idleRule.weight ?? 1,
    cooldownMs: transition.idleRule.cooldownMs ?? 0,
  } : null;
  const isIdleTransition = Boolean(idleRule);
  const selectedEnd = transition.endFrameSource === "video-frame" ? tail : transition.endFrameSource === "source-frame" ? source : draft;
  const sourceStateId = sourceStateIdFromVariant(project, transition.fromVariantId);
  const mediaVersions = ensureTransitionMediaVersions(transition, project.artifacts);
  const activeMediaVersion = resolveActiveMediaVersion(transition, project.artifacts);
  const sourceMediaVersion = activeMediaVersion?.sourceVideoArtifactId
    ? mediaVersions.find((version) => version.videoArtifactId === activeMediaVersion.sourceVideoArtifactId)
    : activeMediaVersion;
  const sourcePlaybackVideo = project.artifacts.find((artifact) => artifact.id === sourceMediaVersion?.videoArtifactId);
  const playbackSourceDurationMs = sourceMediaVersion?.durationMs ?? transition.sourceVideoDurationMs ?? transition.durationMs;
  const isSelfTransition = sourceStateId === transition.toLogicalStateId;
  const activeJob = persistentJobs.find(
    (job) => job.trigger.entityType === "transition" && job.trigger.entityId === transition.id &&
      ["queued", "submitting", "running"].includes(job.status),
  );
  const costEstimate = estimateVideoGenerationCost({
    model: project.generationSettings.videoModel,
    resolution: project.generationSettings.videoResolution,
    durationMode: transition.durationMode,
    durationSeconds: transition.durationSeconds,
  });

  return (
    <div className="inspector-content">
      <header className="inspector-header">
        <span>转换动画</span>
        <h2>{transition.label}</h2>
      </header>

      <section className="transition-end-source is-prominent">
        <div><strong>结束画面</strong></div>
        {isIdleTransition
          ? <div className="idle-return-lock"><Heartbeat size={14} weight="fill" /><span>源帧</span></div>
          : <div role="group" aria-label="视频结束后停留画面">
              <button className={transition.endFrameSource === "authority-reference" ? "is-active" : ""} type="button" onClick={() => onUpdateTransitionEndFrameSource(transition.id, "authority-reference")}><strong>权威参考图</strong></button>
              <button className={transition.endFrameSource === "video-frame" ? "is-active" : ""} type="button" onClick={() => onUpdateTransitionEndFrameSource(transition.id, "video-frame")}><strong>视频选帧</strong></button>
            </div>}
      </section>

      <PreviewableImageGroup><div className="endpoint-pair">
        <figure className="endpoint-frame checkerboard">
          {source && <PreviewableImage src={source} alt="转换起始实际状态" />}
          <figcaption>起始实际展示图</figcaption>
        </figure>
        <ArrowRight className="endpoint-arrow" size={20} aria-hidden="true" />
        <figure className="endpoint-frame checkerboard">
          {(selectedEnd ?? draft ?? tail) && <PreviewableImage src={selectedEnd ?? draft ?? tail} alt="转换目标状态" />}
          <figcaption>{transition.endFrameSource === "video-frame" ? "视频选帧 · 实际结束图" : transition.endFrameSource === "source-frame" ? "回到源实际静态图" : "权威参考 · 实际结束图"}</figcaption>
        </figure>
      </div></PreviewableImageGroup>

      <section className="authority-bridge-settings">
          <div className="authority-bridge-heading"><div><strong>收口方式</strong></div></div>
          <div className="authority-bridge-modes" role="group" aria-label="权威收口方式">
            <button className={transition.authorityBridge.mode === "crossfade" ? "is-active" : ""} type="button" onClick={() => onUpdateTransitionAuthorityBridge(transition.id, { ...transition.authorityBridge, mode: "crossfade" })}>叠化</button>
            <button className={transition.authorityBridge.mode === "blur-dissolve" ? "is-active" : ""} type="button" onClick={() => onUpdateTransitionAuthorityBridge(transition.id, { ...transition.authorityBridge, mode: "blur-dissolve" })}>稳定叠化</button>
            <button className={transition.authorityBridge.mode === "hard-cut" ? "is-active" : ""} type="button" onClick={() => onUpdateTransitionAuthorityBridge(transition.id, { ...transition.authorityBridge, mode: "hard-cut" })}>硬切</button>
          </div>
          {transition.authorityBridge.mode !== "hard-cut" && (
            <label className="authority-bridge-duration">稳定收口时长
              <select value={transition.authorityBridge.durationMs} onChange={(event) => onUpdateTransitionAuthorityBridge(transition.id, { ...transition.authorityBridge, durationMs: Number(event.target.value) })}>
                {[120, 180, 240, 360, 420, 500, 700, 1000, 1200, 1500].map((duration) => <option key={duration} value={duration}>{(duration / 1000).toFixed(2)} 秒</option>)}
              </select>
            </label>
          )}
        </section>

      {idleRule && (
        <section className="idle-rule-settings">
          <div className="idle-rule-heading"><div><Heartbeat size={16} weight="fill" /><strong>待机调度参数</strong></div><label><input type="checkbox" checked={idleRule.enabled} onChange={(event) => onUpdateIdleRule(transition.id, { ...idleRule, enabled: event.target.checked })} />启用</label></div>
          <div className="idle-rule-grid">
            <label>权重<select value={idleRule.weight} onChange={(event) => onUpdateIdleRule(transition.id, { ...idleRule, weight: Number(event.target.value) })}>{[1, 2, 3, 4, 5, 8, 10].map((weight) => <option value={weight} key={weight}>{weight}</option>)}</select></label>
            <label>冷却时间<select value={idleRule.cooldownMs} onChange={(event) => onUpdateIdleRule(transition.id, { ...idleRule, cooldownMs: Number(event.target.value) })}>{[0, 10_000, 20_000, 30_000, 60_000, 120_000].map((cooldown) => <option value={cooldown} key={cooldown}>{cooldown === 0 ? "无" : `${cooldown / 1000} 秒`}</option>)}</select></label>
          </div>
        </section>
      )}

      <TransitionPlaybackEditor
        transitionId={transition.id}
        playback={transition.playback}
        sourceDurationMs={playbackSourceDurationMs}
        sourceVideoUri={sourcePlaybackVideo?.uri}
        isSelfTransition={isSelfTransition}
        hasVideo={Boolean(sourcePlaybackVideo)}
        busy={busy}
        onUpdate={(playback) => onUpdateTransitionPlayback(transition.id, playback)}
        onCreatePingPong={(playback) => onCreatePingPongTransitionVersion(transition.id, playback)}
        onUseForward={() => sourceMediaVersion && onActivateTransitionMediaVersion(transition.id, sourceMediaVersion.id)}
      />

      <TransitionTriggerEditor
        sourceImage={source}
        triggers={transition.triggers}
        onChange={(triggers) => onUpdateTransitionTriggers(transition.id, triggers)}
      />

      <div className="field-block">
        <label htmlFor="transition-prompt">动作提示词</label>
        <textarea
          id="transition-prompt"
          value={transition.prompt}
          rows={4}
          onChange={(event) => onUpdateTransitionPrompt(transition.id, event.target.value)}
        />
      </div>

      <section className="generation-contract-preview">
        <div><Code size={16} weight="fill" /><span><strong>Seedance 提示词</strong></span></div>
        <div className="generation-contract-key"><i style={{ "--video-key-color": generationContract.chromaBackgroundColor } as React.CSSProperties} /><span>本次抠图底色</span><strong>{generationContract.chromaBackgroundColor}</strong></div>
        <GenerationPromptDialog title={`${transition.label} · 生成前提示词`} prompt={generationContract.prompt} model={project.generationSettings.videoModel} chromaKeyColor={generationContract.chromaBackgroundColor} />
      </section>

      <div className="field-block transition-duration-field">
        <label htmlFor="transition-duration">动画时长</label>
        <select
          id="transition-duration"
          value={transition.durationMode === "smart" ? "smart" : String(transition.durationSeconds ?? 4)}
          onChange={(event) => {
            if (event.target.value === "smart") onUpdateTransitionDuration(transition.id, "smart");
            else onUpdateTransitionDuration(transition.id, "fixed", Number(event.target.value));
          }}
        >
          <option value="smart">智能时长</option>
          {[4, 5, 6, 8, 10, 12, 15].map((seconds) => <option key={seconds} value={seconds}>{seconds} 秒</option>)}
        </select>
      </div>

      <section className="transition-output-settings">
        <div className="transition-output-contract">
          <span><SpeakerSlash size={14} weight="fill" />强制无声</span>
          <span><Square size={14} weight="fill" />{project.generationSettings.videoResolution} · 1:1</span>
        </div>
        <button
          className={`transparent-video-toggle ${transition.transparentVideo ? "is-active" : ""}`}
          type="button"
          role="switch"
          aria-checked={transition.transparentVideo}
          onClick={() => onUpdateTransitionTransparency(transition.id, !transition.transparentVideo)}
        >
          <span><strong>自动透明化</strong></span>
          <i aria-hidden="true" />
        </button>
        {videoArtifact && (
          <div className={`existing-video-transparency ${usesSmartMatting ? "is-complete" : ""}`}>
            <div><strong>{usesSmartMatting ? "透明处理已完成" : videoArtifact.hasAlpha ? "重新处理透明背景" : "处理当前视频"}</strong></div>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => onTransparentizeExistingTransition(transition.id)}>{busy ? <SpinnerGap className="spin" size={15} /> : <Sparkle size={15} weight="fill" />}{busy ? "正在逐帧识别宠物主体" : usesSmartMatting ? "重新智能抠图" : "用 Apple Vision 智能抠图"}</button>
            <details className="chroma-fallback-settings"><summary>非 macOS 降级参数</summary><div className="chroma-settings">
              <label>参考色<input type="color" value={transparencyProcessing.keyColor} onChange={(event) => onUpdateTransitionTransparencyProcessing(transition.id, { ...transparencyProcessing, keyColor: event.target.value.toUpperCase() })} /></label>
              <label>抠除强度<select value={transparencyProcessing.similarity} onChange={(event) => onUpdateTransitionTransparencyProcessing(transition.id, { ...transparencyProcessing, similarity: Number(event.target.value) })}>{[0.18, 0.26, 0.34, 0.45, 0.6].map((similarity) => <option value={similarity} key={similarity}>{Math.round(similarity * 100)}%</option>)}</select></label>
            </div></details>
          </div>
        )}
      </section>

      <TransitionMediaHistory project={project} transition={transition} onActivate={(versionId) => onActivateTransitionMediaVersion(transition.id, versionId)} />

      {activeJob && (
        <div className="generation-progress" role="status">
          <div>
            <SpinnerGap className="spin" size={16} aria-hidden="true" />
            <strong>正在生成转换视频</strong>
            <span>{activeJob.progress}%</span>
          </div>
          <div className="generation-progress__track">
            <i style={{ transform: `scaleX(${activeJob.progress / 100})` }} />
          </div>
            </div>
      )}

      {transition.status === "review" && video && !isIdleTransition && (
        <VideoFrameSelector
          videoUri={video}
          initialTimeMs={transition.selectedEndMs ?? transition.sourceVideoDurationMs}
          selectedFrameUri={tail}
          hasAlpha={Boolean(videoArtifact.hasAlpha)}
          onSelect={(frame) => onSelectTransitionFrame(transition.id, frame)}
        />
      )}

      <GenerationCostNotice estimate={costEstimate} />

      <div className="inspector-actions">
        {transition.status === "draft" ? (
          <button className="primary-button" type="button" disabled={busy} onClick={() => onGenerateDraft(transition.id)}>
            {busy ? <SpinnerGap className="spin" size={17} /> : <ImageSquare size={17} weight="fill" />}
            生成目标权威参考图
          </button>
        ) : transition.status === "review" ? (
          <>
            <button className="primary-button" type="button" onClick={() => onApprove(transition.id)}>
              <Check size={17} weight="bold" />{isIdleTransition ? "批准待机动画" : "批准并新增实际变体"}
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={() => onGenerate(transition.id)}>
              {busy ? <SpinnerGap className="spin" size={17} /> : <Sparkle size={17} weight="fill" />}重新生成新版本
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            type="button"
            disabled={busy}
            onClick={() => onGenerate(transition.id)}
          >
            {busy ? <SpinnerGap className="spin" size={17} /> : <Sparkle size={17} weight="fill" />}
            {transition.status === "approved" ? "重新生成" : "生成转换视频"}
          </button>
        )}
        <button
          className="secondary-button"
          type="button"
          disabled={!transition.videoArtifactId || previewing}
          onClick={() => onPreview(transition.id)}
        >
          <Play size={16} weight="fill" />{previewing ? "正在预览" : "预览完整过渡"}
        </button>
        <label className="secondary-button file-button">
          <UploadSimple size={16} />上传视频
          <input type="file" accept="video/mp4,video/webm" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUploadTransitionVideo(transition.id, file);
            event.target.value = "";
          }} />
        </label>
      </div>

      {transition.status === "review" && (
        <div className="inline-notice is-warning">
          <Warning size={17} weight="fill" />
          <p>{isIdleTransition ? "批准后会按待机调度规则播放，并在结束时回到原实际静态帧。" : "权威参考图会继续保留；你选中的视频画面会新增为一个实际展示变体。"}</p>
        </div>
      )}
    </div>
  );
}

export function Inspector(props: InspectorProps) {
  const { project, selection } = props;
  const inspectorRef = useInspectorScrollReset(selection ? `${selection.kind}:${selection.id}` : "none");
  if (!selection) {
    return (
      <aside ref={inspectorRef} className={`inspector-panel empty-inspector ${props.mobileOpen ? "is-mobile-open" : ""}`}>
        <button className="mobile-inspector-close" type="button" onClick={props.onMobileClose} aria-label="关闭编辑面板"><X size={17} /></button>
        <Sparkle size={28} weight="thin" aria-hidden="true" />
        <h2>选择一个节点或动画</h2>
      </aside>
    );
  }

  if (selection.kind === "transition") {
    const transition = project.transitions.find((candidate) => candidate.id === selection.id);
    return (
      <aside ref={inspectorRef} className={`inspector-panel ${props.mobileOpen ? "is-mobile-open" : ""}`}>
        <button className="mobile-inspector-close" type="button" onClick={props.onMobileClose} aria-label="关闭编辑面板"><X size={17} /></button>
        {transition ? <TransitionInspector {...props} transition={transition} /> : null}
      </aside>
    );
  }

  const state = project.logicalStates.find((candidate) => candidate.id === selection.id);
  const variants = project.variants.filter((variant) => variant.logicalStateId === selection.id);
  const reference = project.artifacts.find((artifact) => artifact.id === state?.referenceArtifactId);
  const references = (state?.referenceArtifactIds ?? [])
    .map((id) => project.artifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact));
  const activeStateJob = props.persistentJobs.find(
    (job) => job.trigger.entityType === "state" && job.trigger.entityId === state?.id &&
      ["queued", "submitting", "running"].includes(job.status),
  );
  const allCandidates = project.artifacts
    .filter((artifact) => artifact.kind === "state-draft" && artifact.targetStateId === state?.id && artifact.candidateGroupId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const latestCandidateGroupId = allCandidates[0]?.candidateGroupId;
  const candidates = allCandidates
    .filter((artifact) => artifact.candidateGroupId === latestCandidateGroupId)
    .sort((left, right) => (left.candidateIndex ?? 0) - (right.candidateIndex ?? 0));
  const imageCostEstimate = estimateImageGenerationCost(
    project.generationSettings.imageModel,
    project.generationSettings.imageCandidateCount,
  );
  const gazeVideos = (state?.pointerGaze?.videoArtifactIds ?? [])
    .map((id) => project.artifacts.find((artifact) => artifact.id === id))
    .filter((artifact): artifact is NonNullable<typeof artifact> => Boolean(artifact));
  const activeGazeJob = props.persistentJobs.find((job) =>
    job.trigger.entityType === "pointer-gaze" && job.trigger.entityId === state?.id &&
    ["queued", "submitting", "running"].includes(job.status));
  const gazeCostEstimate = estimateVideoGenerationCost({
    model: project.generationSettings.videoModel,
    resolution: project.generationSettings.videoResolution,
    durationMode: "fixed",
    durationSeconds: 6,
  });
  const idleTransitions = project.transitions.filter((transition) => {
    return transition.idleRule && sourceStateIdFromVariant(project, transition.fromVariantId) === state?.id && transition.toLogicalStateId === state?.id;
  });
  const relatedTransitions = project.transitions.filter((transition) => {
    if (transition.idleRule) return false;
    return sourceStateIdFromVariant(project, transition.fromVariantId) === state?.id || transition.toLogicalStateId === state?.id;
  });
  const stateDefaultVariant = variants.find((variant) => variant.id === state?.defaultVariantId) ?? variants[0];
  const stateDisplayImage = stateDefaultVariant ? resolveVariantImage(project, stateDefaultVariant.id) : reference?.uri;
  return (
    <aside ref={inspectorRef} className={`inspector-panel ${props.mobileOpen ? "is-mobile-open" : ""}`}>
      <button className="mobile-inspector-close" type="button" onClick={props.onMobileClose} aria-label="关闭编辑面板"><X size={17} /></button>
      <div className="inspector-content">
        <header className="inspector-header">
          <span>逻辑状态</span>
          <h2>{state?.label}</h2>
        </header>
        <div className="state-meta-grid">
          <div><span>语义动作</span><strong>{state?.semanticKey ?? "未映射"}</strong></div>
          <div><span>展示变体</span><strong>{variants.length}</strong></div>
        </div>
        {state && <details className="state-definition-editor"><summary>状态定义</summary><label><span>名称</span><input value={state.label} onChange={(event) => props.onUpdateStateDefinition(state.id, { label: event.target.value })} /></label><label><span>语义</span><input value={state.semanticKey ?? ""} onChange={(event) => props.onUpdateStateDefinition(state.id, { semanticKey: event.target.value || undefined })} /></label><label><span>生成说明</span><textarea rows={5} value={state.description} onChange={(event) => props.onUpdateStateDefinition(state.id, { description: event.target.value })} /></label></details>}
        {state && <StatePointerGazeEditor
          value={state.pointerGaze}
          videos={gazeVideos}
          activeJob={activeGazeJob}
          estimate={gazeCostEstimate}
          busy={props.busy}
          onChange={(pointerGaze) => props.onUpdatePointerGaze(state.id, pointerGaze)}
          onActivateVideo={(artifactId) => props.onActivatePointerGazeVideo(state.id, artifactId)}
          onGenerate={() => props.onGeneratePointerGazeVideo(state.id)}
        />}
        {state && <DragAnchorEditor
          stateId={state.id}
          stateLabel={state.label}
          sourceImage={stateDisplayImage}
          value={project.dragInteraction}
          onChange={props.onUpdateDragInteraction}
        />}
        {state && (
          <section className="idle-scheduler-section">
            <div className="idle-scheduler-heading"><div><Heartbeat size={18} weight="fill" /><div><strong>待机动画</strong></div></div><button type="button" onClick={() => props.onAddIdleTransition(state.id)}><Plus size={14} weight="bold" />添加</button></div>
            <label className="idle-scheduler-toggle"><span><strong>启用自动调度</strong><small>{idleTransitions.length} 条自循环动画</small></span><input type="checkbox" checked={state.idleScheduler.enabled} onChange={(event) => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, enabled: event.target.checked })} /></label>
            <div className="idle-playback-switch" role="group" aria-label="待机动画播放模式">
              <button className={(state.idleScheduler.playbackMode ?? "interval") === "interval" ? "is-active" : ""} type="button" onClick={() => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, playbackMode: "interval", minIntervalMs: Math.max(3_000, state.idleScheduler.minIntervalMs), maxIntervalMs: Math.max(5_000, state.idleScheduler.maxIntervalMs) })}>间隔播放</button>
              <button className={state.idleScheduler.playbackMode === "continuous" ? "is-active" : ""} type="button" onClick={() => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, playbackMode: "continuous" })}>连续播放</button>
            </div>
            <div className="idle-strategy-switch" role="group" aria-label="待机动画选择策略">
              <button className={state.idleScheduler.strategy === "weighted-random" ? "is-active" : ""} type="button" onClick={() => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, strategy: "weighted-random" })}>加权随机</button>
              <button className={state.idleScheduler.strategy === "weighted-round-robin" ? "is-active" : ""} type="button" onClick={() => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, strategy: "weighted-round-robin" })}>加权轮询</button>
            </div>
            {(state.idleScheduler.playbackMode ?? "interval") === "interval" ? <div className="idle-interval-grid">
              <label>最短间隔<select value={state.idleScheduler.minIntervalMs} onChange={(event) => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, minIntervalMs: Number(event.target.value), maxIntervalMs: Math.max(Number(event.target.value), state.idleScheduler.maxIntervalMs) })}>{[3000, 5000, 8000, 10_000, 15_000, 30_000, 60_000].map((interval) => <option key={interval} value={interval}>{interval / 1000} 秒</option>)}</select></label>
              <label>最长间隔<select value={state.idleScheduler.maxIntervalMs} onChange={(event) => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, maxIntervalMs: Number(event.target.value), minIntervalMs: Math.min(Number(event.target.value), state.idleScheduler.minIntervalMs) })}>{[5000, 8000, 10_000, 18_000, 30_000, 60_000, 120_000].map((interval) => <option key={interval} value={interval}>{interval / 1000} 秒</option>)}</select></label>
            </div> : null}
            <label className="idle-repeat-option"><input type="checkbox" checked={state.idleScheduler.avoidImmediateRepeat} onChange={(event) => props.onUpdateIdleScheduler(state.id, { ...state.idleScheduler, avoidImmediateRepeat: event.target.checked })} />避免连续重复</label>
            {idleTransitions.length > 0 && <div className="idle-transition-list">{idleTransitions.map((transition) => <button type="button" key={transition.id} onClick={() => props.onSelectTransition(transition.id)}><span><strong>{transition.label}</strong><small>{transition.status === "approved" ? "已批准" : "待生成"}</small></span><em>{transition.idleRule?.weight ?? 1}×</em></button>)}</div>}
          </section>
        )}
        {state && relatedTransitions.length > 0 && (
          <section className="related-transition-section">
            <div className="related-transition-heading"><ArrowsLeftRight size={17} weight="fill" /><div><strong>相关过渡</strong></div></div>
            <div className="related-transition-list">{relatedTransitions.map((transition) => {
              const sourceState = project.logicalStates.find((candidate) => candidate.id === sourceStateIdFromVariant(project, transition.fromVariantId));
              const targetState = project.logicalStates.find((candidate) => candidate.id === transition.toLogicalStateId);
              return <button type="button" key={transition.id} onClick={() => props.onSelectTransition(transition.id)}><span className="related-transition-direction">{sourceState?.label ?? "未知"}<ArrowsLeftRight size={11} />{targetState?.label ?? "未知"}</span><strong>{transition.label}</strong></button>;
            })}</div>
          </section>
        )}
        <PreviewableImageGroup><section className="variant-section">
          <h3>展示图</h3>
          {variants.length === 0 ? (
            <div className="variant-empty">
              <ImageSquare size={24} weight="thin" />
              <p>生成或上传参考图</p>
            </div>
          ) : (
            variants.map((variant) => (
              <div className="variant-row" key={variant.id}>
                <PreviewableImage src={resolveVariantImage(project, variant.id)} alt={`${variant.label}预览`} />
                <div><strong>{variant.label}</strong><span>{variant.origin.kind === "reference" ? "权威参考 · 状态默认" : variant.origin.kind === "initial" ? "历史初始展示图" : "过渡视频选帧"}</span></div>
                <span className="variant-row-actions">
                  {variant.id === state?.defaultVariantId && <Check size={15} weight="bold" aria-label="状态默认展示图" />}
                  <Tooltip title="设为过渡起点"><button className={variant.id === state?.preferredOutboundVariantId ? "is-active" : ""} type="button" onClick={() => state && props.onSetPreferredOutboundVariant(state.id, variant.id)}><ArrowRight size={14} weight="bold" /></button></Tooltip>
                </span>
              </div>
            ))
          )}
        </section></PreviewableImageGroup>
        {state && (
          <PreviewableImageGroup><section className="state-reference-section">
            <div className="state-reference-heading">
              <h3>状态权威参考图</h3>
              <span>{reference ? "已就绪" : "未创建"}</span>
            </div>
            {reference ? (
              <figure className="state-reference-preview checkerboard">
                <PreviewableImage src={reference.uri} alt={`${state.label}状态参考图`} />
              </figure>
            ) : (
              <div className="variant-empty compact-empty">
                <ImageSquare size={24} weight="thin" />
                <p>生成或上传参考图</p>
              </div>
            )}
            {references.length > 0 && (
              <div className="reference-history">
                <div><strong>参考版本</strong><span>{references.length}</span></div>
                <div className="reference-history-list">
                  {references.map((artifact, index) => (
                    <article
                      className={artifact.id === state.referenceArtifactId ? "is-active" : ""}
                      key={artifact.id}
                    >
                      <PreviewableImage src={artifact.uri} alt={artifact.label ?? `参考版本 ${index + 1}`} />
                      <button type="button" onClick={() => props.onActivateStateReference(state.id, artifact.id)} title={`设为当前参考：${artifact.label ?? `版本 ${index + 1}`}`}>v{index + 1}</button>
                    </article>
                  ))}
                </div>
              </div>
            )}
            {reference && state.defaultVariantId !== project.initialVariantId && (
              <button className="initial-state-button" type="button" onClick={() => props.onSetInitialStateFromReference(state.id)}><Check size={15} weight="bold" /><span><strong>设为启动状态</strong></span></button>
            )}
            {activeStateJob && (
              <div className="generation-progress" role="status">
                <div><SpinnerGap className="spin" size={16} /><strong>正在生成状态参考</strong><span>{activeStateJob.progress}%</span></div>
                <div className="generation-progress__track"><i style={{ transform: `scaleX(${activeStateJob.progress / 100})` }} /></div>
              </div>
            )}
            <StateCandidatePicker
              candidates={candidates}
              activeArtifactId={state.referenceArtifactId}
              onSelect={(artifactId) => props.onActivateStateReference(state.id, artifactId)}
            />
            <div className="candidate-count-field">
              <div><strong>生成数量</strong></div>
              <div>{[1, 2, 3, 4, 5].map((count) => <button type="button" className={project.generationSettings.imageCandidateCount === count ? "is-active" : ""} key={count} onClick={() => props.onUpdateImageCandidateCount(count)}>{count}</button>)}</div>
            </div>
            <GenerationCostNotice estimate={imageCostEstimate} />
            <div className="state-reference-actions">
              <StateGenerationDialog project={project} state={state} profiles={props.styleProfiles} activeStyleProfileId={props.activeStyleProfileId} busy={props.busy} onGenerate={props.onGenerateStateImage} />
              <label className="secondary-button file-button">
                <UploadSimple size={16} />上传图片
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) props.onUploadStateImage(state.id, file);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>
          </section></PreviewableImageGroup>
        )}
      </div>
    </aside>
  );
}
