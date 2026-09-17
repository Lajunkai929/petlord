import { Button } from "@petlord/ui";
import { SelectField } from "@petlord/ui";
import petLordLogo from "../../desktop/src/assets/petlord-brand-mark.png";
import { lazy, Suspense } from "react";
import { ConfigProvider } from "@petlord/ui";
import {
  ArrowClockwise,
  ChatCenteredText,
  CloudCheck,
  Cube,
  Eye,
  Graph,
  ImageSquare,
  Moon,
  Package,
  PaintBrush,
  Palette,
  Plus,
  PlugsConnected,
  PuzzlePiece,
  Queue,
  SquaresFour,
  Sun,
  TextAa,
} from "@phosphor-icons/react";
import type { CharacterProject } from "@petlord/schema";
import { AddStateDialog } from "./components/AddStateDialog";
import { GenerationSettingsDialog } from "./components/GenerationSettingsDialog";
import { TaskCenter } from "./components/TaskCenter";
import { useStudioController, type StudioController } from "./hooks/useStudioController";
import { useBatchProduction } from "./hooks/useBatchProduction";
import { useAutomaticProduction } from "./hooks/useAutomaticProduction";
import { studioAntdTheme } from "./uiTheme";

const NativePixelWorkspace = lazy(() => import("./pixel/NativePixelWorkspace").then(module => ({ default: module.NativePixelWorkspace })));
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
const ProviderWorkspace = lazy(() => import("./components/ProviderWorkspace").then(module => ({ default: module.ProviderWorkspace })));
const PublishWorkspace = lazy(() => import("./components/PublishWorkspace").then((module) => ({ default: module.PublishWorkspace })));

