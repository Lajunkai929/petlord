import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { expect, it, vi } from "vitest";
import { startPetLordServer } from "./appServer";

it.each(["doubao-seedance-2-0-mini-260615", "ep-custom-video"])("generates a %s fixture transition, extracts visual feedback and exports a headless video project", async model => {
  const directory = await mkdtemp(join(tmpdir(), "petlord-video-workflow-"));
  const clipPath = join(directory, "fixture.mp4"), image = await readFile("apps/studio/public/demo/pip/state-sitting.png");
  await promisify(execFile)(ffmpeg!, ["-y", "-f", "lavfi", "-i", "color=c=red:s=64x64:r=10:d=0.4", "-an", "-pix_fmt", "yuv420p", clipPath]);
  const clip = await readFile(clipPath);
  let origin = "", submissions = 0;
  let submittedBody: any;
  const provider = createServer(async (request, response) => {
    let body = ""; for await (const chunk of request) body += chunk;
    if (body) submittedBody = JSON.parse(body);
    if (request.url === "/clip.mp4") { response.writeHead(200,{"Content-Type":"video/mp4"}); response.end(clip); }
    else if (request.url === "/tail.png") { response.writeHead(200,{"Content-Type":"image/png"}); response.end(image); }
    else { response.setHeader("Content-Type","application/json"); if (request.method === "POST") { submissions++; response.end(JSON.stringify({id:"video-fixture"})); } else response.end(JSON.stringify({id:"video-fixture",status:"succeeded",duration:.4,content:{video_url:"https://media-fixture.invalid/clip.mp4",last_frame_url:"https://media-fixture.invalid/tail.png"}})); }
  });
  await new Promise<void>(resolve => provider.listen(0,"127.0.0.1",resolve));
  origin = `http://127.0.0.1:${(provider.address() as {port:number}).port}`;
  const realFetch = globalThis.fetch;
  // Replace only the fixture CDN transport. Requests, file bytes, processing,
  // reconciliation and packaging still run through their production code.
  const transport = vi.spyOn(globalThis, "fetch").mockImplementation((url, options) => realFetch(typeof url === "string" && url.startsWith("https://media-fixture.invalid/") ? origin + new URL(url).pathname : url, options));
  const api = await startPetLordServer({port:0,runtimeDataDirectory:join(directory,"data")});
  let request = 0, revision: number;
  async function call(command: string, input: unknown = {}, scoped = true) {
    const body = await (await fetch(api.url+"/api/design/v1/execute",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:`video-${++request}`,command,input,...(scoped?{projectId:"p",expectedRevision:revision}:{})})})).json() as any;
    if (body.error) throw new Error(JSON.stringify(body.error));
    if (body.result?.revision) revision=body.result.revision;
    return body.result;
  }
  try {
    const configuration = await call("provider.create",{type:"volcengine-ark",capability:"video",name:"fixture",apiKey:"fixture-token",baseUrl:origin,...(model === "ep-custom-video" ? {models:[{id:model,label:"Private video",description:"",estimatedUnitCostCny:0.1}]}:{})},false);
    await call("project.create",{id:"p",name:"Fixture pet",characterName:"Pet"},false);
    let sourceVariant = "";
    for (const id of ["sit","rest"]) {
      await call("state.create",{id,label:id});
      const imported = await call("media.import",{dataUrl:`data:image/png;base64,${image.toString("base64")}`,stateId:id});
      const approved = await call("state.approve",{stateId:id,artifactId:imported.value.artifact.id});
      if (id === "sit") sourceVariant=approved.value.id;
    }
    await call("transition.create",{id:"t",label:"Settle",fromVariantId:sourceVariant,toLogicalStateId:"rest"});
    await call("transition.update",{transitionId:"t",patch:{transparentVideo:false}});
    const submitted = await call("transition.generate",{transitionId:"t",settings:{videoProviderId:configuration.id,videoModel:model}});
    let job = submitted.job;
    for(let i=0;i<300&&!['succeeded','failed'].includes(job.status);i++){await new Promise(resolve=>setTimeout(resolve,20));job=(await call('job.get',{jobId:job.id},false)).job;}
    expect(job.error).toBeUndefined(); expect(job.status).toBe("succeeded"); expect(submissions).toBe(1);
    expect(submittedBody.model).toBe(model);
    expect(submittedBody.content.filter((item: any) => item.type === "image_url")).toHaveLength(2);
    if (model === "ep-custom-video") expect(job.cost).toMatchObject({status:"estimated"});
    const project = await call("project.get");
    const transition = project.project.transitions[0];
    const feedback = await call("media.process",{operation:"extract-frame",videoArtifactId:transition.videoArtifactId,timeMs:100});
    expect(feedback.value.artifacts[0]).toMatchObject({mimeType:"image/png",pixelWidth:480,pixelHeight:480});
    const frame = await fetch(new URL(feedback.value.artifacts[0].uri,api.url)); expect(frame.status).toBe(200);
    await call("transition.approve",{transitionId:"t"});
    expect((await call("project.inspect")).exportable).toBe(true);
    expect((await fetch(new URL((await call("package.export")).downloadPath,api.url))).status).toBe(200);
  } finally { await api.close(); transport.mockRestore(); provider.closeAllConnections(); await new Promise<void>(resolve=>provider.close(()=>resolve())); await rm(directory,{recursive:true,force:true}); }
},15000);
