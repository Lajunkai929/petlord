import { z } from "zod";
import { artifactSchema, characterProjectSchema, logicalStateSchema, stateVariantSchema, transitionSchema, nativePixelDocumentSchema, nativePixelFrameSchema, type CharacterProject } from "@petlord/schema";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@petlord/generation";
import { buildPetPackage } from "@petlord/state-engine";
import { activateAuthorityReference, createBlankProject } from "./projectTemplate";
import { projectTemplates, type ProjectTemplateDefinition } from "./projectTemplates";
import { approveProjectTransition } from "./transitionApproval";
import { assertProjectReferences, projectReferenceIssues } from "./projectValidation";
import { DesignError } from "./errors";

const id = z.string().trim().min(1).max(240);
const label = z.string().trim().min(1).max(240);
const now = () => new Date().toISOString();
const namedId = (prefix: string, value?: string) => value ?? `${prefix}-${crypto.randomUUID()}`;
const createSchema = z.object({
  id: id.optional(), name: label, characterName: label,
  identityProfileId: id.optional(), styleProfileId: id.optional(),
  identityPrompt: z.string().optional(), stylePrompt: z.string().optional(),
  templateId: id.optional(), generationBudgetCny: z.number().positive().max(5000).optional(),
  productionRoute: characterProjectSchema.shape.productionRoute,
}).strict();

export const createDesignProjectSchema = createSchema;
export function createDesignProject(input: unknown, savedTemplate?: ProjectTemplateDefinition): CharacterProject {
  const args = createSchema.parse(input);
  if (args.templateId) {
    if (!projectTemplates.some(t => t.id === args.templateId) && savedTemplate?.id !== args.templateId) throw new DesignError("NOT_FOUND", "Project template does not exist.");
    const project = createBlankProject({ characterName: args.characterName, projectName: args.name, projectTemplateId: args.templateId, projectTemplate: savedTemplate, identityProfileId: args.identityProfileId, styleProfileId: args.styleProfileId, stylePrompt: args.stylePrompt, generationBudgetCny: args.generationBudgetCny, customerName: "", contact: "", quotedPriceCny: 0, depositCny: 0, revisionLimit: 0, notes: "" });
    return characterProjectSchema.parse({ ...project, id: args.id ?? project.id, identityPrompt: args.identityPrompt ?? project.identityPrompt, productionRoute: args.productionRoute });
  }
  return characterProjectSchema.parse({
    schemaVersion: 1, id: namedId("project", args.id), name: args.name, characterName: args.characterName,
    productionRoute: args.productionRoute,
    identityProfileId: args.identityProfileId, styleProfileId: args.styleProfileId,
    identityPrompt: args.identityPrompt ?? "{{characterName}} 的脸型、体型、毛色和独特标记保持一致。",
    stylePrompt: args.stylePrompt ?? "高质量 2D 桌面宠物，透明背景，完整角色，稳定的造型与光影。",
    generationBudgetCny: args.generationBudgetCny ?? 50,
    generationSettings: { imageModel: DEFAULT_IMAGE_MODEL, imageMode: "native-image", imageResolution: "2K", imageCandidateCount: 1, videoModel: DEFAULT_VIDEO_MODEL, videoResolution: "480p", ratio: "1:1", durationMode: "smart" },
    referenceArtifactIds: [], logicalStates: [], variants: [], transitions: [], artifacts: [], jobs: [], updatedAt: now(),
  });
}

