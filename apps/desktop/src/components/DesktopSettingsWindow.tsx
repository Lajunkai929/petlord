import { DialogContent, SelectField, Button, Segmented, Switch, Dialog } from "@petlord/ui";
import {
  Check,
  Dog,
  DownloadSimple,
  Eye,
  GearSix,
  Play,
  Plug,
  PaintBrush,
  PuzzlePiece,
  PushPin,
  SpinnerGap,
  SpeakerSimpleSlash,
  Trash,
  X,
} from "@phosphor-icons/react";
import type { PluginPermission } from "@petlord/schema";
import {
  runtimeDisplaySizeOptions,
  runtimeFrameRateOptions,
  runtimePixelGridOptions,
  runtimeResolutionOptions,
} from "@petlord/runtime-react";
import petLordBrandMark from "../assets/petlord-brand-mark.png";
import { DesktopCompanionSettings } from "./DesktopCompanionSettings";
import { CodexDesignSettings } from "./CodexDesignSettings";
import { SubscriptionBrowser } from "./SubscriptionBrowser";
import type { DesktopSettingsWindowController, SettingsSection } from "../hooks/useDesktopSettingsWindow";

const permissionLabels: Record<PluginPermission, string> = {
  "pet:read": "读取宠物状态",
  "pet:control": "触发宠物动作",
  storage: "保存插件数据",
  "ui:panel": "显示功能面板",
  "ui:context-menu": "添加右键菜单",
  notifications: "显示提醒",
  "background:events": "接收后台事件",
  "integration:claude:events": "接收 Claude 事件",
  "integration:claude:open-session": "打开 Claude 会话",
  "integration:codex:events": "接收 Codex 事件",
  "integration:codex:open-session": "打开 Codex 会话",
};

const navigation: Array<{ id: SettingsSection; label: string; icon: typeof Dog }> = [
  { id: "pets", label: "宠物", icon: Dog },
  { id: "behavior", label: "行为", icon: GearSix },
  { id: "agent", label: "接入 Agent", icon: Plug },
  { id: "plugins", label: "插件", icon: PuzzlePiece },
];

function initialImage(manifest: DesktopSettingsWindowController["petPackages"]["manifest"]) {
  return manifest?.states.find((state) => state.id === manifest.initialStateId)?.imageUri ?? manifest?.states[0]?.imageUri;
}

function previewImageStyle(manifest: DesktopSettingsWindowController["petPackages"]["manifest"]) {
  const state = manifest?.states.find(candidate => candidate.id === manifest.initialStateId) ?? manifest?.states[0];
  return state?.nativePixel ? { imageRendering: "pixelated" as const } : undefined;
}

function Toggle({ checked, label, detail, icon: Icon, onChange }: { checked: boolean; label: string; detail: string; icon: typeof Eye; onChange: (checked: boolean) => void }) {
  return <div className="settings-toggle"><Icon size={19} weight="duotone" /><span><strong>{label}</strong><small>{detail}</small></span><Switch checked={checked} aria-label={label} onChange={onChange} /></div>;
}

function ChoiceGroup<T extends string | number>({ label, value, options, suffix, onChange }: { label: string; value: T; options: readonly T[]; suffix?: string; onChange: (value: T) => void }) {
  return <Segmented aria-label={label} value={value} options={options.map(option => ({value:option,label:`${option}${suffix ?? ""}`}))} onChange={next => onChange(next as T)} />;
}

