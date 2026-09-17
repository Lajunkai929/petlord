import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { PNG } from "pngjs";
import { artifactSchema, characterProjectSchema, logicalStateSchema, nativePixelDocumentSchema, petPackageBundleSchema, stateVariantSchema, transitionSchema, collectRuntimeMediaUris, type Artifact, type CharacterProject, type NativePixelDocument, type PetPackageBundle } from "@petlord/schema";
import { createDesignProject, assertProjectReferences } from "@petlord/design-core";
import type { SqliteStore } from "./sqliteStore";

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
type ImportMedia = (dataUrl:string,id:string) => Promise<{uri:string;mimeType:string}>;
export interface InstalledSyncResult { imported: {key:string;projectId:string;name:string}[]; skipped: number; errors: {key:string;message:string}[] }
export interface InstalledPackageBindingStatus {
  available: boolean;
  linked: boolean;
  packageKey?: string;
  appliedRevision?: number;
  currentRevision: number;
  hasDraftChanges: boolean;
  exists: boolean;
  active: boolean;
}
export interface InstalledPackageHostSummary { key: string; active?: boolean }
export type InstalledPackageStatusReader = (key: string) => Promise<InstalledPackageHostSummary | undefined>;
interface ImportRecord {fingerprint:string;contentFingerprint?:string;projectId:string;size:number;mtimeMs:number;appliedRevision?:number}

function safePackageKey(key:string){if(!key||basename(key)!==key||key.includes("\\")||!key.endsWith(".petlord"))throw new Error("Invalid installed package key.");return key;}

export function decodeInstalledPackage(encoded: Uint8Array): PetPackageBundle {
  const bytes = encoded[0] === 31 && encoded[1] === 139 ? gunzipSync(encoded,{maxOutputLength:512*1024*1024}) : encoded;
  const raw = JSON.parse(Buffer.from(bytes).toString("utf8"));
  if (raw.bundleVersion === 2) {
    if (hash(JSON.stringify(raw.manifest)) !== raw.integrity?.manifestSha256) throw new Error("宠物包 manifest 校验失败。");
    if (raw.sourceProject !== undefined && hash(JSON.stringify(raw.sourceProject)) !== raw.integrity?.sourceProjectSha256) throw new Error("宠物包创作源码校验失败。");
    for (const [key, expected] of Object.entries(raw.integrity?.assets ?? {})) {
      const match = /^data:[^;,]+;base64,([A-Za-z0-9+/=]+)$/.exec(raw.assets?.[key] ?? "");
      if (!match || hash(Buffer.from(match[1],"base64")) !== expected) throw new Error(`宠物包素材 ${key} 校验失败。`);
    }
  }
  return petPackageBundleSchema.parse(raw);
}

