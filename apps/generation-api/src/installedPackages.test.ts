import { mkdtemp, mkdir, readFile, writeFile, rm, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { gzipSync } from "node:zlib";
import { SqliteStore } from "./sqliteStore";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { startPetLordServer } from "./appServer";
import { PNG } from "pngjs";
import { renderPixelFrame } from "@petlord/pixel-art";
import { buildPetPackage } from "@petlord/state-engine";
import { applyDesignMutation } from "@petlord/design-core";
import { buildPortablePetBundleV2 } from "@petlord/design-core/portablePetPackage";
import { createInstalledPackageImporter, decodeInstalledPackage, projectFromInstalledPackage } from "./installedPackages";
import { decodeAndVerifyPublishedPackage } from "./publishedPackageLibrary";

it("makes all installed pets editable in Studio, reconstructs exact native pixels and never overwrites later edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-installed-design-"));
  const packages = join(directory, "packages"); await mkdir(packages);
  const original = JSON.parse(await readFile("apps/desktop/resources/default.petlord", "utf8"));
  for (const id of ["first", "second"]) {
    const bundle = structuredClone(original); bundle.manifest.id = id; bundle.manifest.name = id;
    bundle.integrity.manifestSha256 = createHash("sha256").update(JSON.stringify(bundle.manifest)).digest("hex");
    await writeFile(join(packages, `${id}.petlord`), JSON.stringify(bundle));
  }
  let api = await startPetLordServer({port:0,runtimeDataDirectory:join(directory,"design"),installedPackagesDirectory:packages});
  async function call(command: string, input: unknown = {}, extra: object = {}) {
    const body = await (await fetch(api.url+"/api/design/v1/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:crypto.randomUUID(),command,input,...extra})})).json() as any;
    expect(body.error,JSON.stringify(body.error)).toBeUndefined(); return body.result;
  }
  try {
    let projects = await call("project.list"); expect(projects).toHaveLength(2);
    const current = await call("project.get", {}, {projectId:projects[0].id});
    expect(current.project).toMatchObject({importedPackage:{source:"runtime-reconstructed"}});
    expect(current.project).not.toHaveProperty("productionRoute");
    expect(current.project.logicalStates).toHaveLength(1);
    expect(current.project.transitions[0].nativeAnimation.frames).toHaveLength(11);
    expect(current.project.pixelDocument.frames.length).toBeGreaterThan(1);
    for (const artifact of current.project.artifacts.filter((a:any) => a.nativePixel)) {
      const png = PNG.sync.read(Buffer.from(await (await fetch(api.url+artifact.uri)).arrayBuffer()));
      expect(Buffer.from(renderPixelFrame(current.project.pixelDocument,artifact.nativePixel.frameId).rgba)).toEqual(png.data);
    }
    expect((await call("project.inspect", {}, {projectId:projects[0].id})).exportable).toBe(true);
    await call("project.update", {patch:{name:"My later edit"}}, {projectId:current.project.id,expectedRevision:current.revision});
    await call("package.syncInstalled");
    expect((await call("project.list"))).toHaveLength(2);
    await api.close(); api=await startPetLordServer({port:0,runtimeDataDirectory:join(directory,"design"),installedPackagesDirectory:packages});
    projects=await call("project.list"); expect(projects).toHaveLength(2);
    expect(projects.some((p:any)=>p.name==="My later edit")).toBe(true);
    const media = new Map<string,string>();
    for (const artifact of current.project.artifacts) {
      const bytes = Buffer.from(await (await fetch(api.url+artifact.uri)).arrayBuffer());
      media.set(artifact.uri,`data:${artifact.mimeType};base64,${bytes.toString("base64")}`);
    }
    const otherDevice = structuredClone(current.project);
    otherDevice.name = "Edited on another device";
    const sourceBundle = await buildPortablePetBundleV2(buildPetPackage(otherDevice),media,undefined,otherDevice);
    await writeFile(join(packages,"same-source-id.petlord"),JSON.stringify(sourceBundle));
    expect((await call("package.syncInstalled")).imported).toHaveLength(1);
    expect((await call("project.list")).some((p:any)=>p.name==="Edited on another device")).toBe(true);
    expect((await call("project.get",{},{projectId:current.project.id})).project.name).toBe("My later edit");
    await writeFile(join(packages,"broken.petlord"),"bad data");
    const sync=await call("package.syncInstalled"); expect(sync.errors).toHaveLength(1); expect((await call("project.list"))).toHaveLength(3);
  } finally {await api.close();await rm(directory,{recursive:true,force:true});}
});

