import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { expect, it } from "vitest";
import { startPetLordServer } from "./appServer";

it("authors inherited pixels, inspects exact PNG bytes, binds exact endpoints and exports without generation", async () => {
  const directory = await mkdtemp(join(tmpdir(), "native-design-"));
  const server = await startPetLordServer({ port: 0, runtimeDataDirectory: directory });
  let sequence = 0, revision: number;
  async function call(command: string, input: unknown = {}, edit = true) {
    const response = await fetch(server.url + "/api/design/v1/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: `pixel-${++sequence}`, command, projectId: "pixel-pet", ...(edit && revision ? { expectedRevision: revision } : {}), input }) });
    const body = await response.json() as any;
    if (body.result?.revision) revision = body.result.revision;
    return { status: response.status, ...body };
  }
  try {
    expect((await call("project.create", { id: "pixel-pet", name: "Pixel", characterName: "Pixel", productionRoute: "native-pixel" })).status).toBe(200);
    await call("state.create", { id: "sit", label: "Sit" });
    await call("state.create", { id: "sleep", label: "Sleep" });
    const source = { schemaVersion: 1, width: 3, height: 2, palette: { R: "#FF0000", B: "#0000FF" }, frames: [
      { id: "sit", layers: [{ id: "body", x: 0, y: 0, rows: [".R.", "RRR"] }] },
      { id: "sleep", baseFrameId: "sit", patches: [{ layerId: "body", x: 1, y: 0, rows: ["B"] }] },
    ] };
    expect((await call("pixel.document.set", { document: source })).status).toBe(200);
    const bound = await call("pixel.state.bind", { stateId: "sit", frameId: "sit", setInitial: true });
    expect(bound.status).toBe(200);
    const initialVariant = bound.result.project.initialVariantId;
    expect((await call("pixel.state.bind", { stateId: "sleep", frameId: "sleep" })).status).toBe(200);
    const rendered = await call("pixel.render", { frameIds: ["sleep"] });
    expect(rendered.status).toBe(200);
    const raw = await fetch(new URL(rendered.result.value.frames[0].uri, server.url));
    const png = PNG.sync.read(Buffer.from(await raw.arrayBuffer()));
    expect([png.width, png.height]).toEqual([3, 2]);
    expect([...png.data]).toEqual([0,0,0,0, 0,0,255,255, 0,0,0,0, 255,0,0,255, 255,0,0,255, 255,0,0,255]);
    const feedback = await call("pixel.feedback", { frameIds: ["sit", "sleep"], scale: 4, columns: 2 }, false);
    expect(feedback.result.frames.map((f: any) => f.changedPixels)).toEqual([0, 1]);
    const sheet = PNG.sync.read(Buffer.from(await (await fetch(new URL(feedback.result.contactSheet.uri, server.url))).arrayBuffer()));
    expect([sheet.width, sheet.height]).toEqual([24, 8]);
    await call("transition.create", { id: "settle", label: "Settle", fromVariantId: initialVariant, toLogicalStateId: "sleep" });
    const reversed = await call("pixel.animation.bind", { transitionId: "settle", frames: [{ frameId: "sleep", durationMs: 40 }, { frameId: "sit", durationMs: 90 }] });
    expect(reversed.error.code).toBe("ENDPOINT_MISMATCH");
    const animated = await call("pixel.animation.bind", { transitionId: "settle", frames: [{ frameId: "sit", durationMs: 40 }, { frameId: "sleep", durationMs: 90 }], approve: true });
    expect(animated.status).toBe(200);
    expect(animated.result.project.transitions[0]).toMatchObject({ status: "approved", durationMs: 130 });
    expect((await call("project.inspect", {}, false)).result.exportable).toBe(true);
    const exported = await call("package.export", {}, false);
    expect(exported.status).toBe(200);
    expect((await fetch(new URL(exported.result.downloadPath, server.url))).status).toBe(200);
    const jobs = await call("job.list", {}, false);
    expect(jobs.result).toEqual([]);
    const deleted = await call("pixel.frame.delete", { frameId: "sit" });
    expect(deleted.error.code).toBe("INVALID_INPUT");
  } finally { await server.close(); await rm(directory, { recursive: true, force: true }); }
});

async function nativeSaveFixture() {
  const directory=await mkdtemp(join(tmpdir(),'native-save-'));
  const server=await startPetLordServer({port:0,runtimeDataDirectory:directory});
  let revision=0,sequence=0;
  const call=async(command:string,input:unknown={},expectedRevision=revision,projectId="save-pet")=>{
    const response=await fetch(server.url+'/api/design/v1/execute',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:`save-${++sequence}`,command,projectId,expectedRevision,input})});
    const body=await response.json() as any;
    if(body.result?.revision)revision=body.result.revision;
    return{status:response.status,...body};
  };
  const ok=async(command:string,input:unknown={})=>{const response=await call(command,input);expect(response.status,JSON.stringify(response.error)).toBe(200);return response.result};
  try {
    await ok('project.create',{id:'save-pet',name:'Saved pixels',characterName:'Pet',productionRoute:'native-pixel'});
    await ok('state.create',{id:'a',label:'A'});await ok('state.create',{id:'b',label:'B'});
    const document={schemaVersion:1,width:2,height:1,palette:{R:'#FF0000',B:'#0000FF'},frames:[{id:'a',layers:[{id:'body',x:0,y:0,rows:['R.']}]},{id:'m',baseFrameId:'a',patches:[{layerId:'body',x:0,y:0,rows:['B']}]},{id:'b',baseFrameId:'a',patches:[{layerId:'body',x:1,y:0,rows:['B']}]},{id:'unused',layers:[{id:'body',x:0,y:0,rows:['..']}]}]};
    await ok('pixel.document.set',{document});
    await ok('pixel.render',{frameIds:['unused']});
    const source=await ok('pixel.state.bind',{stateId:'a',frameId:'a',setInitial:true});await ok('pixel.state.bind',{stateId:'b',frameId:'b'});
    await ok('transition.create',{id:'go',label:'Go',fromVariantId:source.project.initialVariantId,toLogicalStateId:'b'});
    const bound=await ok('pixel.animation.bind',{transitionId:'go',frames:[{frameId:'a',durationMs:40},{frameId:'m',durationMs:30},{frameId:'b',durationMs:90}],playback:{repeatMode:'fixed',minCycles:2,maxCycles:2},approve:true});
    // Historical media is an opaque, unused payload; only current native frames are played.
    await ok('artifact.register',{artifact:{id:'history-video',kind:'transition-video',uri:'data:video/webm;base64,aGlzdG9yeQ==',mimeType:'video/webm',createdAt:'2026-09-09T00:00:00.000Z'}});
    await ok('transition.update',{transitionId:'go',patch:{triggers:[{id:'tap',event:'left-click',enabled:true}],mediaVersions:[{id:'history-version',label:'Old clip',videoArtifactId:'history-video',tailArtifactId:bound.project.transitions[0].targetDraftArtifactId,createdAt:'2026-09-09T00:00:00.000Z',transparent:true,durationMs:777}]}});
    return{server,call,ok,document,close:async()=>{await server.close();await rm(directory,{recursive:true,force:true})}};
  } catch(error) {await server.close();await rm(directory,{recursive:true,force:true});throw error}
}

