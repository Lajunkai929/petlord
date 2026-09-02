import { lazy, Suspense } from "react";
import { ConfigProvider } from "antd";
import {
  ArrowClockwise,
  BellSimple,
  CheckCircle,
  ChatCenteredText,
  CloudCheck,
  Cube,
  DownloadSimple,
  Eye,
  Graph,
  ImageSquare,
  Moon,
  Package,
  Palette,
  Plus,
  PuzzlePiece,
  Queue,
  SpinnerGap,
  SquaresFour,
  Sun,
  TextAa,
} from "@phosphor-icons/react";
import type { CharacterProject, CustomerOrder } from "@petlord/schema";
import { AddStateDialog } from "./components/AddStateDialog";
import { GenerationSettingsDialog } from "./components/GenerationSettingsDialog";
import { TaskCenter } from "./components/TaskCenter";
import { useStudioController, type StudioController } from "./hooks/useStudioController";
import { usePublishPackage } from "./hooks/usePublishPackage";
import { useBatchProduction } from "./hooks/useBatchProduction";
import { useAutomaticProduction } from "./hooks/useAutomaticProduction";
import { studioAntdTheme } from "./uiTheme";

const GraphWorkspace = lazy(() =>
  import("./components/GraphWorkspace").then((module) => ({ default: module.GraphWorkspace })),
);
const Inspector = lazy(() =>
  import("./components/Inspector").then((module) => ({ default: module.Inspector })),
);
const RuntimePreviewWorkspace = lazy(() =>
  import("./components/RuntimePreviewWorkspace").then((module) => ({ default: module.RuntimePreviewWorkspace })),
);
const TransitionContinuityPreview = lazy(() =>
  import("./components/TransitionContinuityPreview").then((module) => ({ default: module.TransitionContinuityPreview })),
);
const OrderWorkspace = lazy(() =>
  import("./components/OrderWorkspace").then((module) => ({ default: module.OrderWorkspace })),
);
const ReviewWorkspace = lazy(() =>
  import("./components/ReviewWorkspace").then((module) => ({ default: module.ReviewWorkspace })),
);
const IdentityLibraryWorkspace = lazy(() =>
  import("./components/IdentityLibraryWorkspace").then((module) => ({ default: module.IdentityLibraryWorkspace })),
);
const StyleLibraryWorkspace = lazy(() =>
  import("./components/StyleLibraryWorkspace").then((module) => ({ default: module.StyleLibraryWorkspace })),
);
const PluginWorkspace = lazy(() =>
  import("./components/PluginWorkspace").then((module) => ({ default: module.PluginWorkspace })),
);
const ProjectStylePanel = lazy(() =>
  import("./components/ProjectStylePanel").then((module) => ({ default: module.ProjectStylePanel })),
);
const BatchProductionDialog = lazy(() =>
  import("./components/BatchProductionDialog").then((module) => ({ default: module.BatchProductionDialog })),
);
const AutomaticProductionDialog = lazy(() =>
  import("./components/AutomaticProductionDialog").then((module) => ({ default: module.AutomaticProductionDialog })),
);
const SaveProjectTemplateDialog = lazy(() =>
  import("./components/SaveProjectTemplateDialog").then((module) => ({ default: module.SaveProjectTemplateDialog })),
);
const ToastHost = lazy(() => import("./components/ToastHost").then((module) => ({ default: module.ToastHost })));

