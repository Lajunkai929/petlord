import * as Dialog from "@radix-ui/react-dialog";
import {
  Check,
  Dog,
  DownloadSimple,
  Eye,
  GearSix,
  Play,
  Plug,
  PushPin,
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
  { id: "plugins", label: "插件", icon: Plug },
];

function initialImage(manifest: DesktopSettingsWindowController["petPackages"]["manifest"]) {
  return manifest?.states.find((state) => state.id === manifest.initialStateId)?.imageUri ?? manifest?.states[0]?.imageUri;
}

function Toggle({ checked, label, detail, icon: Icon, onChange }: { checked: boolean; label: string; detail: string; icon: typeof Eye; onChange: (checked: boolean) => void }) {
  return <label className="settings-toggle"><Icon size={19} weight="duotone" /><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>;
}

function ChoiceGroup<T extends string | number>({ value, options, suffix, onChange }: { value: T; options: readonly T[]; suffix?: string; onChange: (value: T) => void }) {
  return <div className="settings-choice-group">{options.map((option) => <button type="button" className={option === value ? "is-active" : ""} onClick={() => onChange(option)} key={option}>{option}{suffix}</button>)}</div>;
}

function PetPackages({ controller }: { controller: DesktopSettingsWindowController }) {
  const { petPackages } = controller;
  const preview = initialImage(petPackages.manifest);
  if (petPackages.loading && !petPackages.manifest) return <section className="settings-view settings-pets-view"><header><div><h1>我的宠物</h1><p>正在读取本机配置。</p></div></header><div className="settings-pet-skeleton"><i /><span><b /><b /><b /></span></div></section>;
  return <section className="settings-view settings-pets-view">
    <header><div><h1>我的宠物</h1><p>切换方案，或导入创作平台发布的配置。</p></div><button className="settings-primary-action" type="button" onClick={petPackages.choosePackage}><DownloadSimple size={17} />导入配置</button></header>
    {petPackages.manifest ? <div className="active-pet-strip"><div className="active-pet-preview">{preview && <img src={preview} alt={`${petPackages.manifest.characterName} 预览`} />}</div><div><span>正在使用</span><h2>{petPackages.manifest.characterName}</h2><p>{petPackages.manifest.states.length} 个状态，{petPackages.manifest.transitions.length} 段动画</p></div><button type="button" onClick={() => { void controller.showPet(); }}><Play size={15} weight="fill" />看看它</button></div> : <div className="settings-empty-pet"><Dog size={54} weight="duotone" /><h2>先带一只宠物回家</h2><p>导入一个 .petlord 配置后，宠物会出现在桌面。</p><button type="button" onClick={petPackages.choosePackage}><DownloadSimple size={16} />选择配置</button></div>}
    {petPackages.installedPackages.length > 0 && <div className="pet-scheme-list"><h2>配置方案</h2>{petPackages.installedPackages.map((item) => <article className={item.active ? "is-active" : ""} key={item.key}><button type="button" onClick={() => { if (!item.active) void petPackages.activateInstalledPackage(item.key); }}><i>{item.characterName.slice(0, 1)}</i><span><strong>{item.name}</strong><small>{item.stateCount} 个状态，{item.transitionCount} 段动画</small></span>{item.active && <em><Check size={13} weight="bold" />当前</em>}</button>{!item.active && <button className="pet-scheme-delete" type="button" aria-label={`删除 ${item.name}`} onClick={() => { void petPackages.removeInstalledPackage(item.key); }}><Trash size={15} /></button>}</article>)}</div>}
  </section>;
}

