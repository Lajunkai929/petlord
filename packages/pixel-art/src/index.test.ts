import { describe, expect, it } from 'vitest';
import * as pixel from './index';
const document = {schemaVersion:1 as const,width:3,height:2,palette:{R:'#FF0000',B:'#0000FF',T:null},frames:[
 {id:'base',layers:[{id:'body',x:0,y:0,rows:['RR.','RT.']},{id:'eye',x:1,y:0,rows:['B']}]},
 {id:'patch',baseFrameId:'base',patches:[{layerId:'body',x:0,y:0,rows:['.B']}],layers:[{id:'eye',x:2,y:1,rows:['B']}]},
]};
describe('native pixels',()=>{
 it('maps palette and transparent cells in ordered layers',()=>{
  expect([...pixel.renderPixelFrame(document,'base').rgba]).toEqual([255,0,0,255,0,0,255,255,0,0,0,0,255,0,0,255,0,0,0,0,0,0,0,0]);
 });
 it('clears patches and replaces inherited layers without modifying the source',()=>{
  const before=JSON.stringify(document);
  expect([...pixel.renderPixelFrame(document,'patch').rgba]).toEqual([0,0,0,0,0,0,255,255,0,0,0,0,255,0,0,255,0,0,0,0,0,0,255,255]);
  expect(JSON.stringify(document)).toBe(before);
 });
 it.each([
  {id:'bad',layers:[{id:'x',x:0,y:0,rows:['X']}]},
  {id:'bad',layers:[{id:'x',x:0,y:0,rows:['R','RR']}]},
  {id:'bad',layers:[{id:'x',x:3,y:0,rows:['R']}]},
  {id:'bad',baseFrameId:'base',patches:[{layerId:'absent',x:0,y:0,rows:['R']}]},
  {id:'bad',baseFrameId:'base',patches:[{layerId:'eye',x:1,y:0,rows:['R']}]},
  {id:'bad',baseFrameId:'bad'},
  {id:'bad',baseFrameId:'missing'},
 ])('rejects invalid edit with frame diagnostics: %j',(frame)=>{
  const result=pixel.validatePixelDocument({...document,frames:[...document.frames,frame]});
  expect(result.valid).toBe(false);
  expect(result.diagnostics.some(d=>d.frameId==='bad')).toBe(true);
 });
 it('rejects cycles, duplicate IDs and resource overflow',()=>{
  for(const frames of [[{id:'a',baseFrameId:'b'},{id:'b',baseFrameId:'a'}],[{id:'a'},{id:'a'}],Array.from({length:257},(_,i)=>({id:String(i)}))]){
   expect(pixel.validatePixelDocument({...document,frames}).valid).toBe(false);
  }
  expect(pixel.validatePixelDocument({...document,width:257}).valid).toBe(false);
 });
 it('canonicalizes palette order while preserving paint and frame order',()=>{
  expect(pixel.serializePixelDocument(document)).toBe(pixel.serializePixelDocument({...document,palette:{T:null,B:'#0000FF',R:'#FF0000'}}));
  expect(pixel.resolvePixelFrame(document,'patch').layers.map(layer=>layer.id)).toEqual(['body','eye']);
  expect(()=>pixel.renderPixelFrame(document,'unknown')).toThrow();
 });
});
it('bounds cumulative inherited layers even when the source is small',()=>{
 const input={schemaVersion:1,width:256,height:256,palette:{R:'#FF0000'},frames:[{id:'base',layers:[{id:'body',x:0,y:0,rows:Array(256).fill('R'.repeat(256))}]},...Array.from({length:65},(_,i)=>({id:`copy-${i}`,baseFrameId:'base'}))]};
 expect(pixel.validatePixelDocument(input).valid).toBe(false);
});
it('reports frame IDs for structural errors too',()=>{
 const result=pixel.validatePixelDocument({...document,frames:[{id:'bad',layers:[{id:'x',x:-1,y:0,rows:['R']}]}]});
 expect(result.diagnostics.some(d=>d.frameId==='bad')).toBe(true);
});
