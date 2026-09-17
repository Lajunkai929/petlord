import { characterProjectSchema, logicalStateSchema, nativePixelDocumentSchema, stateVariantSchema, transitionSchema, type CharacterProject, type NativePixelDocument, type TransitionTrigger } from '@petlord/schema';
import { assertProjectReferences } from '@petlord/design-core';
import { buildPetPackage } from '@petlord/state-engine';
import companion from '../../../packages/pixel-art/src/examples/lottery-companion.json';
import { renderNativeFrames } from './nativeDesign';

type ImportMedia = (dataUrl: string, mediaId: string) => Promise<{ id?: string; uri: string; mimeType: string }>;
const prefix = 'lottery-companion-';
const definitions = [
  ['sitting','坐着',['idle','sit']], ['resting','趴着',['rest']], ['sleeping','睡觉',['sleep']], ['stretching','伸懒腰',['stretch','play']],
  ['standing','站立',['stand']], ['belly-up','翻肚皮',['belly']], ['running','奔跑',['run']], ['pooping','蹲下便便',['poop']],
  ['peeing','抬腿尿尿',['pee']], ['carried','提起项圈',['carried','drag']], ['digging','挖土工作',['working','dig','digging']], ['attention','抬头招呼',['attention','happy','greet']],
] as const;
const series = (stem: string, first: number, last: number) => Array.from({length:last-first+1},(_,index)=>`${stem}-${first+index}`);
const continuous = new Set(['sitting','resting','sleeping','running','carried','digging','belly-up']);

/** Keep existing custom frame records and colors; rename colliding incoming palette keys. */
function mergeDocument(previous: NativePixelDocument | undefined, incoming: NativePixelDocument) {
  if (!previous) return incoming;
  if (previous.width !== incoming.width || previous.height !== incoming.height) throw new Error('Lottery companion requires the existing 48×48 native canvas.');
  const palette = {...previous.palette};
  const replacements = new Map<string,string>();
  for (const [key,color] of Object.entries(incoming.palette)) {
    if (Object.hasOwn(palette,key) && palette[key]?.toLowerCase() !== color?.toLowerCase()) {
      const same = Object.keys(palette).find(candidate=>palette[candidate]?.toLowerCase()===color?.toLowerCase());
      const free = same ?? Array.from({length:94},(_,index)=>String.fromCharCode(index+33)).find(candidate=>!Object.hasOwn(palette,candidate)&&!Object.hasOwn(incoming.palette,candidate));
      if (!free) throw new Error('The merged artwork palette has no free pixel keys.');
      replacements.set(key,free);palette[free]=color;
    } else palette[key]=color;
  }
  const remapRows = (rows:string[]) => rows.map(row=>[...row].map(key=>replacements.get(key)??key).join(''));
  const frames = incoming.frames.map(frame=>({...frame,
    ...(frame.layers?{layers:frame.layers.map(layer=>({...layer,rows:remapRows(layer.rows)}))}:{}),
    ...(frame.patches?{patches:frame.patches.map(patch=>({...patch,rows:remapRows(patch.rows)}))}:{}),
  }));
  const ids = new Set(frames.map(frame=>frame.id));
  return nativePixelDocumentSchema.parse({...incoming,palette,frames:[...frames,...previous.frames.filter(frame=>!ids.has(frame.id))]});
}