function PetPackages({ controller }: { controller: DesktopSettingsWindowController }) {
  const { petPackages } = controller;
  const preview = initialImage(petPackages.manifest);
  const activePackage = petPackages.installedPackages.find(item => item.active);
  if (petPackages.loading && !petPackages.manifest) return <section className="settings-view settings-pets-view"><header><div><h1>我的宠物</h1><p>正在读取本机配置。</p></div></header><div className="settings-pet-skeleton"><i /><span><b /><b /><b /></span></div></section>;
  return <section className="settings-view settings-pets-view">
    <header><div><h1>我的宠物</h1><p>在这台电脑上编辑、更新或导入宠物。</p></div><Button type="default" className="settings-secondary-action" htmlType="button" onClick={petPackages.choosePackage}><DownloadSimple size={17} />导入文件</Button></header>
    {petPackages.manifest ? <div className="active-pet-strip"><div className="active-pet-preview">{preview && <img src={preview} style={previewImageStyle(petPackages.manifest)} alt={`${petPackages.manifest.characterName} 预览`} />}</div><div><span>正在使用</span><h2>{petPackages.manifest.characterName}</h2><p>{petPackages.manifest.states.length} 个状态，{petPackages.manifest.transitions.length} 段动画</p></div><div className="active-pet-actions"><Button type="primary" disabled={!activePackage} icon={<PaintBrush size={15} />} onClick={() => { if (activePackage) void controller.editInstalledPackage(activePackage.key); }}>编辑这个宠物</Button><Button type="text" icon={<Play size={15} weight="fill" />} onClick={() => { void controller.showPet(); }}>看看它</Button></div></div> : <div className="settings-empty-pet"><Dog size={54} weight="duotone" /><h2>先带一只宠物回家</h2><p>导入一个 .petlord 配置后，宠物会出现在桌面。</p><Button type="primary" htmlType="button" onClick={petPackages.choosePackage}><DownloadSimple size={16} />选择配置</Button></div>}
    {petPackages.installedPackages.length > 0 && <div className="pet-scheme-list"><h2>配置方案</h2>{petPackages.installedPackages.map((item) => <article className={item.active ? "is-active" : ""} key={item.key}><button type="button" onClick={() => { if (!item.active) void petPackages.activateInstalledPackage(item.key); }}><i>{item.characterName.slice(0, 1)}</i><span><strong>{item.name}</strong><small>{item.stateCount} 个状态，{item.transitionCount} 段动画</small></span>{item.active && <em><Check size={13} weight="bold" />当前</em>}</button><Button type="text" size="small" icon={<PaintBrush size={15} />} onClick={() => { void controller.editInstalledPackage(item.key); }}>编辑</Button>{!item.active && <Button type="text" className="pet-scheme-delete" htmlType="button" aria-label={`删除 ${item.name}`} onClick={() => { void petPackages.removeInstalledPackage(item.key); }}><Trash size={15} /></Button>}</article>)}</div>}
    <SubscriptionBrowser petPackages={petPackages} />
  </section>;
}

function BehaviorSettings({ controller }: { controller: DesktopSettingsWindowController }) {
  const { settings } = controller;
  return <section className="settings-view settings-behavior-view">
    <header><div><h1>桌面行为</h1><p>控制宠物的位置、大小和前台状态。</p></div></header>
    <DesktopCompanionSettings settings={settings} manifest={controller.petPackages.manifest} />
    <div className="behavior-control-block"><span><strong>外观</strong><small>桌面设置和创作平台使用同一主题</small></span><Segmented aria-label="应用外观" value={settings.settings.theme} options={[{value:"light",label:"浅色"},{value:"dark",label:"暗色"}]} onChange={theme => {void settings.update({theme:theme as "light" | "dark"});}} /></div>
    <div className="behavior-toggle-list">
      <Toggle icon={PushPin} checked={settings.settings.alwaysOnTop} label="固定在最前面" detail="关闭后，其他窗口可以自然遮挡宠物。" onChange={(alwaysOnTop) => { void settings.update({ alwaysOnTop }); }} />
      <Toggle icon={Eye} checked={!settings.settings.clickThrough} label="允许左键交互" detail="默认开启。关闭后鼠标会穿过宠物。" onChange={(enabled) => { void settings.update({ clickThrough: !enabled }); }} />
      <Toggle icon={SpeakerSimpleSlash} checked={settings.settings.muted} label="保持静音" detail="发布包即使包含声音也不播放。" onChange={(muted) => { void settings.update({ muted }); }} />
    </div>
    <div className="behavior-select-row"><label><span><strong>宠物大小</strong><small>桌面上的实际尺寸</small></span><SelectField value={settings.settings.displaySize} onChange={(event) => { void settings.update({ displaySize: Number(event.target.value) as typeof settings.settings.displaySize }); }}>{runtimeDisplaySizeOptions.map((option) => <option value={option} key={option}>{option}px</option>)}</SelectField></label><label><span><strong>渲染尺寸</strong><small>内部画布清晰度</small></span><SelectField value={settings.settings.renderResolution} onChange={(event) => { void settings.update({ renderResolution: Number(event.target.value) as typeof settings.settings.renderResolution }); }}>{runtimeResolutionOptions.map((option) => <option value={option} key={option}>{option}px</option>)}</SelectField></label></div>
    <div className="behavior-control-block"><span><strong>播放帧率</strong><small>越高越流畅，也会占用更多资源</small></span><ChoiceGroup label="播放帧率" value={settings.settings.frameRate} options={runtimeFrameRateOptions} onChange={(frameRate) => { void settings.update({ frameRate }); }} /></div>
    <div className="behavior-control-block"><span><strong>像素网格</strong><small>仅在项目启用像素渲染时生效</small></span><ChoiceGroup label="像素网格" value={settings.settings.pixelGridSize} options={runtimePixelGridOptions} onChange={(pixelGridSize) => { void settings.update({ pixelGridSize }); }} /></div>
    <div className="behavior-select-row is-single"><label><span><strong>默认位置</strong><small>相对当前显示器</small></span><SelectField value={settings.settings.dock} onChange={(event) => { void settings.update({ dock: event.target.value as typeof settings.settings.dock }); }}><option value="left">左下</option><option value="right">右下</option><option value="free">自由位置</option></SelectField></label></div>
    <div className="behavior-select-row is-single"><label><span><strong>注视生效范围</strong><small>大范围和全屏会跟踪全局鼠标，但宠物外区域仍可操作下层页面</small></span><SelectField value={settings.settings.gazeTrackingArea} onChange={(event) => { void settings.update({ gazeTrackingArea: event.target.value as typeof settings.settings.gazeTrackingArea }); }}><option value="near">周围小区域</option><option value="wide">周围大区域</option><option value="screen">全屏</option></SelectField></label></div>
  </section>;
}

