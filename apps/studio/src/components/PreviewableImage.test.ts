// @vitest-environment happy-dom
import {afterEach,expect,it} from "vitest";
import {act,createElement as h} from "react";
import {createRoot,type Root} from "react-dom/client";
import {PreviewableImage,PreviewableImageGroup} from "./PreviewableImage";
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
let root:Root;
afterEach(async()=>{await act(async()=>root?.unmount());document.body.innerHTML="";});
const source="data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect x="4" y="4" width="40" height="40" fill="brown"/></svg>');
async function mount(group=false){const host=document.createElement("div");document.body.append(host);root=createRoot(host);const images=[h(PreviewableImage,{key:"native",src:source,alt:"原生状态",nativePixel:{width:48,height:48,frameId:"state"}}),h(PreviewableImage,{key:"photo",src:source+"#photo",alt:"普通照片"})];await act(async()=>root.render(group?h(PreviewableImageGroup,{children:images}):images[0]));return host;}
it("passes definite sizing and native interpolation through the Image API",async()=>{await mount();const image=document.querySelector<HTMLImageElement>('img[alt="原生状态"]')!;expect(image.style.height).toBe("100%");expect(image.style.width).toBe("100%");expect(image.style.objectFit).toBe("contain");expect(image.style.imageRendering).toBe("pixelated");expect(image.closest<HTMLElement>(".ant-image")!.style.height).toBe("100%");});
it("preserves native interpolation in standalone full-screen preview",async()=>{await mount();await act(async()=>document.querySelector<HTMLElement>('.ant-image')!.click());const image=document.querySelector<HTMLImageElement>('.ant-image-preview-img')!;expect(image).not.toBeNull();expect(image.style.imageRendering).toBe("pixelated");expect(parseFloat(image.style.width)).toBeGreaterThan(48);});
it("uses the current image's own metadata while browsing a mixed preview group",async()=>{await mount(true);await act(async()=>document.querySelector<HTMLElement>('.ant-image')!.click());expect(document.querySelector<HTMLImageElement>('.ant-image-preview-img')!.style.imageRendering).toBe("pixelated");await act(async()=>document.querySelector<HTMLElement>('.ant-image-preview-switch-next')!.click());expect(document.querySelector<HTMLImageElement>('.ant-image-preview-img')!.style.imageRendering).toBe("auto");expect(document.querySelector<HTMLImageElement>('.ant-image-preview-img')!.style.width).toBe("");});
