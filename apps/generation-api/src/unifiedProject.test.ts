import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { PNG } from "pngjs";
import ffmpeg from "ffmpeg-static";
import { buildPetPackage } from "@petlord/state-engine";
import { startPetLordServer } from "./appServer";
import { decodeInstalledPackage, projectFromInstalledPackage } from "./installedPackages";

const document = {
  schemaVersion: 1, width: 2, height: 1, palette: { R: "#FF0000", B: "#0000FF" },
  frames: [
    { id: "a", layers: [{ id: "body", x: 0, y: 0, rows: ["R."] }] },
    { id: "b", baseFrameId: "a", patches: [{ layerId: "body", x: 1, y: 0, rows: ["B"] }] },
  ],
};

async function setup() {
  const directory = await mkdtemp(join(tmpdir(), "petlord-unified-"));
  const server = await startPetLordServer({ port: 0, runtimeDataDirectory: directory });
  let revision = 0;
  async function call(command: string, input: unknown = {}, extra: object = {}) {
    const response = await fetch(server.url + "/api/design/v1/execute", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: crypto.randomUUID(), command, projectId: "p", expectedRevision: revision, input, ...extra }),
    });
    const body = await response.json() as any;
    expect(response.status, JSON.stringify(body.error)).toBe(200);
    if (body.result?.revision) revision = body.result.revision;
    return body.result;
  }
  return { directory, server, call, close: async () => { await server.close(); await rm(directory, { recursive: true, force: true }); } };
}

it.each([undefined, "generated", "native-pixel"].flatMap(productionRoute =>
  ["pixel.document.set", "pixel.document.save"].map(command => ({ productionRoute, command })),
))("$command preserves the optional legacy route $productionRoute", async ({ productionRoute, command }) => {
  const api = await setup();
  try {
    const created = await api.call("project.create", { id: "p", name: "One project", characterName: "Pet", ...(productionRoute ? { productionRoute } : {}) });
    expect(created.project.productionRoute).toBe(productionRoute);
    expect(created.project.identityProfileId).toBeUndefined();
    const updated = await api.call(command, { document });
    expect(updated.project.productionRoute).toBe(productionRoute);
    expect(updated.project.pixelDocument).toEqual(document);
    expect((await api.call("project.get")).project).toEqual(updated.project);
  } finally { await api.close(); }
});