function BehaviorSettings({ controller }: { controller: DesktopSettingsWindowController }) {
  const { settings } = controller;
  return <section className="settings-view settings-behavior-view">
    <header><div><h1>桌面行为</h1><p>控制宠物的位置、大小和前台状态。</p></div></header>
    <div className="behavior-toggle-list">
      <Toggle icon={PushPin} checked={settings.settings.alwaysOnTop} label="固定在最前面" detail="关闭后，其他窗口可以自然遮挡宠物。" onChange={(alwaysOnTop) => { void settings.update({ alwaysOnTop }); }} />
      <Toggle icon={Eye} checked={!settings.settings.clickThrough} label="允许左键交互" detail="默认开启。关闭后鼠标会穿过宠物。" onChange={(enabled) => { void settings.update({ clickThrough: !enabled }); }} />
      <Toggle icon={SpeakerSimpleSlash} checked={settings.settings.muted} label="保持静音" detail="发布包即使包含声音也不播放。" onChange={(muted) => { void settings.update({ muted }); }} />
    </div>
    <div className="behavior-select-row"><label><span><strong>宠物大小</strong><small>桌面上的实际尺寸</small></span><select value={settings.settings.displaySize} onChange={(event) => { void settings.update({ displaySize: Number(event.target.value) as typeof settings.settings.displaySize }); }}>{runtimeDisplaySizeOptions.map((option) => <option value={option} key={option}>{option}px</option>)}</select></label><label><span><strong>渲染尺寸</strong><small>内部画布清晰度</small></span><select value={settings.settings.renderResolution} onChange={(event) => { void settings.update({ renderResolution: Number(event.target.value) as typeof settings.settings.renderResolution }); }}>{runtimeResolutionOptions.map((option) => <option value={option} key={option}>{option}px</option>)}</select></label></div>
    <div className="behavior-control-block"><span><strong>播放帧率</strong><small>越高越流畅，也会占用更多资源</small></span><ChoiceGroup value={settings.settings.frameRate} options={runtimeFrameRateOptions} onChange={(frameRate) => { void settings.update({ frameRate }); }} /></div>
    <div className="behavior-control-block"><span><strong>像素网格</strong><small>仅在项目启用像素渲染时生效</small></span><ChoiceGroup value={settings.settings.pixelGridSize} options={runtimePixelGridOptions} onChange={(pixelGridSize) => { void settings.update({ pixelGridSize }); }} /></div>
    <div className="behavior-select-row is-single"><label><span><strong>默认位置</strong><small>相对当前显示器</small></span><select value={settings.settings.dock} onChange={(event) => { void settings.update({ dock: event.target.value as typeof settings.settings.dock }); }}><option value="left">左下</option><option value="right">右下</option><option value="free">自由位置</option></select></label></div>
  </section>;
}

function PluginSettings({ controller }: { controller: DesktopSettingsWindowController }) {
  return <section className="settings-view settings-plugins-view">
    <header><div><h1>插件</h1><p>插件先授权，再读取状态或触发动作。</p></div></header>
    {controller.plugins.length === 0 ? <div className="settings-empty-plugins"><Plug size={40} weight="duotone" /><p>当前配置没有插件。</p></div> : <div className="settings-plugin-list">{controller.plugins.map((plugin) => {
      const status = controller.pluginStatus(plugin);
      return <article key={plugin.id}><div className="settings-plugin-title"><i><Plug size={18} weight="duotone" /></i><span><strong>{plugin.name}</strong><small>{plugin.id}</small></span>{status === "active" && <em><Check size={13} />已启用</em>}</div><details className="settings-plugin-permissions"><summary>{plugin.permissions.length} 项权限</summary><div>{plugin.permissions.map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}</div></details>{status === "permission" ? <button type="button" onClick={() => { void controller.grantPlugin(plugin); }}>允许插件</button> : <button type="button" className="is-quiet" onClick={() => { void controller.setPluginEnabled(plugin.id, status === "disabled"); }}>{status === "disabled" ? "重新启用" : "停用"}</button>}</article>;
    })}</div>}
    {controller.plugins.some((plugin) => plugin.id === "petlord.agent-activity") && <div className="agent-connect-strip"><div><strong>Code Agent</strong><small>任务完成后由宠物提醒</small></div>{(["claude", "codex"] as const).map((source) => { const enabled = controller.agentIntegrations.status?.[source].enabled; return <button type="button" className={enabled ? "is-active" : ""} disabled={Boolean(controller.agentIntegrations.busySource)} onClick={() => { if (!enabled) void controller.agentIntegrations.install(source); }} key={source}>{enabled && <Check size={12} />}{source === "claude" ? "Claude" : "Codex"}</button>; })}</div>}
  </section>;
}

