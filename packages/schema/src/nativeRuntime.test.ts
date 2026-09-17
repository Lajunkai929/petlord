import {describe,it,expect} from 'vitest';
import {petPackageManifestSchema, type PetPackageManifest} from './index';
import {PetRuntimeCore} from '../../runtime-core/src';
import {buildPortablePetBundleV2} from '../../design-core/src/portablePetPackage';
import {decodePetPackage,materializePackageManifest} from '../../../apps/desktop/src/hooks/useDesktopPetPackage';
export function nativeManifest() {
 return {manifestVersion:1,id:'native',name:'Native',characterName:'Pet',initialStateId:'a',states:[
  {id:'a',logicalStateId:'idle',label:'A',origin:'initial',imageUri:'/a.png',nativePixel:{width:3,height:2}},
  {id:'b',logicalStateId:'idle',label:'B',origin:'reference',imageUri:'/b.png',nativePixel:{width:3,height:2}},
 ],transitions:[{id:'native',fromStateId:'a',toStateId:'b',tailFrameUri:'/b.png',durationMs:300,nativeAnimation:{frames:[{imageUri:'/a.png',durationMs:100},{imageUri:'/mid.png',durationMs:50},{imageUri:'/b.png',durationMs:150}]}},{id:'video',fromStateId:'b',toStateId:'a',videoUri:'/v.webm',tailFrameUri:'/a.png',durationMs:1000}],logicalStates:[],semanticActions:{},plugins:[]} as unknown as PetPackageManifest;
}
describe('native runtime packages',()=>{
 it('accepts mixed video and exact native frames without injecting native defaults into legacy transitions',()=>{
  const parsed=petPackageManifestSchema.parse(nativeManifest());
  expect(parsed.transitions[0].nativeAnimation?.frames[1]).toEqual({imageUri:'/mid.png',durationMs:50});
  expect(parsed.transitions[1]).not.toHaveProperty('nativeAnimation');
  expect(parsed.transitions[0]).not.toHaveProperty('videoUri');
 });
 it.each(['first','last','duration','empty','dimensions'])('rejects invalid native %s',(kind)=>{
  const input=nativeManifest(); const edge=input.transitions[0];
  if(kind==='first') edge.nativeAnimation!.frames[0].imageUri='/wrong.png';
  if(kind==='last') edge.nativeAnimation!.frames[2].imageUri='/wrong.png';
  if(kind==='duration') edge.durationMs=301;
  if(kind==='empty') edge.nativeAnimation!.frames=[];
  if(kind==='dimensions') input.states[1].nativePixel={width:4,height:2};
  expect(petPackageManifestSchema.safeParse(input).success).toBe(false);
 });
 it('finishes at the exact final cycle boundary without blending native pixels',()=>{
  const input=nativeManifest(); input.transitions[0].playback={mode:'forward',repeatMode:'fixed',minCycles:2,maxCycles:2,segmentStartMs:0};
  const core=new PetRuntimeCore(input,{now:()=>0}); core.beginTransition('native');
  expect(core.videoTimeReached(599)).toBe(false);
  expect(core.getSnapshot().currentStateId).toBe('a');
  expect(core.videoTimeReached(600)).toBe(true);
  expect(core.getSnapshot()).toMatchObject({currentStateId:'b',phase:'idle'});
  expect(core.finishVideo()).toBe(false);
 });
 it('preserves native frames through V2 asset packing, integrity verification and desktop resolution',async()=>{
  const manifest=petPackageManifestSchema.parse(nativeManifest());
  const bundle=await buildPortablePetBundleV2(manifest,new Map([['/a.png','data:image/png;base64,QQ=='],['/b.png','data:image/png;base64,Qg=='],['/mid.png','data:image/png;base64,Qw=='],['/v.webm','data:video/webm;base64,RA==']]));
  const decoded=await decodePetPackage(JSON.stringify(bundle));
  expect(decoded.manifest.transitions[0].nativeAnimation?.frames[1].imageUri).toMatch(/^asset:\/\//);
  expect(materializePackageManifest(decoded).transitions[0].nativeAnimation?.frames[1]).toEqual({imageUri:'data:image/png;base64,Qw==',durationMs:50});
  const missing=structuredClone(bundle); const key=missing.manifest.transitions[0].nativeAnimation!.frames[1].imageUri.slice(8); delete missing.assets[key];
  await expect(decodePetPackage(JSON.stringify(missing))).rejects.toThrow();
 });
});

it('requires ping-pong motion to be authored as explicit native frames',()=>{
 const input=nativeManifest();input.transitions[0].playback={mode:'ping-pong',repeatMode:'fixed',minCycles:1,maxCycles:1,segmentStartMs:0};
 expect(petPackageManifestSchema.safeParse(input).success).toBe(false);
});
it('enters a native destination directly after a generated video completes',()=>{
 const input=nativeManifest();input.states[0].nativePixel=undefined;input.transitions=[{...input.transitions[1],id:'generated-native',fromStateId:'a',toStateId:'b',tailFrameUri:'/b.png'}];
 const core=new PetRuntimeCore(input,{now:()=>0});core.beginTransition('generated-native');core.finishVideo();
 expect(core.getSnapshot()).toMatchObject({phase:'idle',currentStateId:'b'});
});