/** Builds a complete editable native companion; never writes a project/profile itself. */
export async function buildLotteryCompanion(projectInput: CharacterProject, importMedia: ImportMedia, document: NativePixelDocument = nativePixelDocumentSchema.parse(companion.document)): Promise<CharacterProject> {
  const original = characterProjectSchema.parse(projectInput);
  assertProjectReferences(original);
  const artwork = nativePixelDocumentSchema.parse(document);
  if (artwork.width!==48 || artwork.height!==48) throw new Error('Lottery companion artwork must use its original 48×48 resolution.');
  const restBridge=series('sit-to-rest',2,7);
  const sleepBridge=['rest-to-sleep-2','rest-to-sleep-4','rest-to-sleep-5','rest-to-sleep-6'];
  const required=[...definitions.map(([id])=>id),...restBridge,...sleepBridge,...series('running',2,6),...series('digging',1,7),...series('carried',1,3),...series('belly-up',1,3),...series('pooping',1,3),...series('peeing',1,3),...series('attention',1,2),...series('sitting-gaze',0,7),...series('resting-gaze',0,7),'stand-rise','squat-down','lift-leg','collar-tension','collar-lift','dig-lower','dig-ready','belly-roll','turning','roll-half','sleep-idle-2','sit-idle-2','sit-idle-3','sit-idle-6','sit-idle-7','sit-idle-10'];
  const available=new Set(artwork.frames.map(frame=>frame.id));
  for(const id of required)if(!available.has(id))throw new Error(`Missing companion artwork frame ${id}.`);
  const merged=mergeDocument(original.pixelDocument,artwork);
  const rendered=await renderNativeFrames({...original,pixelDocument:merged},artwork.frames.map(frame=>frame.id),async(dataUrl,id)=>({...await importMedia(dataUrl,id),id}));
  const byFrame=new Map(rendered.frames.map(artifact=>[artifact.nativePixel!.frameId,artifact]));
  const variants=[...original.variants];
  const canonical=new Map<string,string>();
  const states=new Map(original.logicalStates.map(state=>[state.id,state]));
  for(const [index,[id,label,semantics]] of definitions.entries()) {
    const image=byFrame.get(id)!;
    let variant=variants.find(variant=>variant.logicalStateId===id&&variant.status==='approved'&&variant.imageArtifactId===image.id);
    if(!variant){variant=stateVariantSchema.parse({id:`${prefix}variant-${id}-${image.id}`,logicalStateId:id,label:`${label} · 权威参考`,status:'approved',imageArtifactId:image.id,origin:{kind:'reference'}});variants.push(variant);}
    canonical.set(id,variant.id);
    const previous=states.get(id);
    states.set(id,logicalStateSchema.parse({...previous,id,label,semanticKey:semantics[0],semanticAliases:[...new Set([...semantics.slice(1),...(previous?.semanticAliases??[])])],position:previous?.position??{x:80+(index%4)*320,y:80+Math.floor(index/4)*280},
      defaultVariantId:variant.id,preferredOutboundVariantId:variant.id,referenceArtifactId:image.id,referenceArtifactIds:[...new Set([...(previous?.referenceArtifactIds??[]),image.id])],
      idleScheduler:{...(previous?.idleScheduler??{}),enabled:continuous.has(id),playbackMode:'continuous',avoidImmediateRepeat:false},
      ...(['sitting','resting'].includes(id)?{pointerGaze:{enabled:true,motionTarget:'head',activationRadius:1.4,anchor:{x:.5,y:.5},blendDurationMs:0,nativeImageArtifactIds:series(`${id}-gaze`,0,7).map(frame=>byFrame.get(frame)!.id)}}:{}),
    }));
  }
  // Older generated artwork remains in history, but obsolete poses should not re-enter playback.
  // Keep any variant still used by a caller-authored transition.
  const retainedVariantIds=new Set(original.transitions.filter(edge=>!edge.id.startsWith(prefix)).flatMap(edge=>[edge.fromVariantId,edge.toVariantId]));
  for(const [index,variant] of variants.entries())if(variant.id.startsWith(`${prefix}variant-`)&&variant.status==='approved'&&canonical.has(variant.logicalStateId)&&canonical.get(variant.logicalStateId)!==variant.id&&!retainedVariantIds.has(variant.id))variants[index]={...variant,status:'draft'};
  // Keep historical timelines editable, while removing their competing built-in triggers/loops.
  const legacyBuiltins=new Set(['sit-idle','sleep-idle','sit-to-rest','sit-to-rest-reverse','rest-to-sleep','rest-to-sleep-reverse']);
  const transitions=original.transitions.filter(edge=>!edge.id.startsWith(prefix)).map(edge=>legacyBuiltins.has(edge.id)?{...edge,triggers:edge.triggers.map(trigger=>({...trigger,enabled:false})),...(edge.idleRule?{idleRule:{...edge.idleRule,enabled:false}}:{})}:edge);
  const click=(id:string):TransitionTrigger=>({id:`${prefix}${id}-click`,event:'left-click',enabled:true});
  const timeout=(id:string,ms=1000):TransitionTrigger=>({id:`${prefix}${id}-timeout`,event:'state-timeout',enabled:true,timerDurationMs:ms});
  type Frame=string|readonly [string,number];
  const add=(id:string,from:string,to:string,middle:Frame[],options:{loop?:boolean;triggers?:TransitionTrigger[];startMs?:number;endMs?:number;frameMs?:number}={})=>{
    const frames=[{imageArtifactId:byFrame.get(from)!.id,durationMs:options.startMs??180},...middle.map(frame=>({imageArtifactId:byFrame.get(typeof frame==='string'?frame:frame[0])!.id,durationMs:typeof frame==='string'?(options.frameMs??120):frame[1]})),{imageArtifactId:byFrame.get(to)!.id,durationMs:options.endMs??180}];
    const durationMs=frames.reduce((sum,frame)=>sum+frame.durationMs,0);
    transitions.push(transitionSchema.parse({id:`${prefix}${id}`,label:`${states.get(from)!.label} → ${states.get(to)!.label}${options.loop?' · 循环':''}`,fromVariantId:canonical.get(from),toLogicalStateId:to,toVariantId:canonical.get(to),targetDraftArtifactId:byFrame.get(to)!.id,endFrameSource:from===to?'source-frame':'authority-reference',status:'approved',nativeAnimation:{frames},durationMs,entryBlendMs:0,authorityBridge:{mode:'hard-cut',durationMs:120},playback:{mode:'forward',repeatMode:'fixed',minCycles:1,maxCycles:1,segmentStartMs:0,segmentEndMs:durationMs},triggers:options.triggers??[],...(options.loop?{idleRule:{enabled:true,weight:1,cooldownMs:0}}:{})}));
  };
  add('sit-stand','sitting','standing',['stand-rise','turning']);
  add('stand-sit','standing','sitting',['turning','stand-rise']);
  add('stand-rest','standing','resting',['turning','stand-rise','sitting',...restBridge]);
  add('rest-stand','resting','standing',[...[...restBridge].reverse(),'sitting','stand-rise','turning'],{triggers:[click('rest-return')]});
  add('rest-sleep','resting','sleeping',sleepBridge);
  add('sleep-rest','sleeping','resting',[...sleepBridge].reverse(),{triggers:[click('sleep-return')]});
  add('stand-stretch','standing','stretching',['turning','stand-rise','sitting',...restBridge,'resting']);
  add('stretch-stand','stretching','standing',['resting',...[...restBridge].reverse(),'sitting','stand-rise','turning'],{triggers:[click('stretch-return'),timeout('stretch-return',2200)]});
  add('stand-belly','standing','belly-up',['turning','stand-rise','sitting',...restBridge,'resting','roll-half','belly-roll']);
  add('belly-stand','belly-up','standing',['belly-roll','roll-half','resting',...[...restBridge].reverse(),'sitting','stand-rise','turning'],{triggers:[click('belly-return')]});
  add('stand-run','standing','running',['running-2']);
  add('run-stand','running','standing',['running-6','running-2'],{triggers:[click('run-return')]});
  add('stand-poop','standing','pooping',['squat-down']);
  add('poop-complete','pooping','standing',[['pooping-1',500],['pooping-2',600],['pooping-3',700],['pooping-2',350],['pooping-1',200],'squat-down'],{triggers:[timeout('poop-complete')],startMs:350,endMs:250});
  add('stand-pee','standing','peeing',['lift-leg']);
  add('pee-complete','peeing','standing',[['peeing-1',400],['peeing-2',650],['peeing-3',650],['peeing-2',350],['peeing-1',200],'lift-leg'],{triggers:[timeout('pee-complete')],startMs:350,endMs:250});
  add('stand-carried','standing','carried',['collar-tension','collar-lift']);
  add('carried-stand','carried','standing',['collar-lift','collar-tension'],{triggers:[click('carried-return')]});
  add('stand-dig','standing','digging',['dig-lower','dig-ready']);
  add('dig-stand','digging','standing',['dig-ready','dig-lower'],{triggers:[click('dig-return')]});
  add('stand-attention','standing','attention',['turning','stand-rise','sitting','sit-idle-6'],{triggers:[click('stand-greet')]});
  add('sit-attention','sitting','attention',['sit-idle-6'],{triggers:[click('sit-greet')]});
  add('attention-stand','attention','standing',[['attention-1',250],['attention-2',350],['attention-1',250],'sitting','stand-rise','turning'],{triggers:[click('attention-return'),timeout('attention-return',2000)]});
  add('sitting-loop','sitting','sitting',[['sit-idle-2',140],['sit-idle-3',180],['sit-idle-2',140],['sitting',600],['sit-idle-6',90],['sit-idle-7',110],['sit-idle-6',90],['sitting',600],['sit-idle-10',120]],{loop:true,startMs:650,endMs:450});
  add('resting-loop','resting','resting',[['rest-to-sleep-2',200]],{loop:true,startMs:1600,endMs:1400});
  add('sleeping-loop','sleeping','sleeping',[['sleep-idle-2',900]],{loop:true,startMs:1100,endMs:1100});
  add('running-loop','running','running',series('running',2,6),{loop:true,startMs:80,endMs:80,frameMs:80});
  add('digging-loop','digging','digging',series('digging',1,7),{loop:true,startMs:120,endMs:120,frameMs:120});
  add('carried-loop','carried','carried',['carried-1','carried-2','carried-3','carried-2','carried-1'],{loop:true,startMs:300,endMs:300,frameMs:180});
  add('belly-loop','belly-up','belly-up',['belly-up-1','belly-up-2','belly-up-3','belly-up-2','belly-up-1'],{loop:true,startMs:450,endMs:450,frameMs:200});
  // Earlier approved snapshots stay switchable and can always rejoin the current graph.
  for(const variant of variants){
    const target=canonical.get(variant.logicalStateId);
    if(variant.status!=='approved'||!target||variant.id===target)continue;
    const targetImage=byFrame.get(variant.logicalStateId)!;
    transitions.push(transitionSchema.parse({id:`${prefix}rejoin-${variant.id}`,label:'返回当前像素状态',fromVariantId:variant.id,toLogicalStateId:variant.logicalStateId,toVariantId:target,targetDraftArtifactId:targetImage.id,endFrameSource:'authority-reference',status:'approved',nativeAnimation:{frames:[{imageArtifactId:variant.imageArtifactId,durationMs:120},{imageArtifactId:targetImage.id,durationMs:120}]},durationMs:240,entryBlendMs:0,triggers:[click(`rejoin-${variant.id}`)]}));
  }
  const result=characterProjectSchema.parse({...rendered.project,logicalStates:[...states.values()],variants,transitions,initialVariantId:canonical.get('sitting'),dragInteraction:{enabled:true,targetLogicalStateId:'carried',targetVariantId:canonical.get('carried'),anchor:{x:21/48,y:25/48},alignmentDurationMs:180,returnDurationMs:300},runtimePresentation:{...original.runtimePresentation,defaultDisplaySize:240},updatedAt:new Date().toISOString()});
  assertProjectReferences(result);buildPetPackage(result);
  return result;
}
