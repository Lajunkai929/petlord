import { createHash } from "node:crypto";
import { z } from "zod";
import { artifactSchema, characterProjectSchema, generationSettingsSchema, identityProfileSchema, type Artifact, type CharacterProject, type IdentityProfile, type PublishedPackageSummary } from "@petlord/schema";
import { applyDesignMutation, createDesignProject, createPortableProjectSource, designMutations, DesignError, inspectDesignProject, resolveProjectGenerationContext, type StyleProfile } from "@petlord/design-core";
import { defaultStyleProfiles, normalizeStyleProfile } from "@petlord/design-core/styleLibrary";
import { projectTemplates, saveProjectAsTemplate, type SavedProjectTemplate } from "@petlord/design-core/projectTemplates";
import { buildStateDraftJobSubmission, buildTransitionJobSubmission, type PersistentGenerationJob } from "@petlord/generation";
import { type SqliteStore, type WorkspaceSnapshot } from "./sqliteStore";
import { type GenerationProviderRegistry } from "./providers/registry";
import { designCatalog, designRequestSchema, serviceCommands, type DesignRequest, mediaProcessSchema } from "./designCommands";
import { validatePixelDocument } from "@petlord/pixel-art";
import { bindNativeAnimation, nativeFeedback, renderNativeFrames, saveNativeDocument } from "./nativeDesign";
import lotteryExample from "../../../packages/pixel-art/src/examples/lottery.json";