function PluginSettings({ controller }: { controller: DesktopSettingsWindowController }) {
  return <section className="settings-view settings-plugins-view">
    <header><div><h1>插件</h1><p>插件先授权，再读取状态或触发动作。</p></div></header>
    {controller.plugins.length === 0 ? <div className="settings-empty-plugins"><Plug size={40} weight="duotone" /><p>当前配置没有插件。</p></div> : <div className="settings-plugin-list">{controller.plugins.map((plugin) => {
      const status = controller.pluginStatus(plugin);
      return <article key={plugin.id}><div className="settings-plugin-title"><i><Plug size={18} weight="duotone" /></i><span><strong>{plugin.name}</strong><small>{plugin.id}</small></span>{status === "active" && <em><Check size={13} />已启用</em>}</div><details className="settings-plugin-permissions"><summary>{plugin.permissions.length} 项权限</summary><div>{plugin.permissions.map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}</div></details>{status === "permission" ? <Button type="default" htmlType="button" onClick={() => { void controller.grantPlugin(plugin); }}>允许插件</Button> : <Button type="default" htmlType="button" className="is-quiet" onClick={() => { void controller.setPluginEnabled(plugin.id, status === "disabled"); }}>{status === "disabled" ? "重新启用" : "停用"}</Button>}</article>;
    })}</div>}
    {controller.plugins.some((plugin) => plugin.id === "petlord.agent-activity") && <div className="agent-connect-strip"><div><strong>Code Agent</strong><small>任务完成后由宠物提醒</small></div>{(["claude", "codex"] as const).map((source) => { const enabled = controller.agentIntegrations.status?.[source].enabled; return <Button type="default" htmlType="button" className={enabled ? "is-active" : ""} disabled={Boolean(controller.agentIntegrations.busySource)} onClick={() => { if (!enabled) void controller.agentIntegrations.install(source); }} key={source}>{enabled && <Check size={12} />}{source === "claude" ? "Claude" : "Codex"}</Button>; })}</div>}
  </section>;
}