it("preserves legacy drag targets and every semantic alias, then round-trips editable source with verified integrity", async () => {
  const original = JSON.parse(await readFile("apps/desktop/resources/default.petlord", "utf8"));
  original.manifest.states.push({...original.manifest.states[0],id:"second-variant",origin:"reference"});
  original.manifest.logicalStates[0].variantIds.push("second-variant");
  original.manifest.semanticActions = {idle:original.manifest.logicalStates[0].id,waiting:original.manifest.logicalStates[0].id};
  original.manifest.dragInteraction = {enabled:true,targetStateId:"second-variant",anchor:{x:.5,y:.5}};
  original.integrity.manifestSha256 = createHash("sha256").update(JSON.stringify(original.manifest)).digest("hex");
  const input = decodeInstalledPackage(Buffer.from(JSON.stringify(original)));
  const project = await projectFromInstalledPackage(input,"a".repeat(64),"old.petlord",async dataUrl => ({uri:dataUrl,mimeType:"image/png"}));
  const manifest = buildPetPackage(project);
  expect(() => applyDesignMutation(project,"variant.delete",{variantId:"second-variant"})).toThrow(/Drag target/);
  expect(manifest.dragInteraction?.targetStateId).toBe("second-variant");
  expect(manifest.semanticActions).toEqual(input.manifest.semanticActions);
  project.identityPrompt = "A specific original identity prompt";
  const packed = await buildPortablePetBundleV2(manifest,new Map(project.artifacts.map(a => [a.uri,a.uri])),undefined,project);
  const encoded = Buffer.from(JSON.stringify(packed));
  expect(decodeAndVerifyPublishedPackage(encoded).sourceProject?.identityPrompt).toBe(project.identityPrompt);
  const restored = await projectFromInstalledPackage(decodeInstalledPackage(encoded),"b".repeat(64),"new.petlord",async dataUrl => ({uri:dataUrl,mimeType:"image/png"}));
  expect(restored.pixelDocument).toEqual(project.pixelDocument);
  expect(restored.transitions).toEqual(project.transitions);
  expect(restored.identityPrompt).toBe(project.identityPrompt);
  packed.sourceProject!.name = "tampered";
  expect(() => decodeAndVerifyPublishedPackage(Buffer.from(JSON.stringify(packed)))).toThrow(/source|源码/i);
  expect(() => decodeInstalledPackage(Buffer.from(JSON.stringify(packed)))).toThrow(/源码/);
});


it("reconstructs a deleted installed project with a newer revision and rejects stale pre-deletion edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-installed-deleted-"));
  const packages = join(directory, "packages"); await mkdir(packages);
  await writeFile(join(packages, "retained.petlord"), await readFile("apps/desktop/resources/default.petlord"));
  const options = {port:0,runtimeDataDirectory:join(directory,"design"),installedPackagesDirectory:packages};
  let api = await startPetLordServer(options);
  async function invoke(command: string, input: unknown = {}, extra: object = {}) {
    return await (await fetch(api.url+"/api/design/v1/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:crypto.randomUUID(),command,input,...extra})})).json() as any;
  }
  try {
    const [original] = (await invoke("project.list")).result;
    const deleted = await invoke("project.delete", {}, {projectId:original.id,expectedRevision:original.revision});
    expect(deleted.error).toBeUndefined();
    expect((await invoke("project.list")).result).toEqual([]);
    const sync = await invoke("package.syncInstalled");
    expect(sync.result.errors).toEqual([]);
    expect(sync.result.imported).toEqual([{key:"retained.petlord",projectId:original.id,name:original.name}]);
    const restored = (await invoke("project.get", {}, {projectId:original.id})).result;
    expect(restored.revision).toBeGreaterThan(deleted.result.revision);
    expect((await invoke("project.inspect", {}, {projectId:original.id})).result.exportable).toBe(true);
    expect(await api.getInstalledPackageBindings()).toEqual([{packageKey:"retained.petlord",projectId:original.id,appliedRevision:restored.revision}]);
    const stale = await invoke("project.update", {patch:{name:"Stale edit"}}, {projectId:original.id,expectedRevision:original.revision});
    expect(stale.error.code).toBe("REVISION_CONFLICT");
    await api.close(); api = await startPetLordServer(options);
    expect((await invoke("package.syncInstalled")).result.imported).toEqual([]);
    expect((await invoke("project.list")).result).toHaveLength(1);
    expect((await invoke("project.get", {}, {projectId:original.id})).result.revision).toBe(restored.revision);
  } finally {await api.close();await rm(directory,{recursive:true,force:true});}
});


