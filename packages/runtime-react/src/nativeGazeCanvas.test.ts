// @vitest-environment happy-dom
import {afterEach,it,expect,vi} from 'vitest';
import {act,createElement} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {runtimePointerGazeSchema} from '@petlord/schema';
import {NativeSpriteCanvas,nativeGazeDirectionIndex} from './NativeSpriteCanvas';
import type {RuntimeMediaCanvasProps} from './RuntimeMediaCanvas';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:Root|undefined;let host:HTMLDivElement|undefined;
afterEach(()=>{if(root)act(()=>root!.unmount());host?.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
const uris=Array.from({length:8},(_,i)=>`/g${i}.png`);
const state={id:'a',logicalStateId:'idle',label:'A',origin:'initial' as const,imageUri:'/a.png',nativePixel:{width:3,height:2}};
async function mount(){
 const images:{src:string;naturalWidth:number;naturalHeight:number;onload?:()=>void;onerror?:()=>void}[]=[];
 class FakeImage{src='';naturalWidth=3;naturalHeight=2;onload?:()=>void;onerror?:()=>void;constructor(){images.push(this);}}
 vi.stubGlobal('Image',FakeImage);
 let clock=0;vi.spyOn(performance,'now').mockImplementation(()=>clock);
 const frames=new Map<number,FrameRequestCallback>();let serial=0;
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++serial,callback);return serial;});
 vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));
 const context={imageSmoothingEnabled:true,clearRect:vi.fn(),drawImage:vi.fn()};
 vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as never);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 let props:RuntimeMediaCanvasProps={currentState:state,phase:'idle',bridgeProgress:0,frameRate:12,renderResolution:480,pointerGaze:runtimePointerGazeSchema.parse({enabled:true,motionTarget:'eyes',activationRadius:1.4,nativeImageUris:uris}),pointerGazeActive:true,pointerGazeProgress:0,onPlaybackError:vi.fn()};
 const render=async(patch:Partial<RuntimeMediaCanvasProps>={})=>{props={...props,...patch};await act(async()=>root!.render(createElement(NativeSpriteCanvas,props)));};
 await render();
 const load=async()=>{await act(async()=>images.forEach(image=>image.onload?.()));};
 const last=()=>context.drawImage.mock.calls.at(-1)?.[0]?.src;
 const advance=async(ms:number)=>{clock+=ms;const callbacks=[...frames.values()];frames.clear();await act(async()=>callbacks.forEach(callback=>callback(clock)));};
 return {images,context,render,load,last,props,frames,advance};
}
it('draws eight ordered nearest-neighbor gaze directions without reloading on pointer updates and restores the still',async()=>{
 const f=await mount();await f.load();
 expect(f.images).toHaveLength(9);
 for(let i=0;i<8;i++){await f.render({pointerGazeProgress:i/8});await f.advance(75);expect(f.last()).toBe(uris[i]);}
 expect(f.images).toHaveLength(9);expect(f.context.imageSmoothingEnabled).toBe(false);
 expect(host!.querySelector('canvas')!.width).toBe(3);expect(host!.querySelector('video')).toBeNull();
 await f.render({pointerGazeActive:false});expect(f.last()).toBe('/a.png');
});
it('keeps an active animation authoritative and redraws after a native canvas resize',async()=>{
 const f=await mount();await f.load();
 await f.render({pointerGazeProgress:.5});await f.advance(75);expect(f.last()).toBe('/g1.png');
 await f.render({phase:'video',activeTransition:{id:'loop',fromStateId:'a',toStateId:'a',tailFrameUri:'/a.png',durationMs:200,nativeAnimation:{frames:[{imageUri:'/a.png',durationMs:100},{imageUri:'/action.png',durationMs:50},{imageUri:'/a.png',durationMs:50}]}} as never});
 await f.load();expect(f.frames.size).toBe(1);
 await act(async()=>{[...f.frames.values()].at(-1)?.(0);[...f.frames.values()].at(-1)?.(110);});
 expect(f.last()).toBe('/action.png');
 await f.render({pointerGazeProgress:.5});expect(f.last()).toBe('/action.png');
 await f.render({phase:'idle',activeTransition:null,pointerGazeActive:false,currentState:{...state,nativePixel:{width:4,height:2}}});
 f.images.forEach(image=>image.naturalWidth=4);await f.load();
 expect(host!.querySelector('canvas')!.width).toBe(4);expect(f.last()).toBe('/a.png');
});
it('falls back to the state when a gaze PNG is missing, without blocking other directions',async()=>{
 const f=await mount();await act(async()=>{f.images.forEach(image=>image.src==='/g0.png'?image.onerror?.():image.onload?.());});
 expect(f.last()).toBe('/a.png');expect(f.props.onPlaybackError).toHaveBeenCalled();
 await f.render({pointerGazeProgress:.125});await f.advance(75);expect(f.last()).toBe('/g1.png');
});

it('wraps across the left seam and ignores stale native image loads after replacing the state',async()=>{
 expect(nativeGazeDirectionIndex(.99)).toBe(0);expect(nativeGazeDirectionIndex(-.125)).toBe(7);
 const f=await mount();const stale=[...f.images];
 await f.render({currentState:{...state,id:'b',imageUri:'/b.png'},pointerGazeActive:false});
 await act(async()=>stale.forEach(image=>image.onload?.()));
 expect(f.context.drawImage).not.toHaveBeenCalled();
 await f.load();expect(f.last()).toBe('/b.png');
});
it('rejects mismatched gaze dimensions and keeps the source pixels',async()=>{
 const f=await mount();f.images.find(image=>image.src==='/g0.png')!.naturalWidth=12;
 await f.load();expect(f.last()).toBe('/a.png');
 expect(f.props.onPlaybackError).toHaveBeenCalledWith(expect.stringContaining('dimensions'));
});

it('holds boundary noise and renders large changes as adjacent head poses, then cancels on exit',async()=>{
 const f=await mount();await f.load();
 for(const progress of [.06,.065,.07,.062]){await f.render({pointerGazeProgress:progress});await f.advance(80);expect(f.last()).toBe('/g0.png');}
 expect(f.last()).toBe('/g0.png');
 await f.render({pointerGazeProgress:.5});expect(f.last()).toBe('/g0.png');
 for(const direction of [1,2,3,4]){await f.advance(75);expect(f.last()).toBe(`/g${direction}.png`);}
 await f.render({pointerGazeProgress:0});await f.advance(75);
 await f.render({pointerGazeActive:false});expect(f.last()).toBe('/a.png');
 await f.advance(1000);expect(f.last()).toBe('/a.png');expect(f.frames.size).toBe(0);
 expect(f.context.imageSmoothingEnabled).toBe(false);expect(f.context.drawImage.mock.calls.every(call=>call.length===3)).toBe(true);
});
