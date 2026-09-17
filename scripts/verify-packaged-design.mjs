#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";

// Run with the bundled Electron in Node mode. All production commands below use
// the installed launcher and the running desktop's private connection file.
const [launcherInput, outputInput, referenceInput] = process.argv.slice(2);
if (!launcherInput || !outputInput || !referenceInput) throw new Error("Usage: verify-packaged-design.mjs <installed-cli> <output-directory> <bundled-reference.png>");
const launcher = resolve(launcherInput), output = resolve(outputInput);
await mkdir(output, { recursive: true });
const stamp = Date.now(), nativeId = `packaged-native-${stamp}`, generatedId = `packaged-generated-${stamp}`;
async function cli(args, input) {
  const text = await new Promise((resolveText, reject) => {
    const child = execFile(launcher, args, {maxBuffer:8*1024*1024,timeout:120_000}, (error, stdout, stderr) => error ? reject(new Error(stdout || stderr || error.message)) : resolveText(stdout));
    if (input) child.stdin.end(JSON.stringify(input));
  });
  const result = JSON.parse(text);
  if (result.error) throw new Error(JSON.stringify(result.error));
  return result;
}
async function command(name, input = {}, extra = {}) {
  return (await cli(["execute","--input","-"], {requestId:`smoke-${crypto.randomUUID()}`,command:name,input,...extra})).result;
}
const native = (await cli(["example","lottery","--project",nativeId])).result;
let current = await command("project.get", {}, {projectId:nativeId});
current = await command("pixel.frame.upsert", {frame:{id:"inspection-blink",baseFrameId:"sitting",patches:[{layerId:"body",x:19,y:19,rows:["n"]}]}}, {projectId:nativeId,expectedRevision:current.revision});
const feedback = await command("pixel.feedback", {frameIds:["sitting","resting","sleeping","stretching"],columns:4,scale:6}, {projectId:nativeId});
await cli(["media","get",feedback.contactSheet.uri,"--out",join(output,"lottery-states.png")]);
const nativeExport = await cli(["export",nativeId,"--out",join(output,"lottery.petlord")]);
await cli(["install",nativeId,"--revision",String(current.revision)]);

const image = await readFile(resolve(referenceInput));
let providerRequests = 0;
const fixture = createServer(async (request,response) => {
  for await (const _chunk of request) { /* consume request */ }
  providerRequests++;
  response.writeHead(200,{"Content-Type":"application/json"});
  response.end(JSON.stringify({data:[{b64_json:image.toString("base64")}]}));
});
await new Promise(done=>fixture.listen(0,"127.0.0.1",done));
let provider;
try {
  provider = await command("provider.create",{type:"volcengine-ark",capability:"image",name:"Packaged verification fixture",apiKey:"local-fixture-credential",baseUrl:`http://127.0.0.1:${fixture.address().port}`});
  current = await command("project.create",{id:generatedId,name:"打包验证 · 本地模拟 Provider",characterName:"Pip"});
  current = await command("state.create",{id:"sit",label:"坐着"},{projectId:generatedId,expectedRevision:current.revision});
  const job = (await command("state.generate",{stateId:"sit",settings:{imageProviderId:provider.id,imageModel:"doubao-seedream-4-5-251128",imageResolution:"1K"}},{projectId:generatedId,expectedRevision:current.revision})).job;
  const completed = (await cli(["job","wait",job.id,"--timeout-ms","60000","--interval-ms","100"])).result.job;
  if (completed.status !== "succeeded") throw new Error("Packaged image processing did not succeed.");
  const candidates = await command("state.candidates",{stateId:"sit"},{projectId:generatedId});
  const candidate = candidates.artifacts[0];
  if (candidates.artifacts.length !== 1 || candidate.pixelWidth !== 1024 || !candidate.hasAlpha) throw new Error("Packaged postprocessing failed image/alpha expectations.");
  current = await command("state.approve",{stateId:"sit",artifactId:candidate.id},{projectId:generatedId,expectedRevision:candidates.revision});
  const generatedExport = await cli(["export",generatedId,"--out",join(output,"generated-fixture.petlord")]);
  const report = {verifiedAt:new Date().toISOString(),launcher,native:{projectId:nativeId,states:native.states,transitions:native.transitions,sourceFrames:21,exportedBytes:nativeExport.download.bytes,feedback:feedback.contactSheet},generated:{projectId:generatedId,providerRequests,jobId:job.id,status:completed.status,width:candidate.pixelWidth,height:candidate.pixelHeight,hasAlpha:candidate.hasAlpha,exportedBytes:generatedExport.download.bytes},externalPaidCalls:0};
  await writeFile(join(output,"packaged-design.json"),JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
} finally {
  if (provider) await command("provider.delete",{providerId:provider.id}).catch(()=>undefined);
  fixture.closeAllConnections();
  await new Promise(done=>fixture.close(done));
}