it("preserves legacy hash IDs and local edits across gzip rewrites and an unambiguous file rename", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-installed-legacy-"));
  const packages = join(directory,"packages"); await mkdir(packages);
  const store = new SqliteStore(join(directory,"design.sqlite"));
  try {
    const bytes = await readFile("apps/desktop/resources/default.petlord");
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    const project = await projectFromInstalledPackage(decodeInstalledPackage(bytes),fingerprint,"before.petlord",async uri=>({uri,mimeType:"image/png"}));
    project.name = "Existing unpublished edits";
    store.upsertEntity("project",project.id,project);
    const revision = store.getEntitySnapshot("project",project.id)!.revision;
    await writeFile(join(packages,"before.petlord"),bytes);
    const info = await stat(join(packages,"before.petlord"));
    store.setState("installed-package-imports",{"before.petlord":{projectId:project.id,fingerprint,size:info.size,mtimeMs:info.mtimeMs,appliedRevision:revision-1}});
    const importer = createInstalledPackageImporter(store,packages,async uri=>({uri,mimeType:"image/png"}));
    await writeFile(join(packages,"before.petlord"),gzipSync(bytes));
    expect((await importer.sync()).imported).toEqual([]);
    expect(await importer.bindings()).toEqual([{packageKey:"before.petlord",projectId:project.id,appliedRevision:revision-1}]);
    expect(store.listEntities("project")).toEqual([project]);
    await rename(join(packages,"before.petlord"),join(packages,"after.petlord"));
    expect((await importer.sync()).imported).toEqual([]);
    expect(await importer.bindings()).toEqual([{packageKey:"after.petlord",projectId:project.id,appliedRevision:revision-1}]);
    expect(store.listEntities("project")).toEqual([project]);
    expect((await importer.status(project.id,revision,true)).hasDraftChanges).toBe(true);
    expect((await importer.sync()).imported).toEqual([]);
  } finally {store.close();await rm(directory,{recursive:true,force:true});}
});

it("opens changed replacement content while retaining the previous project's unpublished edits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-installed-replacement-"));
  const packages = join(directory,"packages"); await mkdir(packages);
  const store = new SqliteStore(join(directory,"design.sqlite"));
  try {
    const bytes = await readFile("apps/desktop/resources/default.petlord");
    await writeFile(join(packages,"retained.petlord"),bytes);
    const importer = createInstalledPackageImporter(store,packages,async uri=>({uri,mimeType:"image/png"}));
    const [first] = (await importer.sync()).imported;
    const original = store.getEntitySnapshot<any>("project",first.projectId)!;
    const edited = {...original.data,name:"Unpublished original draft"};
    store.upsertEntity("project",first.projectId,edited);
    const bundle = JSON.parse(bytes.toString());
    bundle.manifest.name = "New replacement content";
    bundle.integrity.manifestSha256 = createHash("sha256").update(JSON.stringify(bundle.manifest)).digest("hex");
    await writeFile(join(packages,"retained.petlord"),JSON.stringify(bundle));
    const sync = await importer.sync();
    expect(sync.errors).toEqual([]);
    expect(sync.imported).toHaveLength(1);
    const replacement = sync.imported[0];
    expect(replacement.projectId).not.toBe(first.projectId);
    expect(store.getEntitySnapshot<any>("project",replacement.projectId)!.data.name).toBe("New replacement content");
    expect(store.getEntitySnapshot<any>("project",first.projectId)!.data).toEqual(edited);
    expect((await importer.bindings()).map(binding=>binding.projectId)).toEqual([replacement.projectId]);
    expect((await importer.sync()).imported).toEqual([]);
    expect(store.listEntities("project")).toHaveLength(2);
  } finally {store.close();await rm(directory,{recursive:true,force:true});}
});


it("repairs a legacy shared binding without changing its original project's edits or revision", async () => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-installed-shared-record-"));
  const packages = join(directory,"packages"); await mkdir(packages);
  const store = new SqliteStore(join(directory,"design.sqlite"));
  try {
    const bytes = await readFile("apps/desktop/resources/default.petlord");
    await Promise.all(["original.petlord","copy.petlord"].map(key=>writeFile(join(packages,key),bytes)));
    const fingerprint = createHash("sha256").update(bytes).digest("hex");
    const project = await projectFromInstalledPackage(decodeInstalledPackage(bytes),fingerprint,"original.petlord",async uri=>({uri,mimeType:"image/png"}));
    project.name = "Original draft remains";
    store.upsertEntity("project",project.id,project);
    const revision = store.getEntitySnapshot("project",project.id)!.revision;
    const records: Record<string,unknown> = {};
    for(const key of ["original.petlord","copy.petlord"]){
      const info=await stat(join(packages,key));
      records[key]={fingerprint,projectId:project.id,size:info.size,mtimeMs:info.mtimeMs,appliedRevision:revision-1};
    }
    store.setState("installed-package-imports",records);
    const importer=createInstalledPackageImporter(store,packages,async uri=>({uri,mimeType:"image/png"}));
    const sync=await importer.sync();
    expect(sync.errors).toEqual([]);
    expect(sync.imported).toHaveLength(1);
    const bindings=await importer.bindings();
    expect(bindings.find(binding=>binding.packageKey==="original.petlord")).toEqual({packageKey:"original.petlord",projectId:project.id,appliedRevision:revision-1});
    const copy=bindings.find(binding=>binding.packageKey==="copy.petlord")!;
    expect(copy.projectId).not.toBe(project.id);
    expect(store.getEntitySnapshot<any>("project",copy.projectId)!.data.name).toBe("PetLord 内置像素伙伴");
    expect(store.getEntitySnapshot("project",project.id)).toEqual({data:project,revision});
    expect((await importer.sync()).imported).toEqual([]);
    expect(await importer.bindings()).toEqual(bindings);
  } finally {store.close();await rm(directory,{recursive:true,force:true});}
});