it('atomically saves bound native artwork, exports new PNG pixels and preserves approved timing and history',async()=>{
  const api=await nativeSaveFixture();
  try {
    const before=await api.ok('project.get');
    const old=structuredClone(before.project);
    const document={...api.document,palette:{R:'#00FF00',B:'#0000FF'},frames:[...api.document.frames.filter(frame=>frame.id!=='unused'),{id:'new-unbound',layers:[{id:'body',x:0,y:0,rows:['BB']}]}]};
    const saved=await api.ok('pixel.document.save',{document});
    expect(saved.revision).toBeGreaterThan(before.revision);
    expect(saved.project.initialVariantId).toBe(old.initialVariantId);
    expect(saved.project.variants.map((variant:any)=>({id:variant.id,status:variant.status}))).toEqual(old.variants.map((variant:any)=>({id:variant.id,status:variant.status})));
    const replacements=saved.value.artifactReplacements;
    for(const variant of old.variants)expect(saved.project.variants.find((value:any)=>value.id===variant.id).imageArtifactId).toBe(replacements[variant.imageArtifactId]);
    const edge=saved.project.transitions[0],oldEdge=old.transitions[0];
    expect(edge).toMatchObject({status:'approved',durationMs:160,playback:oldEdge.playback,triggers:oldEdge.triggers,mediaVersions:oldEdge.mediaVersions,fromVariantId:oldEdge.fromVariantId,toVariantId:oldEdge.toVariantId});
    expect(edge.nativeAnimation.frames.map((frame:any)=>frame.durationMs)).toEqual([40,30,90]);
    expect(edge.nativeAnimation.frames[0].imageArtifactId).toBe(saved.project.variants.find((variant:any)=>variant.id===edge.fromVariantId).imageArtifactId);
    expect(edge.nativeAnimation.frames[2].imageArtifactId).toBe(edge.targetDraftArtifactId);
    expect(edge.targetDraftArtifactId).toBe(saved.project.variants.find((variant:any)=>variant.id===edge.toVariantId).imageArtifactId);
    expect(saved.project.artifacts.filter((artifact:any)=>artifact.nativePixel?.frameId==='new-unbound')).toEqual([]);
    for(const artifact of old.artifacts)expect(saved.project.artifacts.find((value:any)=>value.id===artifact.id)).toEqual(artifact);
    const currentState=saved.project.logicalStates[0];expect(currentState.referenceArtifactIds).toContain(old.logicalStates[0].referenceArtifactId);expect(currentState.referenceArtifactIds).toContain(currentState.referenceArtifactId);
    const exported=await api.ok('package.export');
    const {decodeInstalledPackage}=await import('./installedPackages');
    const bytes=new Uint8Array(await(await fetch(new URL(exported.downloadPath,api.server.url))).arrayBuffer());
    const bundle=decodeInstalledPackage(bytes);
    const png=(uri:string)=>PNG.sync.read(Buffer.from(bundle.assets[uri.slice(8)].split(',')[1],'base64'));
    const initial=bundle.manifest.states.find(state=>state.id===bundle.manifest.initialStateId)!;
    expect([...png(initial.imageUri).data]).toEqual([0,255,0,255,0,0,0,0]);
    const runtimeEdge=bundle.manifest.transitions[0];
    expect([...png(runtimeEdge.nativeAnimation!.frames[2].imageUri).data]).toEqual([0,255,0,255,0,0,255,255]);
    expect(runtimeEdge.nativeAnimation!.frames[0].imageUri).toBe(initial.imageUri);
    expect(runtimeEdge.nativeAnimation!.frames[2].imageUri).toBe(runtimeEdge.tailFrameUri);
    const oldImage=old.artifacts.find((artifact:any)=>artifact.id===old.variants[0].imageArtifactId);
    const oldPng=PNG.sync.read(Buffer.from(await(await fetch(new URL(oldImage.uri,api.server.url))).arrayBuffer()));
    expect([...oldPng.data]).toEqual([255,0,0,255,0,0,0,0]);
  } finally {await api.close()}
});

