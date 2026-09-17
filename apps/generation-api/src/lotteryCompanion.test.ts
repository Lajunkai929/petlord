import {describe,it,expect,vi} from 'vitest';
import {PNG} from 'pngjs';
import {characterProjectSchema,nativePixelDocumentSchema,type CharacterProject} from '@petlord/schema';
import {createDesignProject,assertProjectReferences,ensureAuthorityVariants} from '@petlord/design-core';
import {buildPetPackage} from '@petlord/state-engine';
import {renderPixelFrame} from '@petlord/pixel-art';
import artwork from '../../../packages/pixel-art/src/examples/lottery-companion.json';
import {buildLotteryCompanion} from './lotteryCompanion';
const ids=['sitting','resting','sleeping','stretching','standing','belly-up','running','pooping','peeing','carried','digging','attention'];
function original():CharacterProject {
 const document=nativePixelDocumentSchema.parse(artwork.document);
 return characterProjectSchema.parse({...createDesignProject({id:'test-lottery',name:'My Lottery',characterName:'Lottery',identityPrompt:'keep identity',stylePrompt:'keep style'}),
  pixelDocument:{...document,palette:{...document.palette,r:'#abcdef'},frames:[...document.frames.slice(0,20),{id:'my-frame',layers:[{id:'mine',x:0,y:0,rows:['r']}]}]},
  logicalStates:ids.slice(0,4).map((id,index)=>({id,label:id,position:{x:index*100,y:0},referenceArtifactId:`old-${id}`,referenceArtifactIds:[`old-${id}`],defaultVariantId:`old-variant-${id}`})),
  artifacts:ids.slice(0,4).map(id=>({id:`old-${id}`,kind:'state-actual',uri:`/old-${id}.png`,mimeType:'image/png',createdAt:'2026-09-09T00:00:00.000Z',nativePixel:{frameId:id,width:48,height:48}})),
  variants:ids.slice(0,4).map(id=>({id:`old-variant-${id}`,logicalStateId:id,label:id,status:'approved',imageArtifactId:`old-${id}`,origin:{kind:'reference'}})),initialVariantId:'old-variant-sitting',transitions:[],jobs:[]});
}
function media(){return vi.fn(async(dataUrl:string,id:string)=>({id,uri:dataUrl,mimeType:'image/png'}));}
describe('Lottery companion project builder',()=>{
 it('preserves original records and custom pixels while producing an exportable, reachable twelve-state graph',async()=>{
  const before=original();before.runtimePresentation={defaultFrameRate:30,defaultRenderResolution:720,defaultPixelGridSize:64,defaultDisplaySize:320,pixelated:false};
  const snapshot=structuredClone(before),persist=media();
  const project=await buildLotteryCompanion(before,persist);
  expect(ensureAuthorityVariants(project)).toEqual(project);
  expect(project.runtimePresentation).toEqual({...before.runtimePresentation,defaultDisplaySize:240});
  expect(before).toEqual(snapshot);expect(project.id).toBe(before.id);expect(project.name).toBe(before.name);expect(project.identityPrompt).toBe(before.identityPrompt);
  for(const artifact of before.artifacts)expect(project.artifacts.find(a=>a.id===artifact.id)).toEqual(artifact);
  for(const variant of before.variants)expect(project.variants.find(a=>a.id===variant.id)).toEqual(variant);
  expect(project.pixelDocument!.frames.find(frame=>frame.id==='my-frame')).toEqual(before.pixelDocument!.frames.find(frame=>frame.id==='my-frame'));
  expect(project.pixelDocument!.palette.r).toBe('#abcdef');
  expect(new Set(project.logicalStates.map(state=>state.id))).toEqual(new Set(ids));
  assertProjectReferences(project);const manifest=buildPetPackage(project);
  const reachable=(from:string,to:string)=>{const seen=new Set([from]),queue=[from];while(queue.length){const current=queue.shift()!;if(current===to)return true;for(const edge of manifest.transitions.filter(edge=>edge.fromStateId===current))if(!seen.has(edge.toStateId)){seen.add(edge.toStateId);queue.push(edge.toStateId);}}return false;};
  for(const state of manifest.states)expect(reachable(state.id,manifest.initialStateId),state.id).toBe(true);
  for(const logicalId of ids){const target=project.logicalStates.find(state=>state.id===logicalId)!.defaultVariantId!;expect(reachable(manifest.initialStateId,target),logicalId).toBe(true);}
  expect(manifest.semanticActions).toMatchObject({idle:'sitting',sit:'sitting',stand:'standing',belly:'belly-up',run:'running',poop:'pooping',pee:'peeing',carried:'carried',drag:'carried',working:'digging',dig:'digging',digging:'digging',attention:'attention',happy:'attention',greet:'attention',stretch:'stretching',play:'stretching'});
  const carried=project.artifacts.find(artifact=>artifact.id===project.logicalStates.find(state=>state.id==='carried')!.referenceArtifactId)!;
  expect(PNG.sync.read(Buffer.from(carried.uri.split(',')[1],'base64')).data).toEqual(Buffer.from(renderPixelFrame(nativePixelDocumentSchema.parse(artwork.document),'carried').rgba));
  expect(persist).toHaveBeenCalled();
  for(const [dataUrl] of persist.mock.calls){const png=PNG.sync.read(Buffer.from(dataUrl.split(',')[1],'base64'));expect([png.width,png.height]).toEqual([48,48]);}
 });
 it('binds ordered gaze PNGs, exact native endpoints, continuous loops and one-shot waste return animations',async()=>{
  const p=await buildLotteryCompanion(original(),media());const manifest=buildPetPackage(p),artifacts=new Map(p.artifacts.map(a=>[a.id,a]));
  for(const id of ['sitting','resting'])expect(p.logicalStates.find(s=>s.id===id)!.pointerGaze!.nativeImageArtifactIds!.map(id=>artifacts.get(id)!.nativePixel!.frameId)).toEqual(Array.from({length:8},(_,index)=>`${id}-gaze-${index}`));
  for(const id of ['sitting','resting'])expect(p.logicalStates.find(s=>s.id===id)!.pointerGaze!.motionTarget).toBe('head');
  expect(p.dragInteraction).toMatchObject({enabled:true,targetLogicalStateId:'carried',anchor:{x:21/48,y:25/48}});
  for(const id of ['running','digging','carried','sleeping','sitting','resting']){
   const logical=p.logicalStates.find(s=>s.id===id)!;expect(logical.idleScheduler).toMatchObject({enabled:true,playbackMode:'continuous'});
   expect(p.transitions.some(edge=>edge.fromVariantId===logical.defaultVariantId&&edge.toLogicalStateId===id&&edge.idleRule?.enabled)).toBe(true);
  }
  for(const id of ['pooping','peeing']){
   const logical=p.logicalStates.find(s=>s.id===id)!;expect(logical.idleScheduler.enabled).toBe(false);
   const exits=p.transitions.filter(edge=>edge.fromVariantId===logical.defaultVariantId&&edge.triggers.some(trigger=>trigger.enabled&&trigger.event==='state-timeout'));
   expect(exits).toHaveLength(1);expect(exits[0].toLogicalStateId).toBe('standing');expect(exits[0].playback).toMatchObject({minCycles:1,maxCycles:1});
   const frames=exits[0].nativeAnimation!.frames.map(f=>artifacts.get(f.imageArtifactId)!.nativePixel!.frameId);
   expect(frames).toEqual(expect.arrayContaining([`${id}-1`,`${id}-2`,`${id}-3`]));
   expect(p.transitions.filter(edge=>edge.fromVariantId===logical.defaultVariantId&&edge.toLogicalStateId===id&&edge.idleRule?.enabled)).toHaveLength(0);
  }
  for(const edge of manifest.transitions){expect(edge.nativeAnimation!.frames[0].imageUri).toBe(manifest.states.find(state=>state.id===edge.fromStateId)!.imageUri);expect(edge.nativeAnimation!.frames.at(-1)!.imageUri).toBe(edge.tailFrameUri);expect(edge.durationMs).toBe(edge.nativeAnimation!.frames.reduce((total,f)=>total+f.durationMs,0));}
 });
 it('is repeatable without duplicating media, variants or transitions',async()=>{
  const persist=media();const once=await buildLotteryCompanion(original(),persist);persist.mockClear();const twice=await buildLotteryCompanion(once,persist);
  expect(persist).not.toHaveBeenCalled();expect(twice.artifacts).toEqual(once.artifacts);expect(twice.variants).toEqual(once.variants);expect(twice.transitions).toEqual(once.transitions);
 });
 it('rejects incomplete artwork before importing media',async()=>{
  const persist=media();const document=nativePixelDocumentSchema.parse(artwork.document);document.frames=document.frames.filter(frame=>frame.id!=='digging-7');
  await expect(buildLotteryCompanion(original(),persist,document)).rejects.toThrow(/digging-7/);expect(persist).not.toHaveBeenCalled();
 });
 it('retires superseded generated poses from playback while retaining their art and unrelated approved variants',async()=>{
  const once=await buildLotteryCompanion(original(),media());
  const oldStanding=once.logicalStates.find(s=>s.id==='standing')!.defaultVariantId!;
  const oldImage=once.variants.find(v=>v.id===oldStanding)!.imageArtifactId;
  const revised=nativePixelDocumentSchema.parse(artwork.document);
  revised.frames.find(f=>f.id==='standing')!.layers!.push({id:'new-fur-mark',x:27,y:31,rows:['v']});
  const twice=await buildLotteryCompanion(once,media(),revised);
  expect(twice.variants.find(v=>v.id===oldStanding)!.status).toBe('draft');
  expect(twice.artifacts.find(a=>a.id===oldImage)).toEqual(once.artifacts.find(a=>a.id===oldImage));
  expect(twice.variants.find(v=>v.id==='old-variant-sitting')!.status).toBe('approved');
  expect(buildPetPackage(twice).states.some(s=>s.id===oldStanding)).toBe(false);
 });
});