export async function projectFromInstalledPackage(bundle: PetPackageBundle, fingerprint:string, fileName:string, importMedia:ImportMedia): Promise<CharacterProject> {
  const manifest=bundle.manifest, id=`installed-${fingerprint.slice(0,32)}`, timestamp=new Date().toISOString();
  const source=bundle.sourceProject;
  const uris=[...new Set([...collectRuntimeMediaUris(manifest),...(source?.artifacts.map(a=>a.uri)??[])])];
  const local=new Map<string,{uri:string;mimeType:string;dataUrl:string}>();
  for(const uri of uris){
    const dataUrl=uri.startsWith("asset://")?bundle.assets[uri.slice(8)]:uri;
    if(!dataUrl?.startsWith("data:"))throw new Error("此旧包仍引用外部媒体，请先从原设备重新导出包含媒体的完整宠物包。");
    const media=await importMedia(dataUrl,hash(dataUrl));local.set(uri,{...media,dataUrl});
  }
  const importedPackage={fingerprint,fileName,source:source?"editable-source" as const:"runtime-reconstructed" as const,warnings:source?[]:["此包没有原始创作源码。已恢复状态、动画、图片及触发条件；原始提示词、候选历史和绘画图层无法恢复。"]};
  if(source){
    const project=characterProjectSchema.parse({...source,id,identityProfileId:undefined,styleProfileId:undefined,importedPackage,updatedAt:timestamp,
      artifacts:source.artifacts.map(a=>({...a,uri:local.get(a.uri)!.uri})),
      jobs:source.jobs.map(job=>["succeeded","failed"].includes(job.status)?job:{...job,status:"failed",error:"导入的是源设备任务记录，本机未自动重新提交生成。"}),
    });assertProjectReferences(project);return project;
  }
  const base=createDesignProject({id,name:manifest.name,characterName:manifest.characterName,identityPrompt:"",stylePrompt:""});
  const nativeDimensions=new Map<string,{width:number;height:number}>();
  for(const state of manifest.states)if(state.nativePixel)nativeDimensions.set(state.imageUri,state.nativePixel);
  for(const transition of manifest.transitions)if(transition.nativeAnimation){
    const dimensions=manifest.states.find(s=>s.id===transition.fromStateId)?.nativePixel;
    if(dimensions)for(const frame of transition.nativeAnimation.frames)nativeDimensions.set(frame.imageUri,dimensions);
  }
  for(const state of manifest.logicalStates)if(state.pointerGaze?.nativeImageUris){
    const dimensions=manifest.states.find(variant=>variant.logicalStateId===state.id)?.nativePixel;
    if(dimensions)for(const uri of state.pointerGaze.nativeImageUris)nativeDimensions.set(uri,dimensions);
  }
  const artifacts:Artifact[]=[];const assets=new Map<string,Artifact>();
  for(const [index,uri] of uris.entries()){
    const media=local.get(uri)!;const dimensions=nativeDimensions.get(uri);
    const artifact=artifactSchema.parse({id:`import-asset-${index}`,kind:media.mimeType.startsWith("video/")?"transition-video":"state-actual",uri:media.uri,mimeType:media.mimeType,createdAt:timestamp,provenance:"user-upload",label:`导入素材 ${index+1}`,
      hasAlpha:dimensions?true:manifest.transitions.some(t=>t.videoUri===uri&&t.transparentVideo),
      ...(dimensions?{nativePixel:{...dimensions,frameId:`frame-${index+1}`},pixelWidth:dimensions.width,pixelHeight:dimensions.height}:{}),
    });artifacts.push(artifact);assets.set(uri,artifact);
  }
  const imageId=(uri:string)=>{const artifact=assets.get(uri);if(!artifact)throw new Error("宠物包缺少状态素材。");return artifact.id;};
  const variants=manifest.states.map(state=>stateVariantSchema.parse({id:state.id,logicalStateId:state.logicalStateId,label:state.label,status:"approved",imageArtifactId:imageId(state.imageUri),origin:{kind:state.origin}}));
  const logicalDefinitions=manifest.logicalStates ?? [...new Set(manifest.states.map(s=>s.logicalStateId))].map(id=>({id,label:manifest.states.find(s=>s.logicalStateId===id)!.label,variantIds:manifest.states.filter(s=>s.logicalStateId===id).map(s=>s.id)}));
  const logicalStates=logicalDefinitions.map((state,index)=>{
    const runtime=manifest.states.filter(s=>s.logicalStateId===state.id);
    const authority=runtime.find(s=>s.origin==="initial")??runtime.find(s=>s.origin==="reference")??runtime[0];
    const gaze="pointerGaze" in state?state.pointerGaze:undefined;
    return logicalStateSchema.parse({id:state.id,label:state.label,description:"",position:{x:80+(index%3)*340,y:80+Math.floor(index/3)*260},
      referenceArtifactId:authority?imageId(authority.imageUri):undefined,referenceArtifactIds:authority?[imageId(authority.imageUri)]:[],defaultVariantId:authority?.id,preferredOutboundVariantId:authority?.id,
      semanticKey:Object.entries(manifest.semanticActions).find(([,value])=>value===state.id)?.[0],idleScheduler:"idleScheduler" in state?state.idleScheduler:undefined,
      semanticAliases:Object.entries(manifest.semanticActions).filter(([,value])=>value===state.id).map(([key])=>key).slice(1),
      pointerGaze:gaze?{...gaze,nativeImageArtifactIds:gaze.nativeImageUris?.map(imageId),videoArtifactId:gaze.videoUri?imageId(gaze.videoUri):undefined,videoArtifactIds:gaze.videoUri?[imageId(gaze.videoUri)]:[]}:undefined,
    });
  });
  const transitions=manifest.transitions.map(transition=>{
    const target=manifest.states.find(state=>state.id===transition.toStateId)!;
    const from=manifest.states.find(state=>state.id===transition.fromStateId)!;
    return transitionSchema.parse({...transition,id:transition.id,label:`${from.label} → ${target.label}`,fromVariantId:transition.fromStateId,toLogicalStateId:target.logicalStateId,toVariantId:target.id,status:"approved",prompt:"",
      videoArtifactId:transition.videoUri?imageId(transition.videoUri):undefined,targetDraftArtifactId:imageId(transition.tailFrameUri),extractedTailArtifactId:imageId(transition.tailFrameUri),sourceVideoDurationMs:transition.durationMs,selectedEndMs:transition.durationMs,
      ...(transition.nativeAnimation?{nativeAnimation:{frames:transition.nativeAnimation.frames.map(frame=>({imageArtifactId:imageId(frame.imageUri),durationMs:frame.durationMs}))}}:{}),
    });
  });
  let pixelDocument:NativePixelDocument|undefined;
  if(nativeDimensions.size){
    try{
      const dimensions=[...nativeDimensions.values()][0];
      const keys=Array.from({length:94},(_,i)=>String.fromCharCode(33+i)).filter(k=>k!==".");
      const colors=new Map<string,string>(),palette:Record<string,string|null>={".":null};
      const frames=[...nativeDimensions].map(([uri,size])=>{
        if(size.width!==dimensions.width||size.height!==dimensions.height)throw new Error("原生帧尺寸不同");
        const encoded=Buffer.from(local.get(uri)!.dataUrl.split(",")[1],"base64");
        if(encoded.length<24||encoded.readUInt32BE(16)!==size.width||encoded.readUInt32BE(20)!==size.height)throw new Error("原生帧实际尺寸与声明不符");
        const png=PNG.sync.read(encoded);
        if(png.width!==size.width||png.height!==size.height)throw new Error("原生帧实际尺寸与声明不符");
        const rows=Array.from({length:png.height},(_,y)=>Array.from({length:png.width},(_,x)=>{
          const at=(y*png.width+x)*4,alpha=png.data[at+3];if(alpha===0)return ".";if(alpha!==255)throw new Error("原生帧包含半透明像素");
          const color="#"+png.data.subarray(at,at+3).toString("hex");let key=colors.get(color);if(!key){key=keys[colors.size];if(!key)throw new Error("颜色数量超过可编辑调色板上限");colors.set(color,key);palette[key]=color;}return key;
        }).join(""));return {id:assets.get(uri)!.nativePixel!.frameId,layers:[{id:"body",x:0,y:0,rows}]};
      });
      pixelDocument=nativePixelDocumentSchema.parse({schemaVersion:1,...dimensions,palette,frames});
      importedPackage.warnings.push("像素已从原图无损还原为单图层，原始图层拆分与继承关系未包含在旧包中。");
    }catch(error){importedPackage.warnings.push(`像素源稿未还原：${error instanceof Error?error.message:String(error)}。可继续使用原图和动画。`);}
  }
  const project=characterProjectSchema.parse({...base,importedPackage,pixelDocument,artifacts,variants,logicalStates,transitions,initialVariantId:manifest.initialStateId,referenceArtifactIds:[imageId(manifest.states.find(s=>s.id===manifest.initialStateId)!.imageUri)],runtimePresentation:manifest.runtimePresentation,plugins:manifest.plugins,
    dragInteraction:manifest.dragInteraction?{...manifest.dragInteraction,targetLogicalStateId:manifest.states.find(s=>s.id===manifest.dragInteraction!.targetStateId)?.logicalStateId,targetVariantId:manifest.dragInteraction.targetStateId}:undefined,
  });assertProjectReferences(project);return project;
}