export interface DesignResponse { protocolVersion: 1; requestId: string; result?: unknown; error?: { code: string; message: string; details?: unknown; retryable: boolean } }
export interface GenerationCommandReceipt { requestId: string; requestHash: string; projectId: string; expectedRevision: number }
export interface DesignServicePorts {
  providers: GenerationProviderRegistry;
  importMedia(dataUrl: string, mediaId: string): Promise<{ id: string; uri: string; mimeType: string }>;
  resolveImage(uri: string): Promise<string>;
  listJobs(): PersistentGenerationJob[];
  submitJob(input: unknown, receipt?: GenerationCommandReceipt): Promise<PersistentGenerationJob>;
  retryJob(jobId: string, receipt?: Pick<GenerationCommandReceipt, "requestId" | "requestHash">): Promise<PersistentGenerationJob>;
  exportPackage(project: CharacterProject): Promise<PublishedPackageSummary>;
  installPackage?(project: CharacterProject, input: { projectId: string; revision: number }): Promise<unknown>;
  getPackageInstallation?(projectId: string, currentRevision: number): Promise<unknown>;
  syncInstalledPackages?():Promise<unknown>;
  processMedia?(input: z.infer<typeof mediaProcessSchema>, video: Artifact, tail?: Artifact): Promise<{ video?: Partial<Artifact>; tail?: Partial<Artifact>; durationMs?: number }>;
}
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue((value as Record<string, unknown>)[key])]));
  return value;
}
function hashInput(value: unknown) { return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex"); }
function requestUuid(requestId: string) {
  const hex = createHash("sha256").update(`petlord-design:${requestId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function success(request: DesignRequest, result: unknown): DesignResponse {
  if (request.responseMode === "summary" && result && typeof result === "object" && "project" in result) {
    const { project, ...rest } = result as { project: CharacterProject; [key: string]: unknown };
    result = { ...rest, projectSummary: { id: project.id, name: project.name, productionRoute: project.productionRoute, states: project.logicalStates.length, transitions: project.transitions.length, artifacts: project.artifacts.length } };
  }
  return { protocolVersion: 1, requestId: request.requestId, result };
}
function failed(requestId: string, error: unknown): DesignResponse {
  if (error instanceof z.ZodError) return { protocolVersion: 1, requestId, error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid input.", details: error.issues, retryable: false } };
  const code = error instanceof DesignError ? error.code : "OPERATION_FAILED";
  return { protocolVersion: 1, requestId, error: { code, message: error instanceof Error ? error.message : "Design operation failed.", details: error instanceof DesignError ? error.details : undefined, retryable: ["REVISION_CONFLICT", "OPERATION_FAILED"].includes(code) } };
}
export function designResponseStatus(response: DesignResponse): number {
  if (!response.error) return 200;
  if (["REVISION_CONFLICT", "REVISION_REQUIRED", "REQUEST_ID_REUSED", "ALREADY_EXISTS", "REFERENCED", "NOT_READY"].includes(response.error.code)) return 409;
  if (response.error.code === "NOT_FOUND") return 404;
  if (response.error.code === "UNAVAILABLE") return 503;
  return response.error.code === "OPERATION_FAILED" ? 500 : 400;
}

export class DesignService {
  private readonly inFlight = new Map<string, { hash: string; response: Promise<DesignResponse> }>();
  constructor(private readonly store: SqliteStore, private readonly ports: DesignServicePorts) {}
  catalog() { return designCatalog(); }

  async execute(input: unknown): Promise<DesignResponse> {
    let request: DesignRequest;
    try { request = designRequestSchema.parse(input); }
    catch (error) { return failed(typeof (input as { requestId?: unknown })?.requestId === "string" ? (input as { requestId: string }).requestId : "invalid-request", error); }
    const hash = hashInput(request);
    const receipt = this.store.getDesignReceipt<DesignResponse>(request.requestId);
    if (receipt) return receipt.requestHash === hash ? receipt.response : failed(request.requestId, new DesignError("REQUEST_ID_REUSED", "Request id was reused with different input."));
    const active = this.inFlight.get(request.requestId);
    if (active) return active.hash === hash ? active.response : failed(request.requestId, new DesignError("REQUEST_ID_REUSED", "Request id is already running with different input."));
    const response = this.dispatch(request, hash).catch(error => failed(request.requestId, error));
    this.inFlight.set(request.requestId, { hash, response });
    try { return await response; } finally { this.inFlight.delete(request.requestId); }
  }

  private project(request: DesignRequest, edit = false): WorkspaceSnapshot<CharacterProject> {
    if (!request.projectId) throw new DesignError("INVALID_INPUT", "projectId is required for this command.");
    const snapshot = this.store.getEntitySnapshot<CharacterProject>("project", request.projectId);
    if (!snapshot) throw new DesignError("NOT_FOUND", `Project ${request.projectId} does not exist.`);
    if (edit) this.checkRevision(request, snapshot.revision);
    return { ...snapshot, data: characterProjectSchema.parse(snapshot.data) };
  }
  private checkRevision(request: DesignRequest, revision: number) {
    if (request.expectedRevision === undefined) throw new DesignError("REVISION_REQUIRED", "Read the entity and supply expectedRevision before editing.");
    if (request.expectedRevision !== revision) throw new DesignError("REVISION_CONFLICT", "The workspace changed. Read the latest revision before editing.", { expectedRevision: request.expectedRevision, actualRevision: revision });
  }
  private commitProject(request: DesignRequest, hash: string, project: CharacterProject, expectedRevision: number | null, value?: unknown) {
    return this.store.commitEntityCommand({ type: "project", id: project.id, expectedRevision, data: project, requestId: request.requestId, requestHash: hash }, snapshot => success(request, { project: snapshot.data, revision: snapshot.revision, ...(value === undefined ? {} : { value }) }));
  }
  private remember(request: DesignRequest, hash: string, result: unknown) {
    const existing = this.store.getDesignReceipt<DesignResponse>(request.requestId);
    if (existing) {
      if (existing.requestHash !== hash) throw new DesignError("REQUEST_ID_REUSED", "Request id was reused with different input.");
      return existing.response;
    }
    const response = success(request, result);
    this.store.saveDesignReceipt(request.requestId, hash, response);
    return response;
  }
  private atomic(request: DesignRequest, hash: string, operation: () => unknown) {
    return this.store.commitDesignOperation(request.requestId, hash, () => success(request, operation()));
  }
  private generationContext(project: CharacterProject) {
    return resolveProjectGenerationContext(project, this.store.listEntities<IdentityProfile>("identity"), [...this.store.listEntities<StyleProfile>("style"), ...defaultStyleProfiles]);
  }

  private async dispatch(request: DesignRequest, hash: string): Promise<DesignResponse> {
    const mutation = designMutations[request.command];
    if (mutation) {
      const current = this.project(request, true);
      const result = applyDesignMutation(current.data, request.command, request.input);
      return this.commitProject(request, hash, result.project, current.revision, result.value);
    }
    const definition = serviceCommands[request.command];
    if (!definition) throw new DesignError("UNKNOWN_COMMAND", `Unknown command ${request.command}. Read /api/design/v1/commands for supported operations.`);
    // The catalog schema is also the execution validator. Fine-grained command
    // branches below only consume this already-validated input.
    const args = definition.schema.parse(request.input) as Record<string, any>;
    const raw = request.input as Record<string, unknown>;
    if (args.settings && raw.settings && typeof raw.settings === "object") {
      args.settings = Object.fromEntries(Object.keys(raw.settings).map(key => [key, args.settings[key]]));
    }
    if (definition.requiresProject) this.project(request, definition.requiresRevision);
    switch (request.command) {
      case "package.syncInstalled": return this.remember(request,hash,await this.ports.syncInstalledPackages?.() ?? {imported:[],skipped:0,errors:[]});
      case "pixel.example.get": return success(request, lotteryExample);
      case "pixel.example.create": {
        let project = createDesignProject({ id: args.id ?? `lottery-${requestUuid(request.requestId)}`, name: args.name, characterName: "彩票" });
        if (this.store.getEntitySnapshot("project", project.id)) throw new DesignError("ALREADY_EXISTS", "Project already exists.");
        project = applyDesignMutation(project, "pixel.document.set", { document: lotteryExample.document }).project;
        const rendered = await renderNativeFrames(project, undefined, this.ports.importMedia);
        project = rendered.project;
        const frames = new Map(rendered.frames.map(frame => [frame.nativePixel!.frameId, frame]));
        for (const state of lotteryExample.states) {
          project = applyDesignMutation(project, "state.create", { id: state.id, label: state.label, semanticKey: state.semanticKey }).project;
          project = applyDesignMutation(project, "state.approve", { stateId: state.id, artifactId: frames.get(state.frameId)!.id, setInitial: state.id === "sitting" }).project;
        }
        const animations = [...lotteryExample.animations, ...lotteryExample.animations.filter(animation => !animation.loop).map(animation => ({ ...animation, id: `${animation.id}-reverse`, label: `${animation.label} · 返回`, fromStateId: animation.toStateId, toStateId: animation.fromStateId, frames: [...animation.frames].reverse() }))];
        for (const animation of animations) {
          const from = project.logicalStates.find(state => state.id === animation.fromStateId)!;
          project = applyDesignMutation(project, "transition.create", { id: animation.id, label: animation.label, fromVariantId: from.defaultVariantId, toLogicalStateId: animation.toStateId }).project;
          project = bindNativeAnimation(project, animation.id, animation.frames.map(frame => ({ artifact: frames.get(frame.frameId)!, durationMs: frame.durationMs })), true);
          project = applyDesignMutation(project, "transition.update", { transitionId: animation.id, patch: animation.loop ? { idleRule: { enabled: true, weight: 1, cooldownMs: 2000 } } : { triggers: [{ id: `trigger-${animation.id}`, event: "left-click", enabled: true }] } }).project;
        }
        return this.commitProject(request, hash, project, null, { example: "lottery", generationCostCny: 0 });
      }
      case "media.process": {
        if (!this.ports.processMedia) throw new DesignError("UNAVAILABLE", "Local media tools are unavailable in this host.");
        const current = this.project(request, true);
        const video = current.data.artifacts.find(a => a.id === args.videoArtifactId);
        const tail = current.data.artifacts.find(a => a.id === args.tailArtifactId);
        if (!video?.mimeType.startsWith("video/") || (args.operation === "transparentize" && !tail?.mimeType.startsWith("image/"))) throw new DesignError("MISSING_MEDIA", "Select a real video and, for background removal, a tail image.");
        if (args.operation === "ping-pong" && args.segmentEndMs <= args.segmentStartMs) throw new DesignError("INVALID_INPUT", "Segment end must follow its start.");
        const processed = await this.ports.processMedia(args as never, video, tail);
        let project = current.data;
        const value: Record<string, unknown> = { artifacts: [], durationMs: processed.durationMs };
        for (const kind of ["video", "tail"] as const) if (processed[kind]) {
          const artifact = artifactSchema.parse({ ...processed[kind], id: `processed-${kind}-${requestUuid(request.requestId)}`, kind: kind === "video" ? "transition-video" : "state-actual", provenance: "generated", createdAt: new Date().toISOString() });
          project = applyDesignMutation(project, "artifact.register", { artifact }).project;
          (value.artifacts as Artifact[]).push(artifact); value[`${kind}ArtifactId`] = artifact.id;
        }
        return this.commitProject(request, hash, project, current.revision, value);
      }
      case "pixel.document.get": { const current = this.project(request); return success(request, { document: current.data.pixelDocument ?? null, revision: current.revision }); }
      case "pixel.document.save": {
        const current = this.project(request, true);
        const saved = await saveNativeDocument(current.data, args.document, this.ports.importMedia);
        return this.commitProject(request, hash, saved.project, current.revision, { frames: saved.frames, artifactReplacements: saved.artifactReplacements });
      }
      case "pixel.validate": return success(request, validatePixelDocument(args.document ?? this.project(request).data.pixelDocument));
      case "pixel.feedback": return success(request, await nativeFeedback(this.project(request).data, args as never, this.ports.importMedia));
      case "pixel.render": case "pixel.state.bind": case "pixel.animation.bind": {
        const current = this.project(request, true);
        const ids = request.command === "pixel.state.bind" ? [args.frameId] : request.command === "pixel.animation.bind" ? args.frames.map((f: { frameId: string }) => f.frameId) : args.frameIds;
        const rendered = await renderNativeFrames(current.data, ids, this.ports.importMedia);
        let next = rendered.project;
        if (request.command === "pixel.state.bind") next = applyDesignMutation(next, "state.approve", { stateId: args.stateId, artifactId: rendered.frames[0].id, setInitial: args.setInitial }).project;
        if (request.command === "pixel.animation.bind") next = bindNativeAnimation(next, args.transitionId, args.frames.map((f: { durationMs: number }, i: number) => ({ artifact: rendered.frames[i], durationMs: f.durationMs })), args.approve, args.playback);
        return this.commitProject(request, hash, next, current.revision, { frames: rendered.frames });
      }
      case "project.list": return success(request, this.store.listEntitySnapshots<CharacterProject>("project").map(({ data, revision }) => ({ id: data.id, name: data.name, characterName: data.characterName, revision, updatedAt: data.updatedAt })));
      case "project.create": {
        const project = createDesignProject(args, args.templateId ? this.store.getEntitySnapshot<SavedProjectTemplate>("template", args.templateId)?.data : undefined);
        if (this.store.getEntitySnapshot("project", project.id)) throw new DesignError("ALREADY_EXISTS", `Project ${project.id} already exists.`);
        if (project.identityProfileId && !this.store.getEntitySnapshot("identity", project.identityProfileId)) throw new DesignError("NOT_FOUND", "Identity profile does not exist.");
        return this.commitProject(request, hash, project, null);
      }
      case "project.get": { const current = this.project(request); return success(request, { project: current.data, revision: current.revision }); }
      case "project.inspect": { const current = this.project(request); return success(request, { ...inspectDesignProject(current.data), revision: current.revision }); }
      case "project.delete": {
        const current = this.project(request, true);
        if (this.ports.listJobs().some(j => j.trigger.projectId === current.data.id && !["succeeded", "failed"].includes(j.status))) throw new DesignError("REFERENCED", "Project has active generation jobs.");
        return this.store.commitEntityCommand({ type: "project", id: current.data.id, expectedRevision: current.revision, data: null, requestId: request.requestId, requestHash: hash }, s => success(request, { deleted: true, revision: s.revision }));
      }
      case "state.get": case "state.candidates": {
        const { data: project, revision } = this.project(request);
        const state = project.logicalStates.find(s => s.id === args.stateId);
        if (!state) throw new DesignError("NOT_FOUND", "State does not exist.");
        return success(request, request.command === "state.candidates" ? { artifacts: project.artifacts.filter(a => a.targetStateId === state.id && a.kind === "state-draft"), revision } : { state, variants: project.variants.filter(v => v.logicalStateId === state.id), revision });
      }
      case "transition.get": {
        const { data, revision } = this.project(request);
        const transition = data.transitions.find(t => t.id === args.transitionId);
        if (!transition) throw new DesignError("NOT_FOUND", "Transition does not exist.");
        return success(request, { transition, revision });
      }
      case "artifact.get": {
        const artifact = this.project(request).data.artifacts.find(a => a.id === args.artifactId);
        if (!artifact) throw new DesignError("NOT_FOUND", "Artifact does not exist.");
        return success(request, { artifact });
      }
      case "media.list": return success(request, this.store.listMedia());
      case "media.import": {
        const current = request.projectId ? this.project(request, true) : undefined;
        if (args.stateId && !current?.data.logicalStates.some(s => s.id === args.stateId)) throw new DesignError("NOT_FOUND", "Target state does not exist.");
        const media = await this.ports.importMedia(args.dataUrl, requestUuid(request.requestId));
        if (!current) return this.remember(request, hash, { media });
        const artifact = artifactSchema.parse({ id: `artifact-${media.id}`, kind: args.kind ?? (args.stateId ? "state-draft" : media.mimeType.startsWith("video/") ? "transition-video" : "identity-reference"), uri: media.uri, mimeType: media.mimeType, createdAt: new Date().toISOString(), provenance: "user-upload", targetStateId: args.stateId, label: args.label });
        const result = applyDesignMutation(current.data, "artifact.register", { artifact });
        if (artifact.kind === "identity-reference") result.project.referenceArtifactIds = [...new Set([...result.project.referenceArtifactIds, artifact.id])];
        return this.commitProject(request, hash, result.project, current.revision, { media, artifact });
      }
      case "state.generate": {
        const current = this.project(request, true), project = current.data;
        const state = project.logicalStates.find(s => s.id === args.stateId);
        if (!state) throw new DesignError("NOT_FOUND", "State does not exist.");
        const context = this.generationContext(project);
        const settings = generationSettingsSchema.parse({ ...project.generationSettings, ...args.settings });
        const submission = await buildStateDraftJobSubmission({ jobId: requestUuid(request.requestId), trigger: { projectId: project.id, entityType: "state", entityId: state.id, label: state.label }, characterName: context.characterName, identityReferenceUris: context.identityReferences.map(a => a.uri), identityPrompt: context.identityPrompt, stylePrompt: context.imageStylePrompt, targetStateLabel: state.label, prompt: args.prompt ?? state.description, settings }, uri => this.ports.resolveImage(uri));
        this.checkRevision(request, this.project(request).revision);
        return this.remember(request, hash, { job: await this.ports.submitJob(submission, { requestId: request.requestId, requestHash: hash, projectId: project.id, expectedRevision: current.revision }) });
      }
      case "transition.generate": {
        const { data: project, revision } = this.project(request, true);
        const transition = project.transitions.find(t => t.id === args.transitionId);
        if (!transition) throw new DesignError("NOT_FOUND", "Transition does not exist.");
        const source = project.variants.find(v => v.id === transition.fromVariantId);
        const first = project.artifacts.find(a => a.id === source?.imageArtifactId);
        const targetId = transition.endFrameSource === "source-frame" ? first?.id : transition.targetDraftArtifactId ?? project.logicalStates.find(s => s.id === transition.toLogicalStateId)?.referenceArtifactId;
        const target = project.artifacts.find(a => a.id === targetId);
        if (!first || !target) throw new DesignError("MISSING_MEDIA", "Approve source and target reference images before generating a transition.");
        const context = this.generationContext(project);
        const settings = generationSettingsSchema.parse({ ...project.generationSettings, ...args.settings });
        const submission = await buildTransitionJobSubmission({ jobId: requestUuid(request.requestId), trigger: { projectId: project.id, entityType: "transition", entityId: transition.id, label: transition.label }, characterName: context.characterName, fromStateImageUri: first.uri, targetDraftImageUri: target.uri, identityReferenceUris: context.identityReferences.map(a => a.uri), identityPrompt: context.identityPrompt, stylePrompt: context.videoStylePrompt, prompt: args.prompt ?? transition.prompt, settings, durationMode: transition.durationMode, durationSeconds: transition.durationSeconds, transparentVideo: transition.transparentVideo, transparencyKeyColor: transition.transparencyProcessing.keyColor, transparencySimilarity: transition.transparencyProcessing.similarity, chromaBackgroundColor: project.videoBackground.mode === "manual" ? project.videoBackground.manualColor : project.videoBackground.autoColor }, uri => this.ports.resolveImage(uri));
        this.checkRevision(request, this.project(request).revision);
        return this.remember(request, hash, { job: await this.ports.submitJob(submission, { requestId: request.requestId, requestHash: hash, projectId: project.id, expectedRevision: revision }) });
      }
      case "state.gaze.generate": {
        const current = this.project(request, true), project = current.data;
        const state = project.logicalStates.find(s => s.id === args.stateId);
        if (!state?.pointerGaze?.enabled) throw new DesignError("NOT_READY", "Enable pointerGaze on the state before generating.");
        const variant = project.variants.find(v => v.id === (state.preferredOutboundVariantId ?? state.defaultVariantId));
        const image = project.artifacts.find(a => a.id === (variant?.imageArtifactId ?? state.referenceArtifactId));
        if (!image) throw new DesignError("MISSING_MEDIA", "Approve the state's reference image first.");
        const context = this.generationContext(project), settings = generationSettingsSchema.parse({ ...project.generationSettings, ...args.settings });
        const prompt = args.prompt ?? `{{characterName}} 保持“${state.label}”的身体、四肢和尾巴完全固定，${state.pointerGaze.motionTarget === "eyes" ? "头部完全固定，只让左右瞳孔同向移动" : "眼睛和头部小幅追踪目标"}。固定摄影机、角色大小与位置。严格按照 6 秒时间点：0–0.4 秒正前方；0.6 秒左；1.2 秒左上；1.8 秒上；2.4 秒右上；3 秒右；3.6 秒右下；4.2 秒下；4.8 秒左下；5.4–6 秒准确回到正前方。`;
        const color = project.videoBackground.mode === "manual" ? project.videoBackground.manualColor : project.videoBackground.autoColor;
        const submission = await buildTransitionJobSubmission({ jobId: requestUuid(request.requestId), trigger: { projectId: project.id, entityType: "pointer-gaze", entityId: state.id, label: `${state.label} · 注视` }, characterName: context.characterName, fromStateImageUri: image.uri, targetDraftImageUri: image.uri, identityReferenceUris: context.identityReferences.map(a => a.uri), identityPrompt: context.identityPrompt, stylePrompt: context.videoStylePrompt, prompt, settings, durationMode: "fixed", durationSeconds: 6, transparentVideo: true, transparencyKeyColor: color, transparencySimilarity: .34, chromaBackgroundColor: color }, uri => this.ports.resolveImage(uri));
        this.checkRevision(request, this.project(request).revision);
        return this.remember(request, hash, { job: await this.ports.submitJob(submission, { requestId: request.requestId, requestHash: hash, projectId: project.id, expectedRevision: current.revision }) });
      }
      case "provider.list": return success(request, this.ports.providers.snapshot());
      case "provider.create": return this.atomic(request, hash, () => this.ports.providers.create(args as never));
      case "provider.update": {
        if (this.ports.listJobs().some(j => j.providerId === args.providerId && !["succeeded", "failed"].includes(j.status))) throw new DesignError("REFERENCED", "Provider is used by an active generation job.");
        return this.atomic(request, hash, () => {
          const updated = this.ports.providers.update(args.providerId, args.patch);
          if (!updated) throw new DesignError("NOT_FOUND", "Provider does not exist.");
          return updated;
        });
      }
      case "provider.test": return success(request, await this.ports.providers.test(args.providerId));
      case "provider.delete": {
        if (this.ports.listJobs().some(j => j.providerId === args.providerId && !["succeeded", "failed"].includes(j.status))) throw new DesignError("REFERENCED", "Provider is used by an active generation job.");
        return this.atomic(request, hash, () => {
          if (!this.ports.providers.delete(args.providerId)) throw new DesignError("NOT_FOUND", "Provider does not exist.");
          return { deleted: true };
        });
      }
      case "job.list": return success(request, this.ports.listJobs().filter(j => !request.projectId || j.trigger.projectId === request.projectId));
      case "job.get": { const job = this.ports.listJobs().find(j => j.id === args.jobId); if (!job) throw new DesignError("NOT_FOUND", "Job does not exist."); return success(request, { job }); }
      case "job.retry": {
        const job = this.ports.listJobs().find(job => job.id === args.jobId);
        if (!job) throw new DesignError("NOT_FOUND", "Job does not exist.");
        return this.remember(request, hash, { job: await this.ports.retryJob(args.jobId, { requestId: request.requestId, requestHash: hash }) });
      }
      case "identity.list": return success(request, this.store.listEntitySnapshots("identity"));
      case "identity.create": {
        const time = new Date().toISOString();
        const identity = identityProfileSchema.parse({ ...args, id: args.id ?? `identity-${requestUuid(request.requestId)}`, schemaVersion: 1, createdAt: time, updatedAt: time });
        return this.store.commitEntityCommand({ type: "identity", id: identity.id, data: identity, expectedRevision: null, requestId: request.requestId, requestHash: hash }, snapshot => success(request, snapshot));
      }
      case "identity.update": {
        const current = this.store.getEntitySnapshot<IdentityProfile>("identity", args.identityId);
        if (!current) throw new DesignError("NOT_FOUND", "Identity does not exist.");
        this.checkRevision(request, current.revision);
        const patch = Object.fromEntries(Object.keys((request.input as { patch: object }).patch).map(k => [k, args.patch[k]]));
        const identity = identityProfileSchema.parse({ ...current.data, ...patch, updatedAt: new Date().toISOString() });
        return this.store.commitEntityCommand({ type: "identity", id: identity.id, data: identity, expectedRevision: current.revision, requestId: request.requestId, requestHash: hash }, snapshot => success(request, snapshot));
      }
      case "style.list": return success(request, { saved: this.store.listEntitySnapshots("style"), builtIn: defaultStyleProfiles });
      case "style.create": {
        const time = new Date().toISOString();
        const style = normalizeStyleProfile({ name: args.name, description: args.description, imagePrompt: args.imagePrompt, videoPrompt: args.videoPrompt, experimentBudgetCny: args.experimentBudgetCny, id: args.id ?? `style-${requestUuid(request.requestId)}`, prompt: args.imagePrompt, definitionVersion: 1, revisions: [], createdAt: time, updatedAt: time });
        return this.store.commitEntityCommand({ type: "style", id: style.id, data: style, expectedRevision: null, requestId: request.requestId, requestHash: hash }, snapshot => success(request, snapshot));
      }
      case "style.update": case "template.update": {
        const type = request.command === "style.update" ? "style" : "template";
        const current = this.store.getEntitySnapshot<StyleProfile | SavedProjectTemplate>(type, args[`${type}Id`]);
        if (!current) throw new DesignError("NOT_FOUND", `${type} does not exist.`);
        this.checkRevision(request, current.revision);
        const patch = Object.fromEntries(Object.keys((raw.patch as object)).map(k => [k, args.patch[k]]));
        let data = { ...current.data, ...patch, updatedAt: new Date().toISOString() };
        if (type === "style") data = normalizeStyleProfile({ ...data, prompt: (data as StyleProfile).imagePrompt } as StyleProfile);
        return this.store.commitEntityCommand({ type, id: data.id, data, expectedRevision: current.revision, requestId: request.requestId, requestHash: hash }, snapshot => success(request, snapshot));
      }
      case "identity.delete": case "style.delete": case "template.delete": {
        const type = request.command.split(".")[0] as "identity" | "style" | "template";
        const current = this.store.getEntitySnapshot<{ id: string }>(type, args[`${type}Id`]);
        if (!current) throw new DesignError("NOT_FOUND", `${type} does not exist.`);
        this.checkRevision(request, current.revision);
        if (type !== "template" && this.store.listEntities<CharacterProject>("project").some(p => p[type === "identity" ? "identityProfileId" : "styleProfileId"] === current.data.id)) throw new DesignError("REFERENCED", `${type} is still used by a project.`);
        return this.store.commitEntityCommand({ type, id: current.data.id, data: null, expectedRevision: current.revision, requestId: request.requestId, requestHash: hash }, snapshot => success(request, { deleted: true, revision: snapshot.revision }));
      }
      case "template.save": {
        const project = this.project(request).data;
        if (!project.logicalStates.length) throw new DesignError("NOT_READY", "Create states before saving a reusable template.");
        const template = { ...saveProjectAsTemplate(project, args.name, args.description), id: args.id ?? `template-${requestUuid(request.requestId)}` };
        return this.store.commitEntityCommand({ type: "template", id: template.id, data: template, expectedRevision: null, requestId: request.requestId, requestHash: hash }, snapshot => success(request, snapshot));
      }
      case "template.list": return success(request, { saved: this.store.listEntitySnapshots("template"), builtIn: projectTemplates });
      case "package.export": {
        const project = this.project(request).data;
        return success(request, await this.ports.exportPackage(createPortableProjectSource(project, this.generationContext(project))));
      }
      case "package.installation.get": {
        const current = this.project(request);
        return success(request, await this.ports.getPackageInstallation?.(current.data.id, current.revision) ?? {
          available: false,
          linked: false,
          currentRevision: current.revision,
          hasDraftChanges: true,
          exists: false,
          active: false,
        });
      }
      case "package.install": {
        if (!this.ports.installPackage) throw new DesignError("UNAVAILABLE", "Package installation requires the integrated desktop application. Export a package instead.");
        const current = this.project(request, true);
        const project = createPortableProjectSource(current.data, this.generationContext(current.data));
        return this.remember(request, hash, await this.ports.installPackage(project, { projectId: current.data.id, revision: current.revision }));
      }
    }
    throw new DesignError("UNKNOWN_COMMAND", "Unsupported design command.");
  }
}