function ImportDialog({ controller }: { controller: DesktopSettingsWindowController }) {
  const pending = controller.petPackages.pendingImport;
  const manifest = controller.pendingManifest;
  const preview = initialImage(manifest);
  return <Dialog.Root open={Boolean(pending)} onOpenChange={(open) => { if (!open) controller.petPackages.setPendingImport(undefined); }}><Dialog.Portal><Dialog.Overlay className="import-dialog-overlay" /><Dialog.Content className="import-dialog-content"><Dialog.Title>导入宠物配置</Dialog.Title><Dialog.Description>选择新建方案，或者更新已有方案。</Dialog.Description><Dialog.Close className="import-dialog-close" aria-label="关闭"><X size={16} /></Dialog.Close>{manifest && <div className="import-pet-summary"><div>{preview && <img src={preview} alt={`${manifest.characterName} 预览`} />}</div><span><strong>{manifest.name}</strong><small>{manifest.characterName}，{manifest.states.length} 个状态</small></span></div>}<label className="import-target-field"><span>导入到</span><select value={controller.importTargetKey} onChange={(event) => controller.setImportTargetKey(event.target.value)}><option value="new">新建配置方案</option>{controller.petPackages.installedPackages.map((item) => <option value={item.key} key={item.key}>{item.name}{item.key === pending?.suggestedTargetKey ? "（同名，推荐更新）" : ""}</option>)}</select><small>{controller.importTargetKey === "new" ? "保留现有方案，另外创建一套。" : "选中的方案会被这次导入替换。"}</small></label>{manifest && manifest.plugins.length > 0 && <details className="import-plugin-review"><summary>{manifest.plugins.length} 个插件，需要单独授权</summary>{manifest.plugins.map((plugin) => <div key={plugin.id}><strong>{plugin.name}</strong><span>{plugin.permissions.map((permission) => permissionLabels[permission]).join("，")}</span></div>)}</details>}<div className="import-dialog-actions"><Dialog.Close>取消</Dialog.Close><button type="button" disabled={controller.petPackages.loading} onClick={() => { void controller.confirmImport(); }}>{controller.importTargetKey === "new" ? "新建并使用" : "更新并使用"}</button></div></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

export function DesktopSettingsWindow({ controller }: { controller: DesktopSettingsWindowController }) {
  return <main className="settings-window-shell">
    <aside className="settings-sidebar"><div className="settings-brand"><img src={petLordBrandMark} alt="" aria-hidden="true" /><span>PetLord</span></div><nav aria-label="设置导航">{navigation.map((item) => { const Icon = item.icon; return <button type="button" className={controller.section === item.id ? "is-active" : ""} onClick={() => controller.setSection(item.id)} key={item.id}><Icon size={18} weight={controller.section === item.id ? "fill" : "regular"} />{item.label}</button>; })}</nav><button className="settings-hide-button" type="button" onClick={() => { void controller.close(); }}><X size={16} />隐藏设置</button></aside>
    <div className="settings-window-content">{controller.section === "pets" && <PetPackages controller={controller} />}{controller.section === "behavior" && <BehaviorSettings controller={controller} />}{controller.section === "plugins" && <PluginSettings controller={controller} />}{controller.settings.error && <div className="settings-inline-error">{controller.settings.error}</div>}{controller.petPackages.error && <div className="settings-inline-error">{controller.petPackages.error}</div>}</div>
    <input ref={controller.petPackages.fileInput} type="file" accept=".petlord,application/vnd.petlord.package+json" hidden onChange={controller.petPackages.onFileSelected} />
    <ImportDialog controller={controller} />
  </main>;
}