export interface DesignMutationResult { project: CharacterProject; value?: unknown }
interface Mutation { description: string; schema: z.ZodType; execute(project: CharacterProject, input: unknown): DesignMutationResult }
function define<S extends z.ZodType>(description: string, schema: S, run: (project: CharacterProject, input: z.output<S>) => DesignMutationResult): Mutation {
  return { description, schema, execute: (project, input) => {
    const parsed = schema.parse(input);
    // Nested defaults must not turn an omitted top-level patch field into an edit.
    if (input && typeof input === "object" && "patch" in input && parsed && typeof parsed === "object" && "patch" in parsed) {
      const keys = Object.keys(input.patch as object);
      const patch = parsed.patch as Record<string, unknown>;
      parsed.patch = Object.fromEntries(keys.map(key => [key, patch[key]]));
    }
    return run(project, parsed);
  } };
}
function required<T extends { id: string }>(records: T[], recordId: string, kind: string): T {
  const found = records.find(record => record.id === recordId);
  if (!found) throw new DesignError("NOT_FOUND", `${kind} ${recordId} does not exist.`);
  return found;
}
function unique(records: { id: string }[], recordId: string): void {
  if (records.some(record => record.id === recordId)) throw new DesignError("ALREADY_EXISTS", `Identifier ${recordId} already exists.`);
}
function patchRecord<T extends object>(current: T, patch: object, clear: string[], schema: z.ZodType<T>): T {
  const next = { ...current, ...patch } as Record<string, unknown>;
  for (const key of clear) {
    if (["__proto__", "constructor", "prototype", "id", "schemaVersion"].includes(key)) throw new DesignError("INVALID_INPUT", `Cannot clear ${key}.`);
    delete next[key];
  }
  return schema.parse(next);
}
// Validate patches, but retain only fields supplied by the caller. Zod defaults
// belong to complete records and must not reset unrelated fields during an edit.
function patchSchema<S extends z.ZodObject>(schema: S) {
  return schema.partial().strict();
}
const clear = z.array(id).default([]);
const statePatch = patchSchema(logicalStateSchema.omit({ id: true }));
const variantPatch = patchSchema(stateVariantSchema.omit({ id: true }));
const transitionPatch = patchSchema(transitionSchema.omit({ id: true }));
const projectPatch = patchSchema(characterProjectSchema.omit({ id: true, schemaVersion: true, updatedAt: true, logicalStates: true, variants: true, transitions: true, artifacts: true, jobs: true }));

