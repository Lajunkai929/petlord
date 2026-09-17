import { z } from "zod";
import { artifactKindSchema, generationSettingsSchema, identityProfileSchema, nativePixelDocumentSchema, transitionPlaybackSchema } from "@petlord/schema";
import { createDesignProjectSchema, describeDesignMutations } from "@petlord/design-core";
import { createProviderSchema, updateProviderSchema } from "./providers/registry";

const id = z.string().trim().min(1).max(240);
const empty = z.object({}).strict();
const settings = z.object(generationSettingsSchema.shape).partial().strict();
export const designRequestSchema = z.object({ requestId: id, command: id, projectId: id.optional(), expectedRevision: z.number().int().nonnegative().optional(), responseMode: z.enum(["full", "summary"]).optional(), input: z.unknown().default({}) }).strict();
export type DesignRequest = z.infer<typeof designRequestSchema>;

export interface DesignCommandDefinition { description: string; schema: z.ZodType; mutating: boolean; requiresProject?: boolean; requiresRevision?: boolean }
function command(description: string, schema: z.ZodType, flags: Partial<DesignCommandDefinition> = {}): DesignCommandDefinition { return { description, schema, mutating: false, ...flags }; }
const project = { requiresProject: true };
const edit = { requiresProject: true, requiresRevision: true, mutating: true };
const styleInput = z.object({ name: id, description: z.string().max(4000).default(""), imagePrompt: z.string().min(1), videoPrompt: z.string().min(1), experimentBudgetCny: z.number().positive().max(5000).default(30) }).strict();
export const mediaProcessSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("extract-frame"), videoArtifactId: id, timeMs: z.number().int().nonnegative() }).strict(),
  z.object({ operation: z.literal("ping-pong"), videoArtifactId: id, segmentStartMs: z.number().int().nonnegative(), segmentEndMs: z.number().int().positive() }).strict(),
  z.object({ operation: z.literal("transparentize"), videoArtifactId: id, tailArtifactId: id, resolution: z.enum(["480p", "720p", "1080p"]), keyColor: z.string().regex(/^#[0-9a-fA-F]{6}$/), similarity: z.number().min(.05).max(.7) }).strict(),
]);
export const serviceCommands: Record<string, DesignCommandDefinition> = {
  "package.syncInstalled": command("Import installed runtime pets into the local design workspace. Existing design edits are preserved; old bundles without source are reconstructed and labeled.",empty,{mutating:true}),
  "pixel.example.get": command("Get the original Lottery example as editable pixel data, state bindings and explicit animation timelines.", empty),
  "pixel.example.create": command("Create an editable, playable Lottery sample project with original native pixel states and animations. Runs offline with no generation charge.", z.object({ id: id.optional(), name: id.default("彩票 · 原生像素试作") }).strict(), { mutating: true }),
  "media.process": command("Run local frame extraction, forward/reverse clip rendering or background removal and register immutable outputs. Select returned artifact ids with transition.update; no provider charge.", mediaProcessSchema, edit),
  "state.gaze.generate": command("Generate a six-second pointer-gaze atlas from the state's selected approved image and gaze settings. Updates pointerGaze candidates in the backend.", z.object({ stateId: id, prompt: z.string().optional(), settings: settings.optional() }).strict(), edit),
  "identity.delete": command("Delete an identity that is not referenced by any project.", z.object({ identityId: id }).strict(), { mutating: true, requiresRevision: true }),
  "style.create": command("Create a reusable style with distinct image/video prompts.", styleInput.extend({ id: id.optional() }), { mutating: true }),
  "style.update": command("Update a saved style at its current revision; the human style library receives the same update.", z.object({ styleId: id, patch: styleInput.partial().strict() }).strict(), { mutating: true, requiresRevision: true }),
  "style.delete": command("Delete a saved style that is not referenced by any project.", z.object({ styleId: id }).strict(), { mutating: true, requiresRevision: true }),
  "template.save": command("Save this project's reusable state, behavior and transition definitions as a template; media is excluded. Use its id with project.create.", z.object({ id: id.optional(), name: id, description: z.string().default("") }).strict(), { ...project, mutating: true }),
  "template.update": command("Rename a saved template or change its description at its current revision.", z.object({ templateId: id, patch: z.object({ name: id.optional(), description: z.string().optional() }).strict() }).strict(), { mutating: true, requiresRevision: true }),
  "template.delete": command("Remove a saved template. Existing projects keep their copied definitions.", z.object({ templateId: id }).strict(), { mutating: true, requiresRevision: true }),
  "pixel.document.get": command("Read the editable pixel document and its revision.", empty, project),
  "pixel.document.save": command("Save native artwork and atomically refresh existing state/variant/animation bindings to new immutable PNGs. Preserves history, approval states and playback settings; rejects removed bound frames.", z.object({ document: nativePixelDocumentSchema }).strict(), edit),
  "pixel.validate": command("Return per-frame diagnostics without saving. Omit document to validate the current project source.", z.object({ document: z.unknown().optional() }).strict(), project),
  "pixel.render": command("Render selected or all source frames to immutable lossless PNG artifacts; returns value.frames with preview URIs.", z.object({ frameIds: z.array(id).min(1).max(256).optional() }).strict(), edit),
  "pixel.state.bind": command("Render a frame and approve it as a logical state's exact native authority image.", z.object({ stateId: id, frameId: id, setInitial: z.boolean().optional() }).strict(), edit),
  "pixel.animation.bind": command("Render and bind an explicit native sequence and repeat settings atomically. Endpoints must match the source variant and target state authority frame. No interpolation is added.", z.object({ transitionId: id, frames: z.array(z.object({ frameId: id, durationMs: z.number().int().min(1).max(60_000) }).strict()).min(1).max(256), playback: z.object(transitionPlaybackSchema.shape).pick({ repeatMode: true, minCycles: true, maxCycles: true }).strict().optional(), approve: z.boolean().default(false) }).strict(), edit),
  "pixel.feedback": command("Render a nearest-neighbor contact sheet plus frame bounds, opaque-pixel counts and differences from each previous frame. Does not change project revision.", z.object({ frameIds: z.array(id).min(1).max(256).optional(), columns: z.number().int().min(1).max(16).default(6), scale: z.number().int().min(1).max(12).default(4) }).strict(), project),
  "project.list": command("List project summaries and revisions without returning large artwork payloads.", empty),
  "project.create": command("Create an empty project or a built-in template. Identity is optional; every project supports pixel drawing, media import and generation. productionRoute is an optional legacy hint, never a tool availability switch.", createDesignProjectSchema, { mutating: true }),
  "project.get": command("Read the complete project and its current revision before editing.", empty, project),
  "project.inspect": command("Inspect graph readiness, candidates, jobs and actionable export issues.", empty, project),
  "project.delete": command("Remove the project at the expected revision. Generated files remain in the media library.", empty, edit),
  "state.get": command("Read a logical state and its variants.", z.object({ stateId: id }).strict(), project),
  "state.candidates": command("List candidate artifact metadata and preview URIs for one state.", z.object({ stateId: id }).strict(), project),
  "state.generate": command("Submit state image generation using the project's identity, style, references and provider. Returns a persistent job id.", z.object({ stateId: id, prompt: z.string().optional(), settings: settings.optional() }).strict(), edit),
  "transition.get": command("Read all transition parameters, selected media and previous generated versions.", z.object({ transitionId: id }).strict(), project),
  "transition.generate": command("Generate a transition from the exact selected source and target references; inspect the returned job before approval.", z.object({ transitionId: id, prompt: z.string().optional(), settings: settings.optional() }).strict(), edit),
  "artifact.get": command("Get media metadata and an authenticated preview URI for inspection/download.", z.object({ artifactId: id }).strict(), project),
  "media.import": command("Store PNG/JPEG/WebP/MP4/WebM bytes as a data URL. With a project and stateId, register an image candidate; with identity-reference kind, add an identity reference.", z.object({ dataUrl: z.string().min(32), stateId: id.optional(), kind: artifactKindSchema.optional(), label: z.string().max(240).optional() }).strict(), { mutating: true }),
  "media.list": command("List persisted local media metadata.", empty),
  "provider.list": command("List available models, provider capabilities and configuration status; never returns API keys.", empty),
  "provider.create": command("Configure a generation provider with an explicitly supplied credential.", createProviderSchema.strict(), { mutating: true }),
  "provider.update": command("Change provider configuration without exposing its stored credential.", z.object({ providerId: id, patch: updateProviderSchema.strict() }).strict(), { mutating: true }),
  "provider.test": command("Test connectivity to a configured provider without generating media.", z.object({ providerId: id }).strict()),
  "provider.delete": command("Delete a provider only when it has no active jobs.", z.object({ providerId: id }).strict(), { mutating: true }),
  "job.list": command("List persistent generation jobs, optionally restricted to a project.", empty),
  "job.get": command("Read progress, outputs, costs and errors for a persistent job.", z.object({ jobId: id }).strict()),
  "job.retry": command("Retry a failed job using its persisted provider state. Reuses the remote task where available.", z.object({ jobId: id }).strict(), { mutating: true }),
  "identity.list": command("List reusable identity profiles and their workspace revisions.", empty),
  "identity.create": command("Create a reusable identity from a name, prompt and imported reference artifacts.", z.object({ id: id.optional(), name: id, identityPrompt: z.string().default("{{characterName}} 的身份与独特标记保持一致。"), referenceArtifacts: identityProfileSchema.shape.referenceArtifacts.default([]) }).strict(), { mutating: true }),
  "identity.update": command("Update identity content at expectedRevision; future generations read the shared profile.", z.object({ identityId: id, patch: identityProfileSchema.omit({ id: true, schemaVersion: true, createdAt: true, updatedAt: true }).partial().strict() }).strict(), { mutating: true, requiresRevision: true }),
  "style.list": command("List reusable image/video style definitions and their workspace revisions.", empty),
  "template.list": command("List built-in and saved project templates with their state/transition definitions.", empty),
  "package.export": command("Validate and export a complete portable pet package. All authored transitions must be approved.", empty, project),
  "package.installation.get": command("Read this project's local installed-pet binding, applied revision, draft status and active state.", empty, project),
  "package.install": command("Export and activate this pet in the integrated desktop runtime. Requires a running desktop host.", empty, edit),
};

export function designCatalog() {
  return {
    protocolVersion: 1,
    executePath: "/api/design/v1/execute",
    requestSchema: z.toJSONSchema(designRequestSchema, { io: "input" }),
    commands: [
      ...describeDesignMutations(),
      ...Object.entries(serviceCommands).map(([name, definition]) => ({ name, description: definition.description, mutating: definition.mutating, requiresProject: definition.requiresProject ?? false, requiresRevision: definition.requiresRevision ?? false, inputSchema: z.toJSONSchema(definition.schema, { io: "input" }) })),
    ],
  };
}