it('rejects stale revisions and missing bound frames without a partial source or binding commit',async()=>{
  const api=await nativeSaveFixture();
  try {
    const before=await api.ok('project.get');
    const changed={...api.document,palette:{R:'#00FF00',B:'#0000FF'}};
    const stale=await api.call('pixel.document.save',{document:changed},before.revision-1);
    expect(stale.error.code).toBe('REVISION_CONFLICT');expect((await api.ok('project.get'))).toEqual(before);
    const missing={...changed,frames:changed.frames.filter(frame=>frame.id!=='m')};
    const rejected=await api.call('pixel.document.save',{document:missing});
    expect(rejected.error.code).toBe('REFERENCED');expect(rejected.error.message).toMatch(/m/);expect(rejected.error.message).toMatch(/绑定/);
    expect(await api.ok('project.get')).toEqual(before);
    // Existing low-level snapshot editing remains deliberately non-refreshing.
    const lowLevel=await api.ok('pixel.document.set',{document:changed});
    expect(lowLevel.project.variants).toEqual(before.project.variants);
    expect(lowLevel.project.transitions).toEqual(before.project.transitions);
  } finally {await api.close()}
});

it('refreshes existing draft bindings without approving them or creating variants for new frames',async()=>{
  const api=await nativeSaveFixture();
  try {
    let current=await api.ok('project.get');
    await api.ok('transition.update',{transitionId:'go',patch:{status:'review'}});
    await api.ok('variant.update',{variantId:current.project.variants[1].id,patch:{status:'draft'}});
    current=await api.ok('project.get');
    const saved=await api.ok('pixel.document.save',{document:{...api.document,palette:{R:'#00FF00',B:'#0000FF'}}});
    expect(saved.project.transitions[0].status).toBe('review');
    expect(saved.project.variants.map((variant:any)=>({id:variant.id,status:variant.status}))).toEqual(current.project.variants.map((variant:any)=>({id:variant.id,status:variant.status})));
    expect(saved.project.logicalStates.map((state:any)=>({id:state.id,defaultVariantId:state.defaultVariantId,preferredOutboundVariantId:state.preferredOutboundVariantId}))).toEqual(current.project.logicalStates.map((state:any)=>({id:state.id,defaultVariantId:state.defaultVariantId,preferredOutboundVariantId:state.preferredOutboundVariantId})));
  } finally {await api.close()}
});

