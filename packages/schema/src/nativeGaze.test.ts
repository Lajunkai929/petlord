import {it,expect} from 'vitest';
import {PNG} from 'pngjs';
import {pointerGazeSchema,runtimePointerGazeSchema,petPackageManifestSchema,collectRuntimeMediaUris,mapRuntimeMediaUris} from './index';
import {buildPortablePetBundleV2} from '../../design-core/src/portablePetPackage';
import {decodePetPackage,materializePackageManifest} from '../../../apps/desktop/src/hooks/useDesktopPetPackage';
import {projectFromInstalledPackage} from '../../../apps/generation-api/src/installedPackages';
import {buildPetPackage} from '../../state-engine/src';
import {projectReferenceIssues} from '../../design-core/src/projectValidation';
import {saveProjectAsTemplate} from '../../design-core/src/projectTemplates';
const uris=Array.from({length:8},(_,i)=>`/gaze-${i}.png`);
const gaze={enabled:true,motionTarget:'eyes',activationRadius:1.4,nativeImageUris:uris};
function manifest(){return petPackageManifestSchema.parse({manifestVersion:1,id:'native-gaze',name:'Native',characterName:'Pet',initialStateId:'a',states:[{id:'a',logicalStateId:'idle',label:'Idle',origin:'initial',imageUri:'/a.png',nativePixel:{width:3,height:2}}],transitions:[],logicalStates:[{id:'idle',label:'Idle',variantIds:['a'],idleScheduler:{},pointerGaze:gaze}],semanticActions:{},plugins:[]});}
it('requires exactly eight ordered native frames and preserves absent legacy fields',()=>{
 expect(runtimePointerGazeSchema.parse(gaze).nativeImageUris).toEqual(uris);
 expect(pointerGazeSchema.parse({...gaze,nativeImageArtifactIds:uris}).nativeImageArtifactIds).toEqual(uris);
 for(const count of [0,7,9])expect(runtimePointerGazeSchema.safeParse({...gaze,nativeImageUris:Array(count).fill('/x.png')}).success).toBe(false);
 const {nativeImageUris:_images,...legacy}=gaze;
 expect(runtimePointerGazeSchema.parse({...legacy,videoUri:'/v.webm'})).not.toHaveProperty('nativeImageUris');
});
it('collects, packs, verifies, resolves and reconstructs native gaze references',async()=>{
 const m=manifest();
 expect(collectRuntimeMediaUris(m)).toEqual(['/a.png',...uris]);
 expect(mapRuntimeMediaUris(m,uri=>`local:${uri}`).logicalStates[0].pointerGaze?.nativeImageUris).toEqual(uris.map(uri=>`local:${uri}`));
 const media=new Map(['/a.png',...uris].map((uri,i)=>{const png=new PNG({width:3,height:2});for(let at=0;at<png.data.length;at+=4){png.data[at]=i*20;png.data[at+3]=255;}return [uri,`data:image/png;base64,${PNG.sync.write(png).toString('base64')}`];}));
 const bundle=await buildPortablePetBundleV2(m,media);
 const decoded=await decodePetPackage(JSON.stringify(bundle));
 expect(materializePackageManifest(decoded).logicalStates[0].pointerGaze?.nativeImageUris).toEqual(uris.map(uri=>media.get(uri)));
 const project=await projectFromInstalledPackage(bundle,'abc','native.petlord',async(dataUrl,id)=>({uri:`/${id}.png`,mimeType:'image/png'}));
 expect(project.logicalStates[0].pointerGaze?.nativeImageArtifactIds).toHaveLength(8);
 expect(project.pixelDocument?.frames).toHaveLength(9);
 const restoredMedia=new Map(project.artifacts.map((artifact,index)=>[artifact.uri,[...media.values()][index]]));
 const editable=await buildPortablePetBundleV2(buildPetPackage(project),restoredMedia,undefined,project);
 const restored=await projectFromInstalledPackage(editable,'def','editable.petlord',async(dataUrl,id)=>({uri:`/${id}.png`,mimeType:'image/png'}));
 expect(restored.logicalStates[0].pointerGaze?.nativeImageArtifactIds).toEqual(project.logicalStates[0].pointerGaze?.nativeImageArtifactIds);
 expect(restored.pixelDocument).toEqual(project.pixelDocument);
 expect(saveProjectAsTemplate(project,'Native','').states[0].pointerGaze).not.toHaveProperty('nativeImageArtifactIds');
 const missingReference=structuredClone(project);
 missingReference.artifacts=missingReference.artifacts.filter(artifact=>artifact.id!==project.logicalStates[0].pointerGaze!.nativeImageArtifactIds![7]);
 expect(projectReferenceIssues(missingReference)).toEqual(expect.arrayContaining([expect.objectContaining({path:expect.stringContaining('nativeImageArtifactIds')})]));
 expect(buildPetPackage(project).logicalStates[0].pointerGaze?.nativeImageUris).toHaveLength(8);
 const broken=structuredClone(bundle);delete broken.assets[broken.manifest.logicalStates[0].pointerGaze!.nativeImageUris![7].slice(8)];
 await expect(decodePetPackage(JSON.stringify(broken))).rejects.toThrow();
});
it('rejects native gaze on non-native or mixed-dimension logical-state variants',()=>{
 const m=manifest();m.states[0].nativePixel=undefined;
 expect(petPackageManifestSchema.safeParse(m).success).toBe(false);
 const mixed=manifest();mixed.states.push({...mixed.states[0],id:'b',nativePixel:{width:4,height:2}});
 expect(petPackageManifestSchema.safeParse(mixed).success).toBe(false);
});
