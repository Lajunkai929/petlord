// @vitest-environment happy-dom
import {act,createElement as h,type ComponentProps} from "react";
import {createRoot,type Root} from "react-dom/client";
import {afterEach,expect,it} from "vitest";
import {Inspector} from "./Inspector";
import {createBlankProject,activateAuthorityReference} from "../projectTemplate";
import {defaultPointerGaze} from "./StatePointerGazeEditor";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});let root:Root;
afterEach(async()=>{await act(async()=>root?.unmount());document.body.innerHTML="";});
it("carries artifact native metadata to state reference, history, variant, gaze and drag previews",async()=>{
 let project=createBlankProject({characterName:"像素狗",customerName:"",contact:"",quotedPriceCny:0,depositCny:0,revisionLimit:0,notes:""});const stateId=project.logicalStates[0].id;
 project.artifacts.push({id:"native",kind:"state-actual",uri:"data:image/png;base64,AAAA",mimeType:"image/png",createdAt:project.updatedAt,nativePixel:{width:96,height:48,frameId:"native"}});
 project=activateAuthorityReference(project,stateId,"native");
 project.logicalStates[0].pointerGaze={...defaultPointerGaze,enabled:true};
 project.dragInteraction={enabled:true,targetLogicalStateId:stateId,anchor:{x:.25,y:.5},alignmentDurationMs:600,returnDurationMs:500};
 const props={project,selection:{kind:"state",id:stateId},styleProfiles:[],persistentJobs:[],busy:false,previewing:false,mobileOpen:false,onGenerateStateImage:async()=>{}} as unknown as ComponentProps<typeof Inspector>;
 const host=document.createElement("div");document.body.append(host);root=createRoot(host);await act(async()=>root.render(h(Inspector,props)));
 for(const selector of [".variant-row img",".state-reference-preview img",".reference-history-list img",".pointer-gaze-editor__anchor-canvas img",".drag-anchor-editor__canvas img"]){const image=document.querySelector<HTMLImageElement>(selector);expect(image,selector).not.toBeNull();expect(image!.style.imageRendering,selector).toBe("pixelated");}
 expect(document.querySelector<HTMLElement>(".drag-anchor-editor__canvas")!.style.aspectRatio).toBe("96 / 48");
 expect(document.querySelector<HTMLElement>(".pointer-gaze-editor__anchor-canvas")!.style.aspectRatio).toBe("96 / 48");
});