function ImportDialog({ controller }: { controller: DesktopSettingsWindowController }) {
  const pending = controller.petPackages.pendingImport;
  const manifest = controller.pendingManifest;
  const preview = initialImage(manifest);
  return <Dialog.Root open={Boolean(pending)} onOpenChange={(open) => { if (!open) controller.petPackages.setPendingImport(undefined); }}><Dialog.Portal><Dialog.Overlay className="import-dialog-overlay" /><DialogContent className="import-dialog-content"><Dialog.Title>导入宠物配置</Dialog.Title><Dialog.Description>选择新建方案，或者更新已有方案。</Dialog.Description><Dialog.Close asChild><Button type="text" htmlType="button" className="import-dialog-close" aria-label="关闭"><X size={16} /></Button></Dialog.Close>{manifest && <div className="import-pet-summary"><div>{preview && <img src={preview} style={previewImageStyle(manifest)} alt={`${manifest.characterName} 预览`} />}</div><span><strong>{manifest.name}</strong><small>{manifest.characterName}，{manifest.states.length} 个状态</small></span></div>}<label className="import-target-field"><span>导入到</span><SelectField value={controller.importTargetKey} onChange={(event) => controller.setImportTargetKey(event.target.value)}><option value="new">新建配置方案</option>{controller.petPackages.installedPackages.map((item) => <option value={item.key} key={item.key}>{item.name}{item.key === pending?.suggestedTargetKey ? "（同名，推荐更新）" : ""}</option>)}</SelectField><small>{controller.importTargetKey === "new" ? "保留现有方案，另外创建一套。" : "选中的方案会被这次导入替换。"}</small></label>{manifest && manifest.plugins.length > 0 && <details className="import-plugin-review"><summary>{manifest.plugins.length} 个插件，需要单独授权</summary>{manifest.plugins.map((plugin) => <div key={plugin.id}><strong>{plugin.name}</strong><span>{plugin.permissions.map((permission) => permissionLabels[permission]).join("，")}</span></div>)}</details>}<div className="import-dialog-actions"><Dialog.Close asChild><Button type="default" htmlType="button" >取消</Button></Dialog.Close><Button type="primary" htmlType="button" disabled={controller.petPackages.loading} onClick={() => { void controller.confirmImport(); }}>{controller.importTargetKey === "new" ? "新建并使用" : "更新并使用"}</Button></div></DialogContent></Dialog.Portal></Dialog.Root>;
}

export function DesktopSettingsWindow({ controller }: { controller: DesktopSettingsWindowController }) {
  return <main className="settings-window-shell">
    <aside className="settings-sidebar">
      <div className="settings-brand"><img src={petLordBrandMark} alt="" aria-hidden="true" /><span>PetLord</span></div>
      <nav aria-label="设置导航">{navigation.map((item) => {
        const Icon = item.icon;
        const active = controller.section === item.id;
        return <Button
          key={item.id}
          block
          className="settings-sidebar-button"
          color={active ? "primary" : "default"}
          variant="text"
          aria-current={active ? "page" : undefined}
          icon={<Icon size={16} weight={active ? "fill" : "regular"} aria-hidden="true" />}
          onClick={() => controller.setSection(item.id)}
        >{item.label}</Button>;
      })}</nav>
      <div className="settings-sidebar-footer">
        <Button block type="text" className="settings-sidebar-button" icon={<PaintBrush size={16} aria-hidden="true" />} onClick={() => { void window.petLordDesktop?.showStudio(); }}>打开 Studio</Button>
        <Button block type="text" className="settings-sidebar-button" icon={<X size={16} aria-hidden="true" />} onClick={() => { void controller.close(); }}>隐藏设置</Button>
      </div>
    </aside>
    <div className="settings-window-content">{controller.section === "pets" && <PetPackages controller={controller} />}{controller.section === "behavior" && <BehaviorSettings controller={controller} />}{controller.section === "agent" && <CodexDesignSettings />}{controller.section === "plugins" && <PluginSettings controller={controller} />}{controller.settings.error && <div className="settings-inline-error">{controller.settings.error}</div>}{controller.petPackages.error && <div className="settings-inline-error">{controller.petPackages.error}</div>}{controller.editError && <div className="settings-inline-error">{controller.editError}</div>}</div>
    <input ref={controller.petPackages.fileInput} type="file" accept=".petlord,application/vnd.petlord.package+json" hidden onChange={controller.petPackages.onFileSelected} />
    <ImportDialog controller={controller} />
  </main>;
}
