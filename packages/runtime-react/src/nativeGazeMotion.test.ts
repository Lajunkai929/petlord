import {expect,it} from 'vitest';
import {createNativeGazeMotion} from './nativeGazeMotion';
function fixture(){let time=0,id=0;const frames=new Map<number,FrameRequestCallback>(),seen:(number|null)[]=[];const motion=createNativeGazeMotion({now:()=>time,requestFrame:callback=>{frames.set(++id,callback);return id;},cancelFrame:id=>frames.delete(id),onDirection:index=>seen.push(index)});return{motion,seen,frames,tick:(at:number)=>{time=at;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(callback=>callback(at));}};}
it('holds the current sector across noisy boundaries, then follows a deliberate crossing',()=>{
 const f=fixture();f.motion.update(true,0);
 for(const progress of [.06,.065,.061,.07,.063]){f.motion.update(true,progress);f.tick(100);}
 expect(f.seen).toEqual([0]);expect(f.frames.size).toBe(0);
 f.motion.update(true,.09);f.tick(175);expect(f.seen).toEqual([0,1]);
 for(const progress of [.07,.06,.055,.05]){f.motion.update(true,progress);f.tick(250);}
 expect(f.seen).toEqual([0,1]);
 f.motion.update(true,.035);f.tick(325);expect(f.seen).toEqual([0,1,0]);
});
it('crosses a large direction change in adjacent poses with a bounded shortest path',()=>{
 const f=fixture();f.motion.update(true,7/8);f.motion.update(true,3/8);
 f.tick(74);expect(f.seen).toEqual([7]);
 for(const time of [75,150,225,300])f.tick(time);
 expect(f.seen).toEqual([7,0,1,2,3]);expect(f.frames.size).toBe(0);
});
it('wraps the seam, respects the latest target and never catches up by skipping poses after a stalled frame',()=>{
 const f=fixture();f.motion.update(true,7/8);f.motion.update(true,0);f.tick(75);expect(f.seen).toEqual([7,0]);
 f.motion.update(true,3/8);f.tick(150);expect(f.seen.at(-1)).toBe(1);
 f.motion.update(true,7/8);f.tick(2000);expect(f.seen.at(-1)).toBe(0);
 f.tick(2075);expect(f.seen.at(-1)).toBe(7);expect(f.frames.size).toBe(0);
});
it('cancels immediately on exit/dispose and uses a fresh target when reactivated',()=>{
 const f=fixture();f.motion.update(true,0);f.motion.update(true,.5);f.tick(75);
 f.motion.update(false,.5);expect(f.seen.at(-1)).toBe(null);expect(f.frames.size).toBe(0);f.tick(500);expect(f.seen.at(-1)).toBe(null);
 f.motion.update(true,.75);expect(f.seen.at(-1)).toBe(6);f.motion.update(true,.25);f.motion.dispose();expect(f.frames.size).toBe(0);f.tick(1000);expect(f.seen.at(-1)).toBe(6);
});
