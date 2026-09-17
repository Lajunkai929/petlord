import {describe,it,expect} from 'vitest';
import * as playback from './nativeSpritePlayback';
const frames=[{imageUri:'a',durationMs:100},{imageUri:'b',durationMs:50},{imageUri:'c',durationMs:150}];
describe('native explicit timing',()=>{
 it.each([[0,0,0,false],[99.99,0,0,false],[100,1,0,false],[149.99,1,0,false],[150,2,0,false],[299.99,2,0,false],[300,0,1,false],[400,1,1,false],[450,2,1,false],[599,2,1,false],[600,2,1,true],[900,2,1,true]])('at %sms selects frame %s cycle %s finished %s',(elapsed,index,cycle,finished)=>{
  expect(playback.nativeSpriteSample(frames,elapsed as number,2)).toMatchObject({frameIndex:index,cycleIndex:cycle,finished});
 });
 it('runs the complete timeline from readiness and completes once even on a delayed tick',()=>{
  const seen:string[]=[];let completed=0;
  const player=playback.createNativeSpritePlayback(frames,2,{onFrame:frame=>seen.push(frame.imageUri),onComplete:()=>completed++});
  player.tick(1000);player.tick(1100);player.tick(1600);player.tick(1900);
  expect(seen).toEqual(['a','b','c']); expect(completed).toBe(1);
 });
 it('ignores ticks after disposal',()=>{
  let completed=0; const seen:string[]=[];
  const player=playback.createNativeSpritePlayback(frames,1,{onFrame:frame=>seen.push(frame.imageUri),onComplete:()=>completed++});
  player.tick(0);player.dispose();player.tick(500);
  expect(seen).toEqual(['a']);expect(completed).toBe(0);
 });
});
it('emits a single completion signal so a queued transition cannot be completed by the previous run',()=>{
 const calls:string[]=[];
 const player=playback.createNativeSpritePlayback(frames,1,{onFrame:()=>{},onTime:ms=>calls.push(`time:${ms}`),onComplete:()=>calls.push('ended')});
 player.tick(0);player.tick(300);player.tick(400);
 expect(calls).toEqual(['time:0','ended']);
});