it('rejects a competing edit made during PNG persistence without committing any refreshed project references',async()=>{
  const api=await nativeSaveFixture();
  const {SqliteStore}=await import('./sqliteStore');
  const {vi}=await import('vitest');
  const original=SqliteStore.prototype.upsertMedia;
  let intervened=false;
  const hook=vi.spyOn(SqliteStore.prototype,'upsertMedia').mockImplementation(function(this:InstanceType<typeof SqliteStore>,input){
    const result=original.call(this,input);
    if(!intervened){intervened=true;const current=this.getEntitySnapshot<any>('project','save-pet')!;this.upsertEntity('project','save-pet',{...current.data,name:'Concurrent human edit'})}
    return result;
  });
  try {
    const before=await api.ok('project.get');
    const rejected=await api.call('pixel.document.save',{document:{...api.document,palette:{R:'#00FF00',B:'#0000FF'}}});
    expect(intervened).toBe(true);expect(rejected.error.code).toBe('REVISION_CONFLICT');
    const after=await api.ok('project.get');
    expect(after.project).toEqual({...before.project,name:'Concurrent human edit'});
    expect(after.revision).toBeGreaterThan(before.revision);
  } finally {hook.mockRestore();await api.close()}
});

it('preserves the legacy hint when saving an unbound document in a generated project',async()=>{
 const api=await nativeSaveFixture();
 try {
  const made=await api.call('project.create',{id:'unbound',name:'Unbound',characterName:'Pet',productionRoute:'generated'});
  const document={schemaVersion:1,width:1,height:1,palette:{R:'#FF0000'},frames:[{id:'new',layers:[{id:'body',x:0,y:0,rows:['R']}]}]};
  const saved=await api.call('pixel.document.save',{document},made.result.revision,'unbound');
  expect(saved.status,JSON.stringify(saved.error)).toBe(200);expect(saved.result.project.productionRoute).toBe('generated');
  expect(saved.result.project.pixelDocument).toEqual(document);
  expect(saved.result.project.artifacts).toEqual([]);expect(saved.result.project.variants).toEqual([]);expect(saved.result.project.transitions).toEqual([]);expect(saved.result.value.frames).toEqual([]);
 } finally {await api.close()}
});

it.each(['delete','edit'])('preserves gaze-only native bindings during %s saves',async(mode)=>{
 const api=await nativeSaveFixture();
 try {
  let current=await api.ok('project.get');
  const previous=current.project.artifacts.find((artifact:any)=>artifact.nativePixel?.frameId==='unused');
  await api.ok('state.update',{stateId:'a',patch:{pointerGaze:{enabled:true,motionTarget:'eyes',nativeImageArtifactIds:Array(8).fill(previous.id)}}});
  const before=await api.ok('project.get');
  if(mode==='delete'){
  const rejected=await api.call('pixel.document.save',{document:{...api.document,frames:api.document.frames.filter(frame=>frame.id!=='unused')}});
  expect(rejected.error?.code).toBe('REFERENCED');
  expect(rejected.error.message).toContain('unused');
  expect(await api.ok('project.get')).toEqual(before);return;
  }
  const edited={...api.document,frames:api.document.frames.map(frame=>frame.id==='unused'?{id:'unused',layers:[{id:'body',x:0,y:0,rows:['BB']}]}:frame)};
  const saved=await api.ok('pixel.document.save',{document:edited});
  const ids=saved.project.logicalStates.find((state:any)=>state.id==='a').pointerGaze.nativeImageArtifactIds;
  expect(ids).toHaveLength(8);expect(ids[0]).not.toBe(previous.id);
  expect(ids).toEqual(Array(8).fill(saved.value.artifactReplacements[previous.id]));
  expect(saved.project.variants).toEqual(before.project.variants);
  const exported=await api.ok('package.export');
  const {decodeInstalledPackage}=await import('./installedPackages');
  const bundle=decodeInstalledPackage(new Uint8Array(await(await fetch(new URL(exported.downloadPath,api.server.url))).arrayBuffer()));
  const uri=bundle.manifest.logicalStates.find(state=>state.id==='a')!.pointerGaze!.nativeImageUris![0];
  expect([...PNG.sync.read(Buffer.from(bundle.assets[uri.slice(8)].split(',')[1],'base64')).data]).toEqual([0,0,255,255,0,0,255,255]);
 }finally{await api.close()}
});