export function App() {
  const studio = useStudioController();
  return (
    <ConfigProvider componentSize="small" theme={studioAntdTheme(studio.theme)}>
    <div className="app-shell">
      <Suspense fallback={null}><ToastHost theme={studio.theme} /></Suspense>
      <StudioRail studio={studio} />
      <div className="app-main">
        <StudioTopbar studio={studio} />
        {studio.activeArea === "orders" && <Suspense fallback={<div className="graph-loading"><SquaresFour size={24} /><span>正在载入项目</span></div>}><OrderWorkspace projects={studio.projects} identities={studio.identities} styles={studio.styleLibrary.profiles} templates={studio.templateLibrary.templates} activeIdentityId={studio.activeIdentity?.id} activeStyleProfileId={studio.styleLibrary.activeProfileId} currentProject={studio.project} storageError={studio.workspaceStorageError} onOpenProject={studio.activateCustomerProject} onCreate={studio.createCustomerProject} /></Suspense>}
        {studio.activeArea === "graph" && <GraphArea studio={studio} />}
        {studio.activeArea === "identity" && <Suspense fallback={<PreviewLoading />}><IdentityLibraryWorkspace studio={studio} /></Suspense>}
        {studio.activeArea === "style" && <Suspense fallback={<PreviewLoading />}><StyleLibraryWorkspace studio={studio} /></Suspense>}
        {studio.activeArea === "preview" && <Suspense fallback={<PreviewLoading />}><RuntimePreviewWorkspace key={`${studio.project.id}:${studio.previewSessionRevision}`} project={studio.project} onEdit={() => studio.setActiveArea("graph")} /></Suspense>}
        {studio.activeArea === "review" && <Suspense fallback={<PreviewLoading />}><ReviewWorkspace project={studio.project} controller={studio.customerReview} /></Suspense>}
        {studio.activeArea === "plugins" && <Suspense fallback={<PreviewLoading />}><PluginWorkspace studio={studio} /></Suspense>}
        {studio.activeArea === "publish" && <PublishWorkspace project={studio.project} onUpdateOrder={studio.updateOrder} />}
      </div>
      <TaskCenter
        open={studio.taskCenterOpen}
        jobs={studio.allJobs}
        onClose={() => studio.setTaskCenterOpen(false)}
        onNavigate={studio.navigateToJob}
      />
    </div>
    </ConfigProvider>
  );
}

function StudioRail({ studio }: { studio: StudioController }) {
  const creationAreaActive = studio.activeArea === "graph" || studio.activeArea === "preview" || studio.activeArea === "publish";
  return (
    <aside className="app-rail">
      <button className="brand-mark" type="button" aria-label="PetLord Studio" onClick={() => studio.setActiveArea("graph")}>
        <Cube size={23} weight="fill" />
      </button>
      <nav aria-label="创作平台导航">
        <button className={studio.activeArea === "orders" ? "is-active" : ""} onClick={() => studio.setActiveArea("orders")} title="项目库">
          <SquaresFour size={21} /><span>项目</span>
        </button>
        <button className={studio.activeArea === "identity" ? "is-active" : ""} onClick={() => studio.setActiveArea("identity")} title="全局形象库">
          <ImageSquare size={21} /><span>形象</span>
        </button>
        <button className={studio.activeArea === "style" ? "is-active" : ""} onClick={() => studio.setActiveArea("style")} title="全局风格库">
          <Palette size={21} /><span>风格</span>
        </button>
        <button className={creationAreaActive ? "is-active" : ""} onClick={() => studio.setActiveArea("graph")} title="创作">
          <Graph size={21} /><span>创作</span>
        </button>
        <button className={studio.activeArea === "review" ? "is-active" : ""} onClick={() => studio.setActiveArea("review")} title="素材评审">
          <ChatCenteredText size={21} /><span>评审</span>
        </button>
        <button className={studio.activeArea === "plugins" ? "is-active" : ""} onClick={() => studio.setActiveArea("plugins")} title="插件与二次开发">
          <PuzzlePiece size={21} /><span>插件</span>
        </button>
      </nav>
      <div className="rail-bottom">
        <button type="button" onClick={studio.toggleTheme} title="切换主题">
          {studio.theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}<span>主题</span>
        </button>
      </div>
    </aside>
  );
}

