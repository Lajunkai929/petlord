import {describe,it,expect} from 'vitest';
import {characterProjectSchema} from '@petlord/schema';
import {buildPetPackage} from './index';
function project(){return characterProjectSchema.parse({schemaVersion:1,id:'p',name:'P',characterName:'Pet',stylePrompt:'',identityPrompt:'',generationSettings:{imageModel:'x',imageMode:'native-image',videoModel:'v',imageResolution:'1K',videoResolution:'480p',ratio:'1:1',durationMode:'smart'},referenceArtifactIds:[],initialVariantId:'a',logicalStates:[{id:'idle',label:'Idle',position:{x:0,y:0}}],variants:[{id:'a',logicalStateId:'idle',label:'A',status:'approved',imageArtifactId:'a-image',origin:{kind:'initial'}},{id:'b',logicalStateId:'idle',label:'B',status:'approved',imageArtifactId:'b-image',origin:{kind:'reference'}}],transitions:[{id:'blink',label:'Blink',fromVariantId:'a',toLogicalStateId:'idle',toVariantId:'b',targetDraftArtifactId:'b-image',endFrameSource:'authority-reference',status:'approved',durationMs:300,nativeAnimation:{frames:[{imageArtifactId:'a-image',durationMs:100},{imageArtifactId:'middle',durationMs:50},{imageArtifactId:'b-image',durationMs:150}]}}],artifacts:['a-image','middle','b-image'].map(id=>({id,kind:'state-actual',uri:`/${id}.png`,mimeType:'image/png',createdAt:'2026-09-09T00:00:00.000Z',nativePixel:{frameId:id,width:3,height:2}})),jobs:[],updatedAt:'2026-09-09T00:00:00.000Z'});}
describe('native project export',()=>{
 it('exports explicit image durations and native dimensions without requiring video artifacts',()=>{
  const manifest=buildPetPackage(project());
  expect(manifest.states[0].nativePixel).toEqual({width:3,height:2});
  expect(manifest.transitions[0].nativeAnimation?.frames).toEqual([{imageUri:'/a-image.png',durationMs:100},{imageUri:'/middle.png',durationMs:50},{imageUri:'/b-image.png',durationMs:150}]);
  expect(manifest.transitions[0]).not.toHaveProperty('videoUri');
 });
 it.each(['missing','non-image','dimensions','first','last'])('rejects %s native frame artifacts',kind=>{
  const p=project();
  if(kind==='missing')p.artifacts=p.artifacts.filter(a=>a.id!=='middle');
  if(kind==='non-image')p.artifacts[1].mimeType='video/webm';
  if(kind==='dimensions')p.artifacts[1].nativePixel!.width=4;
  if(kind==='first')p.transitions[0].nativeAnimation!.frames[0].imageArtifactId='middle';
  if(kind==='last')p.transitions[0].nativeAnimation!.frames[2].imageArtifactId='middle';
  expect(()=>buildPetPackage(p)).toThrow();
 });
});

it('exports eight native gaze images and rejects missing or mismatched source frames',()=>{
 const p=project();
 const ids=Array.from({length:8},(_,i)=>`gaze-${i}`) as [string,string,string,string,string,string,string,string];
 p.logicalStates[0].pointerGaze={enabled:true,motionTarget:'eyes',activationRadius:1.4,anchor:{x:.5,y:.5},videoArtifactIds:[],segmentStartMs:0,directionKeyframesMs:[600,1200,1800,2400,3000,3600,4200,4800],blendDurationMs:0,nativeImageArtifactIds:ids};
 p.artifacts.push(...ids.map(id=>({...structuredClone(p.artifacts[0]),id,uri:`/${id}.png`})));
 expect(buildPetPackage(p).logicalStates[0].pointerGaze?.nativeImageUris).toEqual(ids.map(id=>`/${id}.png`));
 p.artifacts.at(-1)!.nativePixel!.width=4;
 expect(()=>buildPetPackage(p)).toThrow(/gaze/i);
 p.artifacts.pop();
 expect(()=>buildPetPackage(p)).toThrow(/gaze/i);
});