it.each([undefined, "generated", "native-pixel"])("exports native, generated and imported media together with legacy hint %s", async productionRoute => {
  const api = await setup();
  const imageBytes = await readFile("apps/studio/public/demo/pip/state-sitting.png");
  const provider = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume the real generation request */ }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ data: [{ b64_json: imageBytes.toString("base64") }] }));
  });
  await new Promise<void>(done => provider.listen(0, "127.0.0.1", done));
  try {
    const providerOrigin = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
    const configuration = await api.call("provider.create", { type: "volcengine-ark", capability: "image", name: "Local fixture", apiKey: "fixture-only", baseUrl: providerOrigin });
    await api.call("project.create", { id: "p", name: "Mixed media", characterName: "Pet", ...(productionRoute ? { productionRoute } : {}) });
    for (const id of ["a", "b", "generated", "imported"]) await api.call("state.create", { id, label: id });
    await api.call("pixel.document.set", { document });
    const source = await api.call("pixel.state.bind", { stateId: "a", frameId: "a", setInitial: true });
    const target = await api.call("pixel.state.bind", { stateId: "b", frameId: "b" });
    const nativeTarget = target.project.logicalStates.find((state: any) => state.id === "b").defaultVariantId;
    await api.call("transition.create", { id: "native", label: "Native motion", fromVariantId: source.project.initialVariantId, toLogicalStateId: "b" });
    await api.call("pixel.animation.bind", { transitionId: "native", frames: [{ frameId: "a", durationMs: 40 }, { frameId: "b", durationMs: 90 }], approve: true });

    const submission = await api.call("state.generate", { stateId: "generated", settings: { imageProviderId: configuration.id, imageModel: "doubao-seedream-4-5-251128", imageResolution: "1K" } });
    let job = submission.job;
    const deadline = Date.now() + 10_000;
    while (!["succeeded", "failed"].includes(job.status) && Date.now() < deadline) {
      await new Promise(done => setTimeout(done, 25));
      job = (await api.call("job.get", { jobId: job.id })).job;
    }
    expect(job.error).toBeUndefined();
    expect(job.status).toBe("succeeded");
    const candidates = await api.call("state.candidates", { stateId: "generated" });
    const generated = candidates.artifacts[0];
    expect(generated).toMatchObject({ sourceJobId: job.id, targetStateId: "generated", pixelWidth: 1024, pixelHeight: 1024, hasAlpha: true });
    expect(generated.nativePixel).toBeUndefined();
    const generatedBytes = Buffer.from(await (await fetch(new URL(generated.uri, api.server.url))).arrayBuffer());
    // Generation reconciles asynchronously; edit against the newly persisted revision.
    await api.call("project.get");
    await api.call("state.approve", { stateId: "generated", artifactId: generated.id });
    const imported = (await api.call("media.import", { stateId: "imported", dataUrl: `data:image/png;base64,${imageBytes.toString("base64")}` })).value.artifact;
    await api.call("state.approve", { stateId: "imported", artifactId: imported.id });

    // A real, local MP4 connects a native state to the generated state in the same graph.
    const clipPath = join(api.directory, "fixture.mp4");
    await promisify(execFile)(ffmpeg!, ["-y", "-f", "lavfi", "-i", "color=c=yellow:s=64x64:r=10:d=0.4", "-an", "-pix_fmt", "yuv420p", clipPath]);
    const clipBytes = await readFile(clipPath);
    const video = (await api.call("media.import", { dataUrl: `data:video/mp4;base64,${clipBytes.toString("base64")}` })).value.artifact;
    await api.call("transition.create", { id: "video", label: "Mixed motion", fromVariantId: nativeTarget, toLogicalStateId: "generated", endFrameSource: "authority-reference", targetDraftArtifactId: generated.id });
    await api.call("transition.update", { transitionId: "video", patch: { videoArtifactId: video.id, durationMs: 400, sourceVideoDurationMs: 400, transparentVideo: false } });
    await api.call("transition.approve", { transitionId: "video" });

    const before = (await api.call("project.get")).project;
    const saved = await api.call("pixel.document.save", { document: { ...document, palette: { R: "#00FF00", B: "#0000FF" } } });
    expect(saved.project.productionRoute).toBe(productionRoute);
    expect(saved.project.identityProfileId).toBeUndefined();
    expect(saved.project.transitions.map((transition: any) => transition.status)).toEqual(["approved", "approved"]);
    expect(saved.project.transitions.find((transition: any) => transition.id === "video")).toEqual(before.transitions.find((transition: any) => transition.id === "video"));
    for (const artifact of [generated, imported, video]) expect(saved.project.artifacts.find((candidate: any) => candidate.id === artifact.id)).toEqual(before.artifacts.find((candidate: any) => candidate.id === artifact.id));
    const inspected = await api.call("project.inspect");
    expect(inspected.issues).toEqual([]);
    expect(inspected.exportable).toBe(true);
    const exported = await api.call("package.export");
    const bytes = new Uint8Array(await (await fetch(new URL(exported.downloadPath, api.server.url))).arrayBuffer());
    const bundle = decodeInstalledPackage(bytes);
    expect(bundle.sourceProject!.productionRoute).toBe(productionRoute);
    const mediaBytes = (uri: string) => Buffer.from(bundle.assets[uri.slice(8)].split(",")[1], "base64");
    expect(bundle.manifest.states).toHaveLength(4);
    for (const state of bundle.manifest.states) {
      if (["a", "b"].includes(state.logicalStateId)) {
        expect(state.nativePixel).toEqual({ width: 2, height: 1 });
        expect([...PNG.sync.read(mediaBytes(state.imageUri)).data]).toEqual(state.logicalStateId === "a"
          ? [0, 255, 0, 255, 0, 0, 0, 0] : [0, 255, 0, 255, 0, 0, 255, 255]);
      } else {
        expect(state.nativePixel).toBeUndefined();
        // Compare complete binary payloads without traversing millions of Buffer entries in JS.
        expect(mediaBytes(state.imageUri).equals(state.logicalStateId === "generated" ? generatedBytes : imageBytes)).toBe(true);
      }
    }
    const native = bundle.manifest.transitions.find(transition => transition.id === "native")!;
    expect(native.durationMs).toBe(130);
    expect(native.nativeAnimation!.frames.map(frame => frame.durationMs)).toEqual([40, 90]);
    expect(native.nativeAnimation!.frames[0].imageUri).toBe(bundle.manifest.states.find(state => state.id === native.fromStateId)!.imageUri);
    expect(native.nativeAnimation!.frames[1].imageUri).toBe(native.tailFrameUri);
    expect(native.videoUri).toBeUndefined();
    const runtimeVideo = bundle.manifest.transitions.find(transition => transition.id === "video")!;
    expect(runtimeVideo.nativeAnimation).toBeUndefined();
    expect(runtimeVideo.durationMs).toBe(400);
    expect(mediaBytes(runtimeVideo.videoUri!).equals(clipBytes)).toBe(true);
    expect(runtimeVideo.tailFrameUri).toBe(bundle.manifest.states.find(state => state.logicalStateId === "generated")!.imageUri);

    const restored = await projectFromInstalledPackage(bundle, "c".repeat(64), "mixed.petlord", async dataUrl => ({ uri: dataUrl, mimeType: dataUrl.slice(5, dataUrl.indexOf(";")) }));
    expect(restored.productionRoute).toBe(productionRoute);
    expect(restored.pixelDocument).toEqual(saved.project.pixelDocument);
    expect(restored.transitions).toEqual(saved.project.transitions);
    expect(restored.variants).toEqual(saved.project.variants);
    const reconstructed = await projectFromInstalledPackage({ ...bundle, sourceProject: undefined }, "d".repeat(64), "runtime-only.petlord", async dataUrl => ({ uri: dataUrl, mimeType: dataUrl.slice(5, dataUrl.indexOf(";")) }));
    expect(reconstructed.productionRoute).toBeUndefined();
    expect(reconstructed.pixelDocument!.frames).toHaveLength(2);
    const runtime = buildPetPackage(reconstructed);
    expect(runtime.states.map(state => state.nativePixel)).toEqual([{ width: 2, height: 1 }, { width: 2, height: 1 }, undefined, undefined]);
    expect(runtime.transitions[0].nativeAnimation!.frames.map(frame => frame.durationMs)).toEqual([40, 90]);
    expect(runtime.transitions[1].videoUri).toBe(`data:video/mp4;base64,${clipBytes.toString("base64")}`);
  } finally {
    provider.closeAllConnections();
    await new Promise<void>(done => provider.close(() => done()));
    await api.close();
  }
}, 20_000);

it("summary responses do not classify route-free projects as generated", async () => {
  const api = await setup();
  try {
    const created = await api.call("project.create", { id: "p", name: "One project", characterName: "Pet" }, { responseMode: "summary" });
    expect(created.projectSummary).toEqual({ id: "p", name: "One project", states: 0, transitions: 0, artifacts: 0 });
    const saved = await api.call("pixel.document.save", { document }, { responseMode: "summary" });
    expect(saved.projectSummary).not.toHaveProperty("productionRoute");
  } finally { await api.close(); }
});
