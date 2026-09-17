import { Alert, Button, Tag } from "@petlord/ui";
import { CheckCircle, CloudArrowUp, DownloadSimple, Package, SpinnerGap } from "@phosphor-icons/react";
import type { CharacterProject, CustomerOrder } from "@petlord/schema";
import type { WorkspaceSnapshot } from "../workspaceClient";
import { usePublishPackage } from "../hooks/usePublishPackage";
import type { LocalInstallationStatus } from "../hooks/publishPackageTransport";
import "./PublishWorkspace.css";

export function localApplyPresentation(status: LocalInstallationStatus | undefined, embedded: boolean) {
  if (!embedded) return {
    label: "在桌面应用中使用",
    disabled: true,
    message: "请在 PetLord 桌面应用中打开 Studio，即可直接更新本机宠物。",
  };
  if (!status) return { label: "正在读取本机状态", disabled: true, message: "正在确认这个项目与本机宠物的关联。" };
  if (!status.available) return { label: "本机更新不可用", disabled: true, message: "当前 Studio 未连接到桌面宠物运行时。" };
  if (status.linked && !status.exists) return { label: "关联宠物已不存在", disabled: true, message: "请从本机宠物列表重新打开要编辑的宠物。" };
  if (status.linked && status.active) return { label: "更新本机宠物", disabled: false, message: status.hasDraftChanges ? "有新修改尚未应用。" : "本机宠物已经是这个版本。" };
  if (status.linked) return { label: "更新并在本机使用", disabled: false, message: status.hasDraftChanges ? "保存修改后会更新并切换到这只宠物。" : "应用后会切换到这只宠物。" };
  return { label: "在本机使用", disabled: false, message: "将为这个项目新建一只本机宠物，不会覆盖同名宠物。" };
}

export function PublishWorkspace({
  project,
  exportProject,
  persistProject,
  onUpdateOrder,
}: {
  project: CharacterProject;
  exportProject: CharacterProject;
  persistProject: () => Promise<WorkspaceSnapshot<CharacterProject>>;
  onUpdateOrder: (order: Partial<CustomerOrder>) => void;
}) {
  const publish = usePublishPackage(project, { exportProject, persistProject, onUpdateOrder });
  const localAction = localApplyPresentation(publish.installation, publish.embedded);
  const busy = publish.exporting || publish.publishing || publish.applying;
  const applyDisabled = !publish.canExport || busy || publish.installationLoading || localAction.disabled;

  return <main className="page-workspace publish-workspace local-publish-workspace">
    <header className="page-heading"><span>使用与分享</span><h1>让修改直接出现在桌面。</h1><p>在这里更新本机宠物，或把作品分享给别人。</p></header>
    <div className="local-publish-layout">
      <section className="local-apply-card">
        <div className="local-apply-title"><div className="package-icon"><Package size={34} weight="duotone" /></div><div><h2>{project.characterName}</h2><p>{project.name}</p></div></div>
        <div className="local-apply-status">
          <Tag color={publish.installation?.active ? "processing" : "default"}>{publish.installation?.active ? "正在使用" : publish.installation?.linked ? "已关联" : "新项目"}</Tag>
          {publish.installation?.linked && <Tag color={publish.installation.hasDraftChanges ? "warning" : "success"}>{publish.installation.hasDraftChanges ? "有待应用的修改" : "已应用最新修改"}</Tag>}
        </div>
        <p className="local-apply-message">{localAction.message}</p>
        <Button className="local-apply-button" type="primary" size="large" disabled={applyDisabled} loading={publish.applying} onClick={() => { void publish.applyToDevice(); }}>
          {publish.applying ? "正在保存并更新" : localAction.label}
        </Button>
        {publish.applied && <Alert type="success" showIcon message={`已更新“${publish.applied.name}”，桌面宠物已切换。`} />}
        {publish.applyError && <Alert type="error" showIcon message={publish.applyError} />}
        {!publish.embedded && <Alert type="info" showIcon message="本机更新需要桌面应用" description={localAction.message} />}
      </section>

      <aside className="local-package-summary">
        <h2>准备情况</h2>
        <dl><div><dt>状态</dt><dd>{publish.manifest?.states.length ?? 0}</dd></div><div><dt>动画</dt><dd>{publish.manifest?.transitions.length ?? 0}</dd></div><div><dt>待批准</dt><dd>{publish.pendingCount}</dd></div></dl>
        {publish.error && <Alert type="warning" showIcon message={publish.error} />}
        {!publish.error && <p className="local-ready-line"><CheckCircle size={18} weight="fill" />状态、动画与触发条件已准备好。</p>}
      </aside>
    </div>

    <section className="local-share-section">
      <div><h2>分享与传输</h2><p>导出完整源稿文件，或发布到订阅库供其他设备使用。</p></div>
      <div className="local-share-actions">
        <Button disabled={!publish.canExport || busy} icon={publish.exporting ? <SpinnerGap className="spin" /> : <DownloadSimple />} onClick={() => { void publish.downloadPackage(); }}>{publish.exporting ? `正在打包 ${publish.exportProgress.completed}/${publish.exportProgress.total}` : "导出 .petlord"}</Button>
        <Button disabled={!publish.canExport || busy} icon={publish.publishing ? <SpinnerGap className="spin" /> : <CloudArrowUp />} onClick={() => { void publish.publishToLibrary(); }}>{publish.publishing ? "正在发布" : "发布到订阅"}</Button>
      </div>
      {publish.published && <Alert type="success" showIcon message={`已发布“${publish.published.name}”。`} />}
      {publish.exportError && <Alert type="error" showIcon message={publish.exportError} />}
      {publish.publishError && <Alert type="error" showIcon message={publish.publishError} />}
      {publish.downloadUrl && <a href={publish.downloadUrl} download={publish.downloadFilename}><DownloadSimple size={14} />如果浏览器没有自动下载，点击这里</a>}
    </section>
  </main>;
}

export default PublishWorkspace;