export function createInstalledPackageImporter(store:SqliteStore,directory:string|undefined,importMedia:ImportMedia){
  let active:Promise<InstalledSyncResult>|undefined;
  let serial:Promise<void>=Promise.resolve();
  function exclusive<T>(operation:()=>Promise<T>):Promise<T>{
    const result=serial.then(operation,operation);
    serial=result.then(()=>undefined,()=>undefined);
    return result;
  }
  const readRecords=()=>store.getState<Record<string,ImportRecord>>("installed-package-imports")??{};

  async function statusUnlocked(projectId:string,currentRevision:number,available:boolean,readInstalledStatus?:InstalledPackageStatusReader):Promise<InstalledPackageBindingStatus>{
    const entry=Object.entries(readRecords()).find(([,record])=>record.projectId===projectId);
    if(!entry)return {available,linked:false,currentRevision,hasDraftChanges:true,exists:false,active:false};
    const [packageKey,record]=entry;
    let exists=false,activePackage=false;
    if(readInstalledStatus){const match=await readInstalledStatus(packageKey);exists=Boolean(match);activePackage=Boolean(match?.active);}
    else if(directory)exists=await stat(join(directory,safePackageKey(packageKey))).then(()=>true,error=>error?.code==="ENOENT"?false:Promise.reject(error));
    return {available,linked:true,packageKey,appliedRevision:record.appliedRevision,currentRevision,hasDraftChanges:record.appliedRevision!==currentRevision,exists,active:activePackage};
  }

  function status(projectId:string,currentRevision:number,available:boolean,readInstalledStatus?:InstalledPackageStatusReader){
    return exclusive(()=>statusUnlocked(projectId,currentRevision,available,readInstalledStatus));
  }

  async function recordAppliedUnlocked(packageKey:string,projectId:string,appliedRevision:number,encoded:Uint8Array){
    if(!directory)throw new Error("Installed packages directory is unavailable.");
    const safeKey=safePackageKey(packageKey),path=join(directory,safeKey),bytes=await readFile(path);
    if(hash(bytes)!==hash(encoded))throw new Error("The desktop host did not retain the package bytes that were applied.");
    const info=await stat(path),records=readRecords(),current=records[safeKey];
    if(current&&current.projectId!==projectId)throw new Error("The installed package is already linked to another project.");
    for(const [key,record] of Object.entries(records))if(record.projectId===projectId&&key!==safeKey)delete records[key];
    records[safeKey]={fingerprint:hash(bytes),contentFingerprint:hash(JSON.stringify(decodeInstalledPackage(bytes))),projectId,size:info.size,mtimeMs:info.mtimeMs,appliedRevision};
    store.setState("installed-package-imports",records);
  }

  function recordApplied(packageKey:string,projectId:string,appliedRevision:number,encoded:Uint8Array){return exclusive(()=>recordAppliedUnlocked(packageKey,projectId,appliedRevision,encoded));}

  function applyInstalledPackage<T>(projectId:string,appliedRevision:number,encoded:Uint8Array,readInstalledStatus:InstalledPackageStatusReader|undefined,install:(before:InstalledPackageBindingStatus)=>Promise<{installed:T;packageKey:string}>){
    return exclusive(async()=>{
      const before=await statusUnlocked(projectId,appliedRevision,true,readInstalledStatus);
      const result=await install(before);
      if(before.packageKey&&result.packageKey!==before.packageKey)throw new Error("The desktop host replaced a different installed pet.");
      await recordAppliedUnlocked(result.packageKey,projectId,appliedRevision,encoded);
      const binding=await statusUnlocked(projectId,appliedRevision,true,readInstalledStatus);
      return {...result,binding};
    });
  }

  function bindings(){return exclusive(async()=>Object.entries(readRecords()).map(([packageKey,record])=>({packageKey,projectId:record.projectId,appliedRevision:record.appliedRevision})));}

  return {sync(){
    if(active)return active;
    active=exclusive(async()=>{
      const result:InstalledSyncResult={imported:[],skipped:0,errors:[]};if(!directory)return result;
      const entries=await readdir(directory,{withFileTypes:true}).catch((error)=>{if(error.code==="ENOENT")return [];throw error;});
      const records=readRecords();
      const packageEntries=entries.filter(e=>e.isFile()&&e.name.endsWith(".petlord"));
      const presentKeys=new Set(packageEntries.map(entry=>entry.name));
      // Keep an existing owner when repairing historical shared associations.
      const ownerOf=(projectId:string)=>Object.entries(records).find(([key,record])=>presentKeys.has(key)&&record.projectId===projectId)?.[0];
      for(const entry of packageEntries){
        try{
          const path=join(directory,entry.name),info=await stat(path);
          let prior=records[entry.name],previousKey=entry.name;
          if(prior?.contentFingerprint&&prior.size===info.size&&prior.mtimeMs===info.mtimeMs&&ownerOf(prior.projectId)===entry.name&&store.getEntitySnapshot("project",prior.projectId)){result.skipped++;continue;}
          if(info.size>224*1024*1024)throw new Error("宠物包超过 224 MB 导入上限。");
          const bytes=await readFile(path),fingerprint=hash(bytes);
          const bundle=decodeInstalledPackage(bytes),contentFingerprint=hash(JSON.stringify(bundle));
          // Older records hashed the raw JSON. Recognize its gzip encoding without changing IDs.
          const unpackedFingerprint=bytes[0]===31&&bytes[1]===139?hash(gunzipSync(bytes,{maxOutputLength:512*1024*1024})):fingerprint;
          const sameContent=(record:ImportRecord)=>record.fingerprint===fingerprint||record.fingerprint===unpackedFingerprint||record.contentFingerprint===contentFingerprint;
          if(!prior){
            const renamed=Object.entries(records).filter(([key,record])=>!presentKeys.has(key)&&sameContent(record)&&!ownerOf(record.projectId));
            if(renamed.length===1)[previousKey,prior]=renamed[0];
          }
          const retainsAssociation=prior&&sameContent(prior)&&(!ownerOf(prior.projectId)||ownerOf(prior.projectId)===entry.name);
          let projectId=retainsAssociation?prior.projectId:`installed-${fingerprint.slice(0,32)}`;
          const claimedElsewhere=(id:string)=>Object.entries(records).some(([key,record])=>key!==previousKey&&key!==entry.name&&record.projectId===id);
          if(!retainsAssociation&&claimedElsewhere(projectId)){
            const base=`installed-${hash(`${entry.name}\0${fingerprint}`).slice(0,32)}`;
            projectId=base;
            for(let suffix=1;claimedElsewhere(projectId)||store.getEntitySnapshot("project",projectId);suffix++)projectId=`${base}-${suffix}`;
          }
          const record={fingerprint,contentFingerprint,projectId,size:info.size,mtimeMs:info.mtimeMs};
          const saveRecord=(appliedRevision:number|undefined)=>{
            if(previousKey!==entry.name)delete records[previousKey];
            records[entry.name]={...record,appliedRevision};
            store.setState("installed-package-imports",records);
          };
          const existing=store.getEntitySnapshot("project",projectId);
          if(existing){saveRecord(retainsAssociation?prior.appliedRevision:undefined);result.skipped++;continue;}
          const project=await projectFromInstalledPackage(bundle,fingerprint,entry.name,importMedia);
          project.id=projectId;
          // A deleted ID has no current entity; the store still advances the global revision.
          store.commitEntityCommand({type:"project",id:project.id,data:project,expectedRevision:null},snapshot=>saveRecord(snapshot.revision));
          result.imported.push({key:entry.name,projectId:project.id,name:project.name});
        }catch(error){result.errors.push({key:entry.name,message:error instanceof Error?error.message:String(error)});}
      }
      store.setState("installed-package-sync-status",{...result,checkedAt:new Date().toISOString()});return result;
    }).finally(()=>{active=undefined;});return active;
  },settle(){return serial;},status,recordApplied,applyInstalledPackage,bindings};
}