export function App() {
  const studio = useStudioController();
  return (
    <ConfigProvider theme={studioAntdTheme(studio.theme, studio.appearance.fontSize)}>
    <div className="app-shell">
      <Suspense fallback={null}><ToastHost theme={studio.theme} /></Suspense>
      <StudioRail studio={studio} />
      <div className="app-main">
        <StudioTopbar studio={studio} />
        {["graph", "drawing", "preview", "publish", "review"].includes(studio.activeArea) && Boolean(studio.project.importedPackage?.warnings.length) && <details className="workspace-import-notice"><summary>此项目从已安装的宠物包恢复 · 查看可编辑范围</summary>{studio.project.importedPackage?.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
        {studio.workspaceStorageError && <div className="workspace-sync-notice" role="alert">
          <span>{studio.workspaceStorageError}</span>
          {studio.pendingProjectChangeError
            ? <button type="button" onClick={() => { void studio.retryPendingProjectChanges(); }}>重试保存</button>
            : <><button type="button" onClick={() => { void studio.reloadWorkspace(); }}>载入最新版本</button>
              {studio.workspaceStorageConflict && <button type="button" onClick={() => { void studio.saveWorkspaceConflictCopy(); }}>将本地改动另存为副本</button>}</>}
        </div>}
        {studio.activeArea === "orders" && <Suspense fallback={<div className="graph-loading"><SquaresFour size={24} /><span>正在载入项目</span></div>}><OrderWorkspace projects={studio.projects} identities={studio.identities} styles={studio.styleLibrary.profiles} templates={studio.templateLibrary.templates} activeIdentityId={studio.activeIdentity?.id} activeStyleProfileId={studio.styleLibrary.activeProfileId} currentProject={studio.project} storageError={studio.workspaceStorageError} onOpenProject={studio.activateCustomerProject} onCreate={studio.createCustomerProject} /></Suspense>}
        {studio.activeArea === "graph" && <GraphArea studio={studio} />}
        {studio.activeArea === "drawing" && <Suspense fallback={<PreviewLoading />}><NativePixelWorkspace key={studio.project.id} project={studio.project} runCommand={studio.runDesignCommand} onPreview={() => studio.setActiveArea("preview")} selection={studio.selection} /></Suspense>}
        {studio.activeArea === "identity" && <Suspense fallback={<PreviewLoading />}><IdentityLibraryWorkspace studio={studio} /></Suspense>}
        {studio.activeArea === "style" && <Suspense fallback={<PreviewLoading />}><StyleLibraryWorkspace studio={studio} /></Suspense>}
        {studio.drawingPending && ["preview", "publish"].includes(studio.activeArea) && <main className="page-workspace drawing-pending-notice"><h1>绘图草稿还未保存</h1><p>保存画布和动画后，即可预览或更新本机宠物。</p><Button type="primary" htmlType="button" className="primary-button" onClick={() => studio.setActiveArea("drawing")}>返回绘图工作台</Button></main>}
        {studio.activeArea === "preview" && !studio.drawingPending && <Suspense fallback={<PreviewLoading />}><RuntimePreviewWorkspace key={`${studio.project.id}:${studio.previewSessionRevision}`} project={studio.project} onEdit={() => studio.setActiveArea("graph")} /></Suspense>}
        {studio.activeArea === "review" && <Suspense fallback={<PreviewLoading />}><ReviewWorkspace project={studio.project} controller={studio.customerReview} /></Suspense>}
        {studio.activeArea === "plugins" && <Suspense fallback={<PreviewLoading />}><PluginWorkspace studio={studio} /></Suspense>}
        {studio.activeArea === "providers" && <Suspense fallback={<PreviewLoading />}><ProviderWorkspace providers={studio.generationProviders} /></Suspense>}
        {studio.activeArea === "publish" && !studio.drawingPending && <Suspense fallback={<PreviewLoading />}><PublishWorkspace project={studio.project} exportProject={studio.exportSourceProject} persistProject={studio.persistProject} onUpdateOrder={studio.updateOrder} /></Suspense>}
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
  const creationAreaActive = ["graph", "drawing", "preview", "publish"].includes(studio.activeArea);
  return (
    <aside className="app-rail">
      <button className="brand-mark" type="button" aria-label="PetLord Studio" onClick={() => studio.setActiveArea("graph")}>
        <img src={petLordLogo} alt="" />
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
        <button type="button" className={studio.activeArea === "providers" ? "is-active" : ""} title="模型服务" aria-label="模型服务" onClick={() => studio.setActiveArea("providers")}><PlugsConnected size={20} /><span>模型</span></button>
        <button type="button" onClick={studio.toggleTheme} title="切换主题">
          {studio.theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}<span>主题</span>
        </button>
      </div>
    </aside>
  );
}

function StudioTopbar({ studio }: { studio: StudioController }) {
  if (studio.activeArea === "providers") return <header className="topbar global-settings-topbar"><span><PlugsConnected size={19} />应用设置 <span>/ 模型服务</span></span><Button htmlType="button" type="default" className="secondary-button" onClick={() => studio.setActiveArea("graph")}>返回创作</Button></header>;
  return (
    <header className="topbar">
      <div className="project-switcher">
        <button type="button" aria-label="返回项目库" title="返回项目库" onClick={() => studio.setActiveArea("orders")}><SquaresFour size={17} weight="fill" /></button>
        <label><span>当前项目</span><SelectField aria-label="切换当前项目" value={studio.project.id} onChange={(event) => studio.activateCustomerProject(event.target.value)}>{studio.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</SelectField></label>
      </div>
      <nav className="topbar-primary-actions" aria-label="创作视图">
        <button className={studio.activeArea === "graph" ? "is-active" : ""} type="button" onClick={() => studio.setActiveArea("graph")}><Graph size={16} />状态与动作</button>
        <button className={studio.activeArea === "drawing" ? "is-active" : ""} type="button" title={studio.drawingPending ? "有未保存的绘图草稿" : undefined} onClick={() => studio.setActiveArea("drawing")}><PaintBrush size={16} />绘图{studio.drawingPending && <i className="drawing-pending-dot" aria-hidden="true" />}</button>
        <button className={studio.activeArea === "preview" ? "is-active" : ""} type="button" disabled={studio.drawingPending} title={studio.drawingPending ? "请先保存绘图草稿" : undefined} onClick={() => studio.setActiveArea("preview")}><Eye size={16} />预览</button>
        <button className={studio.activeArea === "publish" ? "is-active" : ""} type="button" disabled={studio.drawingPending} title={studio.drawingPending ? "请先保存绘图草稿" : undefined} onClick={() => studio.setActiveArea("publish")}><Package size={16} />发布</button>
      </nav>
      <div className="topbar-status">
        <span><CloudCheck size={16} weight="fill" />{studio.drawingPending ? "绘图草稿待保存" : studio.apiConfigured ? "AI 服务已连接" : "本地创作已就绪"}</span>
        <label className="font-size-control" title="调整整个创作平台的界面字号">
          <TextAa size={16} weight="bold" />
          <SelectField aria-label="界面字号" value={studio.appearance.fontSize} onChange={(event) => studio.appearance.setFontSize(event.target.value as typeof studio.appearance.fontSize)}>
            {studio.appearance.fontSizeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </SelectField>
        </label>
        <Button type="default" className="icon-button queue-button" htmlType="button" title="生成任务中心" onClick={() => studio.setTaskCenterOpen(true)}>
          <Queue size={19} />
          {studio.allActiveJobs.length > 0 && <b>{studio.allActiveJobs.length}</b>}
        </Button>
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
  }, studio.generationProviders.snapshot);
  const automatic = useAutomaticProduction(studio.project, studio.projectJobs, studio.busy, {
    generateState: (stateId) => studio.generateStateImage(stateId, { throwOnFailure: true }),
    activateStateReference: studio.activateStateReference,
    generateTransition: (transitionId) => studio.generateTransition(transitionId, true),
    approveTransition: (transitionId) => studio.approveTransition(transitionId, true),
  }, studio.generationProviders.snapshot);
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
                    ? <img src={studio.artifacts.get(thumbnailArtifactId)?.uri} style={studio.artifacts.get(thumbnailArtifactId)?.nativePixel ? { imageRendering: "pixelated" } : undefined} alt={`${state.label}预览`} />
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
            <GenerationSettingsDialog settings={studio.project.generationSettings} providers={studio.generationProviders} onChange={studio.updateGenerationSettings} onManageProviders={() => studio.setActiveArea("providers")} />
            <Suspense fallback={null}><SaveProjectTemplateDialog project={studio.project} onSave={studio.templateLibrary.saveCurrentProject} /></Suspense>
            <Suspense fallback={null}><AutomaticProductionDialog controller={automatic} /></Suspense>
            <Suspense fallback={null}><BatchProductionDialog controller={batch} /></Suspense>
            <Button type="text" className="ghost-button graph-arrange-button" htmlType="button" onClick={studio.autoArrangeStates} title="按状态关系自动分层，分开双向连线并适配视图">
              <ArrowClockwise size={16} />整理
            </Button>
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
          onOpenDrawing={() => studio.setActiveArea("drawing")}
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
