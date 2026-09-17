import {useCallback,useEffect,useState} from 'react';
import {Button,Switch} from '@petlord/ui';
import type {PetPackageManifest} from '@petlord/schema';
import type {DesktopSettingsController} from '../hooks/useDesktopSettings';
import type {DesktopWasteFile} from '../desktopBridge';
const wasteWarning=(warning:string)=>warning.startsWith('Desktop position:')?'文件已创建，系统未能摆放图标；可手动移动，或检查 Finder 的排列方式与自动化权限。':warning.startsWith('Custom icon:')?'文件已创建，但系统未能设置自定义图标。':'文件已创建，部分桌面效果未完成。';
const actions=[['sit','坐着'],['stand','站起来'],['rest','趴下'],['sleep','睡觉'],['belly','翻肚皮'],['stretch','伸懒腰'],['run','跑一跑'],['poop','拉粑粑'],['pee','尿尿'],['dig','刨坑'],['attention','打招呼']] as const;
export function DesktopCompanionSettings({settings,manifest}:{settings:DesktopSettingsController;manifest:PetPackageManifest|null|undefined}){
 const [files,setFiles]=useState<DesktopWasteFile[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{try{const result=await window.petLordDesktop?.listDesktopWaste();if(result){setFiles(result.files.filter(f=>f.ownedFilePresent));setError(result.error??'');}}catch(e){setError(e instanceof Error?e.message:'无法读取桌面纪念文件');}},[]);
 useEffect(()=>{void refresh();return window.petLordDesktop?.onDesktopWaste(()=>void refresh());},[refresh]);
 async function perform(action:string){setError('');try{await window.petLordDesktop?.performCompanionAction(action);}catch(e){setError(e instanceof Error?e.message:'无法播放动作');}}
 async function clean(id:string){setBusy(true);setError('');try{const result=await window.petLordDesktop?.trashDesktopWaste(id);if(result&&!result.ok)setError(result.error??'文件未能移到废纸篓');else await refresh();}catch(e){setError(e instanceof Error?e.message:'清理失败');}finally{setBusy(false);}}
 return <section className="companion-settings" aria-label="日常互动">
  <div className="companion-settings-heading"><h2>日常互动</h2><Button size="small" disabled={!manifest} onClick={()=>void perform('idle')}>停止动作</Button></div>
  <div className="companion-action-list">{actions.filter(([key])=>manifest?.semanticActions[key]).map(([key,label])=><Button key={key} onClick={()=>void perform(key)}>{label}</Button>)}</div>
  <div className="behavior-control-block"><span><strong id="desktop-waste-label">留下真实的桌面纪念</strong><small>拉粑粑或尿尿后生成对应图标的文件。默认关闭，动作照常播放。</small></span><Switch aria-labelledby="desktop-waste-label" checked={settings.settings.desktopWasteEnabled} onChange={value=>void settings.update({desktopWasteEnabled:value})}/></div>
  {files.length>0&&<div className="companion-waste-list"><div className="companion-settings-heading"><strong>{files.length} 份小纪念</strong><Button size="small" onClick={()=>void refresh()}>刷新</Button></div>{files.slice(-10).reverse().map(file=><div className="companion-waste-row" key={file.id}><span><strong>{file.kind==='poop'?'💩 粑粑':'尿渍'}</strong><small>{new Date(file.createdAt).toLocaleString()}{file.warnings.length>0&&` · ${file.warnings.map(wasteWarning).join('；')}`}</small></span><Button size="small" disabled={busy} onClick={()=>void clean(file.id)}>移到废纸篓</Button></div>)}</div>}
  {error&&<p role="alert" className="settings-inline-error">{error}</p>}
 </section>;
}
