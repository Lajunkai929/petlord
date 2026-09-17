import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {RuntimeMediaCanvas} from './RuntimeMediaCanvas';
const state={id:'a',logicalStateId:'idle',label:'A',origin:'initial' as const,imageUri:'/a.png',nativePixel:{width:3,height:2}};
it.each([false,true])('preserves native canvas dimensions regardless of pixel-art toggle %s',pixelated=>{
 const html=renderToStaticMarkup(createElement(RuntimeMediaCanvas,{currentState:state,phase:'idle',bridgeProgress:0,frameRate:12,renderResolution:480,pixelated}));
 expect(html).toContain('width="3"');expect(html).toContain('height="2"');expect(html).toContain('data-native-pixel="true"');expect(html).not.toContain('<video');
});
it('disables quantization for a native source still in a mixed video transition',()=>{
 const html=renderToStaticMarkup(createElement(RuntimeMediaCanvas,{currentState:state,activeTransition:{id:'video',fromStateId:'a',toStateId:'b',videoUri:'/v.webm',tailFrameUri:'/b.png',durationMs:1000,endFrameSource:'video-frame',transparentVideo:true,authorityBridge:{mode:'hard-cut',durationMs:120},triggers:[]},phase:'video',bridgeProgress:0,frameRate:12,renderResolution:480,pixelated:true}));
 expect(html).toContain('data-pixel-art="false"');
 expect(html).toContain('<video');
});
it.each([false,true])('renders a generated→native bridge in the target native canvas when pixelated=%s',pixelated=>{
 const html=renderToStaticMarkup(createElement(RuntimeMediaCanvas,{currentState:{...state,nativePixel:undefined},targetState:{...state,id:'b',imageUri:'/b.png',nativePixel:{width:2,height:1}},activeTransition:{id:'video',fromStateId:'a',toStateId:'b',videoUri:'/v.webm',tailFrameUri:'/b.png',durationMs:1000,endFrameSource:'authority-reference',transparentVideo:true,authorityBridge:{mode:'blur-dissolve',durationMs:700},triggers:[]},phase:'bridge',bridgeProgress:0.5,frameRate:24,renderResolution:480,pixelated}));
 expect(html).toContain('width="2"');expect(html).toContain('height="1"');expect(html).toContain('data-native-pixel="true"');expect(html).not.toContain('<video');
});