export const designMutations: Record<string, Mutation> = {
  "variant.create": define("Create a state variant using a registered image and explicit approval/origin metadata.", z.object({ variant: stateVariantSchema.strict(), setInitial: z.boolean().optional() }).strict(), (p, a) => {
    unique(p.variants, a.variant.id);
    if (a.setInitial && a.variant.status !== "approved") throw new DesignError("INVALID_INPUT", "Initial variant must be approved.");
    return { project: { ...p, variants: [...p.variants, a.variant], initialVariantId: a.setInitial ? a.variant.id : p.initialVariantId }, value: a.variant };
  }),
  "variant.delete": define("Delete an unreferenced variant. Clear state, transition and initial references explicitly first.", z.object({ variantId: id }).strict(), (p, a) => {
    required(p.variants, a.variantId, "Variant");
    return { project: { ...p, variants: p.variants.filter(v => v.id !== a.variantId) } };
  }),
  "pixel.document.set": define("Validate and replace the editable pixel source in any project. Previously rendered media remains immutable until explicitly rebound.", z.object({ document: nativePixelDocumentSchema }).strict(), (p, a) => ({ project: { ...p, pixelDocument: a.document } })),
  "pixel.frame.upsert": define("Create or replace one complete frame definition, including inherited layers and local patches.", z.object({ frame: nativePixelFrameSchema.strict() }).strict(), (p, a) => {
    if (!p.pixelDocument) throw new DesignError("NOT_FOUND", "Create a pixel document first.");
    const frames = p.pixelDocument.frames.some(f => f.id === a.frame.id) ? p.pixelDocument.frames.map(f => f.id === a.frame.id ? a.frame : f) : [...p.pixelDocument.frames, a.frame];
    return { project: { ...p, pixelDocument: nativePixelDocumentSchema.parse({ ...p.pixelDocument, frames }) } };
  }),
  "pixel.frame.delete": define("Delete a source frame only if remaining frame inheritance stays valid. Existing rendered snapshots remain available.", z.object({ frameId: id }).strict(), (p, a) => {
    if (!p.pixelDocument?.frames.some(f => f.id === a.frameId)) throw new DesignError("NOT_FOUND", "Pixel frame does not exist.");
    return { project: { ...p, pixelDocument: nativePixelDocumentSchema.parse({ ...p.pixelDocument, frames: p.pixelDocument.frames.filter(f => f.id !== a.frameId) }) } };
  }),
  "pixel.palette.update": define("Replace the document palette and validate every inherited frame against it.", z.object({ palette: z.record(z.string().regex(/^[!-~]$/), z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable()) }).strict(), (p, a) => {
    if (!p.pixelDocument) throw new DesignError("NOT_FOUND", "Create a pixel document first.");
    return { project: { ...p, pixelDocument: nativePixelDocumentSchema.parse({ ...p.pixelDocument, palette: a.palette }) } };
  }),
  "project.update": define("Update project identity/style prompts, generation settings, budget, runtime presentation, plugins, interactions or order details.", z.object({ patch: projectPatch, clear }).strict(), (p, a) => ({ project: patchRecord(p, a.patch, a.clear, characterProjectSchema) })),
  "project.replace": define("Replace a complete project snapshot after validating its schema and graph references. Requires its current revision.", z.object({ project: characterProjectSchema }).strict(), (p, a) => {
    if (a.project.id !== p.id) throw new DesignError("INVALID_INPUT", "Replacement project id must not change.");
    return { project: a.project };
  }),
  "state.create": define("Create an unapproved logical state. Generate or import an image, then use state.approve.", z.object({ id: id.optional(), label, semanticKey: id.optional(), description: z.string().default(""), position: z.object({ x: z.number(), y: z.number() }).optional() }).strict(), (p, a) => {
    const stateId = namedId("state", a.id); unique(p.logicalStates, stateId);
    const state = logicalStateSchema.parse({ ...a, id: stateId, position: a.position ?? { x: 80 + (p.logicalStates.length % 4) * 320, y: 80 + Math.floor(p.logicalStates.length / 4) * 240 } });
    return { project: { ...p, logicalStates: [...p.logicalStates, state] }, value: state };
  }),
  "state.update": define("Edit state descriptions, layout, idle scheduling, pointer gaze or selected reference/variant. Only supplied fields change.", z.object({ stateId: id, patch: statePatch, clear }).strict(), (p, a) => {
    const state = patchRecord(required(p.logicalStates, a.stateId, "State"), a.patch, a.clear, logicalStateSchema);
    return { project: { ...p, logicalStates: p.logicalStates.map(s => s.id === state.id ? state : s) }, value: state };
  }),
  "state.approve": define("Select a real image candidate as the state's authority reference and create/reuse its approved runtime variant.", z.object({ stateId: id, artifactId: id, setInitial: z.boolean().optional() }).strict(), (p, a) => {
    required(p.logicalStates, a.stateId, "State");
    const candidate = required(p.artifacts, a.artifactId, "Candidate");
    if (!candidate.mimeType.startsWith("image/") || (candidate.targetStateId && candidate.targetStateId !== a.stateId)) throw new DesignError("INVALID_INPUT", "Candidate image must belong to the selected state.");
    let project = activateAuthorityReference(p, a.stateId, a.artifactId);
    const variant = project.variants.find(v => v.logicalStateId === a.stateId && v.imageArtifactId === a.artifactId && v.origin.kind === "reference" && !v.origin.transitionId)!;
    if (a.setInitial || !p.initialVariantId) project = { ...project, initialVariantId: variant.id };
    return { project, value: variant };
  }),
  "state.delete": define("Delete a logical state. Explicit cascade removes its variants and connected transitions; artifacts remain available.", z.object({ stateId: id, cascade: z.boolean().default(false) }).strict(), (p, a) => {
    required(p.logicalStates, a.stateId, "State");
    const variantIds = new Set(p.variants.filter(v => v.logicalStateId === a.stateId).map(v => v.id));
    const connected = (t: CharacterProject["transitions"][number]) => variantIds.has(t.fromVariantId) || t.fromVariantId === `template-source-${a.stateId}` || t.toLogicalStateId === a.stateId;
    if (!a.cascade && (variantIds.size || p.transitions.some(connected))) throw new DesignError("REFERENCED", "State is referenced by variants/transitions; use cascade to remove them.");
    const variants = p.variants.filter(v => !variantIds.has(v.id));
    return { project: { ...p, logicalStates: p.logicalStates.filter(s => s.id !== a.stateId), variants, transitions: p.transitions.filter(t => !connected(t)), initialVariantId: variantIds.has(p.initialVariantId ?? "") ? variants.find(v => v.status === "approved")?.id : p.initialVariantId } };
  }),
  "variant.update": define("Update a variant's label, approval state or image, or explicitly select it as the initial display.", z.object({ variantId: id, patch: variantPatch, clear, setInitial: z.boolean().optional() }).strict(), (p, a) => {
    const variant = patchRecord(required(p.variants, a.variantId, "Variant"), a.patch, a.clear, stateVariantSchema);
    if (a.setInitial && variant.status !== "approved") throw new DesignError("INVALID_INPUT", "Initial variant must be approved.");
    return { project: { ...p, variants: p.variants.map(v => v.id === variant.id ? variant : v), initialVariantId: a.setInitial ? variant.id : p.initialVariantId }, value: variant };
  }),
  "transition.create": define("Connect an existing source variant to a logical state. Configure prompt, endpoint strategy, triggers and playback with transition.update.", z.object({ id: id.optional(), label, fromVariantId: id, toLogicalStateId: id, prompt: z.string().default(""), endFrameSource: z.enum(["authority-reference", "video-frame", "source-frame"]).default("video-frame"), targetDraftArtifactId: id.optional() }).strict(), (p, a) => {
    const transitionId = namedId("transition", a.id); unique(p.transitions, transitionId);
    const source = required(p.variants, a.fromVariantId, "Source variant");
    required(p.logicalStates, a.toLogicalStateId, "Target state");
    if (a.endFrameSource === "source-frame" && source.logicalStateId !== a.toLogicalStateId) throw new DesignError("INVALID_INPUT", "Source-frame loops must return to their source logical state.");
    const transition = transitionSchema.parse({ ...a, id: transitionId, status: "draft" });
    return { project: { ...p, transitions: [...p.transitions, transition] }, value: transition };
  }),
  "transition.update": define("Edit all transition settings including prompts, duration, media selection, tail frame, trigger regions, playback and transparency.", z.object({ transitionId: id, patch: transitionPatch, clear }).strict(), (p, a) => {
    const transition = patchRecord(required(p.transitions, a.transitionId, "Transition"), a.patch, a.clear, transitionSchema);
    return { project: { ...p, transitions: p.transitions.map(t => t.id === transition.id ? transition : t) }, value: transition };
  }),
  "transition.approve": define("Approve a transition with actual media, resolving its selected endpoint into a runtime variant.", z.object({ transitionId: id }).strict(), (p, a) => {
    const transition = required(p.transitions, a.transitionId, "Transition");
    const media = p.artifacts.find(asset => asset.id === transition.videoArtifactId);
    if (!transition.nativeAnimation && (!media || !media.mimeType.startsWith("video/"))) throw new DesignError("MISSING_MEDIA", "Transition requires video media or a native frame sequence before approval.");
    const approval = approveProjectTransition(p, a.transitionId);
    if (transition.nativeAnimation) buildPetPackage({ ...approval.project, transitions: approval.project.transitions.filter(t => t.id === transition.id) });
    return { project: approval.project, value: { variantId: approval.variantId, createdVariant: approval.createdVariant } };
  }),
  "transition.delete": define("Remove a transition while retaining generated media and existing endpoint variants.", z.object({ transitionId: id }).strict(), (p, a) => {
    required(p.transitions, a.transitionId, "Transition");
    return { project: { ...p, transitions: p.transitions.filter(t => t.id !== a.transitionId) } };
  }),
  "artifact.register": define("Register an imported or generated media artifact. Use media.import to store local bytes first.", z.object({ artifact: artifactSchema.strict() }).strict(), (p, a) => {
    unique(p.artifacts, a.artifact.id);
    return { project: { ...p, artifacts: [...p.artifacts, a.artifact] }, value: a.artifact };
  }),
  "artifact.update": define("Update artifact labels and metadata; referenced images and videos remain schema-checked.", z.object({ artifactId: id, patch: patchSchema(artifactSchema.omit({ id: true })), clear }).strict(), (p, a) => {
    const artifact = patchRecord(required(p.artifacts, a.artifactId, "Artifact"), a.patch, a.clear, artifactSchema);
    return { project: { ...p, artifacts: p.artifacts.map(v => v.id === artifact.id ? artifact : v) }, value: artifact };
  }),
  "artifact.delete": define("Remove an unreferenced artifact. Refuse removal when project/state/transition references would break.", z.object({ artifactId: id }).strict(), (p, a) => {
    required(p.artifacts, a.artifactId, "Artifact");
    return { project: { ...p, artifacts: p.artifacts.filter(v => v.id !== a.artifactId) } };
  }),
};