function StudioTopbar({ studio }: { studio: StudioController }) {
  return (
    <header className="topbar">
      <div className="project-switcher">
        <button type="button" aria-label="返回项目库" title="返回项目库" onClick={() => studio.setActiveArea("orders")}><SquaresFour size={17} weight="fill" /></button>
        <label><span>当前项目</span><select aria-label="切换当前项目" value={studio.project.id} onChange={(event) => studio.activateCustomerProject(event.target.value)}>{studio.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
      </div>
      <nav className="topbar-primary-actions" aria-label="创作视图">
        <button className={studio.activeArea === "graph" ? "is-active" : ""} type="button" onClick={() => studio.setActiveArea("graph")}><Graph size={16} />编辑</button>
        <button className={studio.activeArea === "preview" ? "is-active" : ""} type="button" onClick={() => studio.setActiveArea("preview")}><Eye size={16} />预览</button>
        <button className={studio.activeArea === "publish" ? "is-active" : ""} type="button" onClick={() => studio.setActiveArea("publish")}><Package size={16} />发布</button>
      </nav>
      <div className="topbar-status">
        <span className={studio.apiConfigured === false ? "is-offline" : ""}><CloudCheck size={16} weight="fill" />{studio.apiConfigured === null ? "检查生成服务" : studio.apiConfigured ? "生成服务已连接" : "生成服务未配置"}</span>
        <label className="font-size-control" title="调整整个创作平台的界面字号">
          <TextAa size={16} weight="bold" />
          <select aria-label="界面字号" value={studio.appearance.fontSize} onChange={(event) => studio.appearance.setFontSize(event.target.value as typeof studio.appearance.fontSize)}>
            {studio.appearance.fontSizeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        </label>
        <button className="icon-button queue-button" type="button" title="生成任务中心" onClick={() => studio.setTaskCenterOpen(true)}>
          <Queue size={19} />
          {studio.allActiveJobs.length > 0 && <b>{studio.allActiveJobs.length}</b>}
        </button>
      </div>
    </header>
  );
}

function GraphArea({ studio }: { studio: StudioController }) {
  const batch = useBatchProduction(studio.project, {
    generateState: studio.generateStateImage,
    generateTransition: studio.generateTransition,
    transparentize: studio.transparentizeExistingTransition,
    approve: studio.approveTransition,
  });
  const automatic = useAutomaticProduction(studio.project, studio.projectJobs, studio.busy, {
    generateState: (stateId) => studio.generateStateImage(stateId, { throwOnFailure: true }),
    activateStateReference: studio.activateStateReference,
    generateTransition: (transitionId) => studio.generateTransition(transitionId, true),
    approveTransition: (transitionId) => studio.approveTransition(transitionId, true),
  });
  return (
    <div className="graph-layout">
      <aside className="library-panel">
        <Suspense fallback={null}><ProjectStylePanel studio={studio} /></Suspense>
        <div className="panel-heading">
          <div><span>状态库</span><strong>{studio.project.logicalStates.length}</strong></div>
          <AddStateDialog onAdd={studio.addState} />
        </div>
        <div className="state-list">
          {studio.project.logicalStates.map((state) => {
            const variants = studio.project.variants.filter((variant) => variant.logicalStateId === state.id);
            const defaultVariant = variants.find((variant) => variant.id === state.defaultVariantId);
            const thumbnailArtifactId = defaultVariant?.imageArtifactId ?? state.referenceArtifactId ?? variants[0]?.imageArtifactId;
            return (
              <button
                key={state.id}
                className={studio.selection?.kind === "state" && studio.selection.id === state.id ? "is-active" : ""}
                onClick={() => studio.setSelection({ kind: "state", id: state.id })}
              >
                <span className="state-list__thumb checkerboard">
                  {thumbnailArtifactId
                    ? <img src={studio.artifacts.get(thumbnailArtifactId)?.uri} alt={`${state.label}预览`} />
                    : <Plus size={18} weight="thin" />}
                </span>
                <span><strong>{state.label}</strong><small>{state.semanticKey ?? "未映射"}</small></span>
                <em>{variants.length}</em>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="workspace-panel">
        <div className="workspace-toolbar">
          <div><h1>状态图</h1></div>
          <div className="toolbar-actions">
            <GenerationSettingsDialog settings={studio.project.generationSettings} apiConfigured={studio.apiConfigured} onChange={studio.updateGenerationSettings} />
            <Suspense fallback={null}><SaveProjectTemplateDialog project={studio.project} onSave={studio.templateLibrary.saveCurrentProject} /></Suspense>
            <Suspense fallback={null}><AutomaticProductionDialog controller={automatic} /></Suspense>
            <Suspense fallback={null}><BatchProductionDialog controller={batch} /></Suspense>
            <button className="ghost-button graph-arrange-button" type="button" onClick={studio.autoArrangeStates} title="按状态关系自动分层，分开双向连线并适配视图">
              <ArrowClockwise size={16} />整理
            </button>
          </div>
        </div>
        <div className="graph-stage">
          <Suspense fallback={<div className="graph-loading"><Graph size={24} weight="thin" /><span>正在载入状态图</span></div>}>
            <GraphWorkspace
              project={studio.project}
              selection={studio.selection}
              onSelect={studio.setSelection}
              onMoveState={studio.moveState}
              onConnectStates={studio.connectStates}
              layoutRevision={studio.graphLayoutRevision}
            />
          </Suspense>
          {studio.transitionPreview && <Suspense fallback={null}><TransitionContinuityPreview data={studio.transitionPreview} onClose={studio.closeTransitionPreview} /></Suspense>}
        </div>
      </main>

      <Suspense fallback={null}>
        <Inspector
          project={studio.project}
          styleProfiles={studio.styleLibrary.profiles}
          activeStyleProfileId={studio.styleLibrary.activeProfileId}
          persistentJobs={studio.projectJobs}
          selection={studio.selection}
          busy={studio.busy}
          previewing={studio.previewing}
          mobileOpen={studio.mobileInspectorOpen}
          onMobileClose={() => studio.setMobileInspectorOpen(false)}
          onGenerate={studio.generateTransition}
          onUploadTransitionVideo={studio.uploadTransitionVideo}
          onGenerateDraft={studio.generateTargetDraft}
          onApprove={studio.approveTransition}
          onPreview={studio.previewTransition}
          onUpdateTransitionPrompt={studio.updateTransitionPrompt}
          onUpdateTransitionDuration={studio.updateTransitionDuration}
          onUpdateTransitionTransparency={studio.updateTransitionTransparency}
          onUpdateTransitionTransparencyProcessing={studio.updateTransitionTransparencyProcessing}
          onUpdateTransitionPlayback={studio.updateTransitionPlayback}
          onCreatePingPongTransitionVersion={studio.createPingPongTransitionVersion}
          onTransparentizeExistingTransition={studio.transparentizeExistingTransition}
          onActivateTransitionMediaVersion={studio.activateTransitionMediaVersion}
          onUpdateTransitionEndFrameSource={studio.updateTransitionEndFrameSource}
          onUpdateTransitionAuthorityBridge={studio.updateTransitionAuthorityBridge}
          onUpdateIdleRule={studio.updateIdleRule}
          onAddIdleTransition={studio.addIdleTransition}
          onUpdateIdleScheduler={studio.updateIdleScheduler}
          onUpdatePointerGaze={studio.updatePointerGaze}
          onActivatePointerGazeVideo={studio.activatePointerGazeVideo}
          onGeneratePointerGazeVideo={studio.generatePointerGazeVideo}
          onUpdateDragInteraction={studio.updateDragInteraction}
          onUpdateStateDefinition={studio.updateStateDefinition}
          onSelectTransition={(transitionId) => studio.setSelection({ kind: "transition", id: transitionId })}
          onUpdateTransitionTriggers={studio.updateTransitionTriggers}
          onUpdateImageCandidateCount={studio.updateImageCandidateCount}
          onGenerateStateImage={studio.generateStateImage}
          onUploadStateImage={studio.uploadStateImage}
          onActivateStateReference={studio.activateStateReference}
          onSetInitialStateFromReference={studio.setInitialStateFromReference}
          onSetPreferredOutboundVariant={studio.setPreferredOutboundVariant}
          onSelectTransitionFrame={studio.selectTransitionFrame}
        />
      </Suspense>
    </div>
  );
}

function PreviewLoading() {
  return <div className="preview-loading"><Eye size={25} weight="thin" /><span>正在构建发布包预览</span></div>;
}

function PublishWorkspace({ project, onUpdateOrder }: { project: CharacterProject; onUpdateOrder: (order: Partial<CustomerOrder>) => void }) {
  const { manifest, error, pendingCount, canExport, downloadPackage, exporting, exportProgress, exportError, downloadUrl, downloadFilename } = usePublishPackage(project, onUpdateOrder);
  return (
    <main className="page-workspace publish-workspace">
      <header className="page-heading"><span>发布</span><h1>把实际展示变体交给独立运行时。</h1><p>宠物包只包含批准的视频、选定展示帧、触发条件和语义映射。</p></header>
      <div className="publish-grid">
        <section className="package-summary">
          <div className="package-icon"><Package size={36} weight="duotone" /></div><div><h2>{project.characterName}</h2><p>{project.name}</p></div>
          <dl><div><dt>实际状态</dt><dd>{manifest?.states.length ?? 0}</dd></div><div><dt>连续动画</dt><dd>{manifest?.transitions.length ?? 0}</dd></div><div><dt>触发条件</dt><dd>{manifest?.transitions.reduce((sum, transition) => sum + transition.triggers.length, 0) ?? 0}</dd></div></dl>
          <button className="primary-button" type="button" disabled={!canExport || exporting} onClick={downloadPackage}>{exporting ? <SpinnerGap className="spin" size={18} /> : <DownloadSimple size={18} weight="bold" />}{exporting ? `正在打包媒体 ${exportProgress.completed}/${exportProgress.total}` : "导出宠物包"}</button>
          {downloadUrl && <a className="package-download-fallback" href={downloadUrl} download={downloadFilename}><DownloadSimple size={14} />如果浏览器没有自动下载，点击这里</a>}
          <small className="package-export-note">V2 .petlord 包含媒体、完整性校验和运行配置，使用时无需连接生成服务。</small>
        </section>
        <aside className="publish-checks">
          <h2>发布检查</h2>
          <div className="check-row is-ready"><CheckCircle size={20} weight="fill" /><div><strong>状态默认图来源正确</strong><span>每个状态默认使用其权威参考图，过渡视频选帧作为连续性变体</span></div></div>
          <div className="check-row is-ready"><CheckCircle size={20} weight="fill" /><div><strong>触发配置随过渡导出</strong><span>桌面运行时可读取 hover 与点击热区</span></div></div>
          <div className={`check-row ${pendingCount === 0 ? "is-ready" : "is-pending"}`}>{pendingCount === 0 ? <CheckCircle size={20} weight="fill" /> : <BellSimple size={20} weight="fill" />}<div><strong>{pendingCount === 0 ? "所有过渡已批准" : `${pendingCount} 条过渡仍未批准`}</strong><span>未批准内容不会进入宠物包</span></div></div>
          <div className="check-row is-ready"><PuzzlePiece size={20} weight="fill" /><div><strong>插件语义映射有效</strong><span>To Do 插件可以请求通用动作</span></div></div>
          <div className="check-row is-ready"><DownloadSimple size={20} weight="fill" /><div><strong>压缩与损坏检测</strong><span>媒体按哈希去重并校验，桌面端拒绝被篡改或截断的包</span></div></div>
          {error && <p className="publish-error">{error}</p>}
          {exportError && <p className="publish-error">{exportError}</p>}
        </aside>
      </div>
    </main>
  );
}