export function applyDesignMutation(project: CharacterProject, command: string, input: unknown): DesignMutationResult {
  const operation = designMutations[command];
  if (!operation) throw new DesignError("UNKNOWN_COMMAND", `Unknown design mutation ${command}.`);
  const result = operation.execute(project, input);
  result.project = characterProjectSchema.parse({ ...result.project, updatedAt: now() });
  assertProjectReferences(result.project);
  return result;
}

export function describeDesignMutations() {
  return Object.entries(designMutations).map(([name, operation]) => ({ name, description: operation.description, mutating: true, requiresProject: true, requiresRevision: true, inputSchema: z.toJSONSchema(operation.schema, { io: "input" }) }));
}

export function inspectDesignProject(project: CharacterProject) {
  const issues = projectReferenceIssues(project);
  for (const transition of project.transitions) if (transition.status !== "approved") issues.push({ code: "NOT_APPROVED", path: `transitions.${transition.id}`, message: "Approve or remove this transition before exporting." });
  let exportable = false;
  try { buildPetPackage(project); exportable = issues.length === 0; }
  catch (error) { issues.push({ code: "NOT_EXPORTABLE", path: "project", message: error instanceof Error ? error.message : "Project is not ready for export." }); }
  return {
    id: project.id, name: project.name, characterName: project.characterName, updatedAt: project.updatedAt,
    counts: { states: project.logicalStates.length, variants: project.variants.length, transitions: project.transitions.length, artifacts: project.artifacts.length },
    exportable, issues,
    states: project.logicalStates.map(s => ({ id: s.id, label: s.label, referenceArtifactId: s.referenceArtifactId, defaultVariantId: s.defaultVariantId, candidateIds: project.artifacts.filter(a => a.targetStateId === s.id && a.kind === "state-draft").map(a => a.id) })),
    transitions: project.transitions.map(t => ({ id: t.id, label: t.label, status: t.status, fromVariantId: t.fromVariantId, toLogicalStateId: t.toLogicalStateId, toVariantId: t.toVariantId, videoArtifactId: t.videoArtifactId, tailArtifactId: t.extractedTailArtifactId })),
    jobs: project.jobs.map(j => ({ id: j.id, status: j.status, progress: j.progress, error: j.error, cost: j.cost, outputArtifactIds: j.outputArtifactIds })),
  };
}
