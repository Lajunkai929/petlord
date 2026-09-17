export * from "./nativePixel";
import { nativePixelDocumentSchema } from "./nativePixel";
import { z } from "zod";

export const artifactKindSchema = z.enum([
  "identity-reference",
  "state-draft",
  "state-actual",
  "transition-video",
  "thumbnail",
]);

export const nativePixelDimensionsSchema = z.object({ width: z.number().int().min(1).max(256), height: z.number().int().min(1).max(256) });
export const nativePixelArtifactSchema = nativePixelDimensionsSchema.extend({ frameId: z.string().min(1) });
export const nativeAnimationSchema = z.object({ frames: z.array(z.object({ imageArtifactId: z.string().min(1), durationMs: z.number().int().min(1).max(60_000) })).min(1).max(256) });
export const runtimeNativeAnimationSchema = z.object({ frames: z.array(z.object({ imageUri: z.string().min(1), durationMs: z.number().int().min(1).max(60_000) })).min(1).max(256) });

export const artifactSchema = z.object({
  nativePixel: nativePixelArtifactSchema.optional(),
  id: z.string().min(1),
  kind: artifactKindSchema,
  uri: z.string().min(1),
  mimeType: z.string().min(1),
  createdAt: z.string().datetime(),
  sourceJobId: z.string().optional(),
  provenance: z.enum(["user-upload", "generated", "seed-generated"]).optional(),
  targetStateId: z.string().optional(),
  candidateGroupId: z.string().optional(),
  candidateIndex: z.number().int().nonnegative().optional(),
  pixelWidth: z.number().int().positive().optional(),
  pixelHeight: z.number().int().positive().optional(),
  silent: z.boolean().optional(),
  hasAlpha: z.boolean().optional(),
  transparencyMethod: z.enum(["apple-vision-foreground-mask", "adaptive-color-matte"]).optional(),
  alphaCoverage: z.object({
    transparentRatio: z.number().min(0).max(1),
    opaqueRatio: z.number().min(0).max(1),
  }).optional(),
  label: z.string().optional(),
});

export const idleSchedulerSchema = z.object({
  enabled: z.boolean().default(false),
  playbackMode: z.enum(["interval", "continuous"]).optional(),
  strategy: z.enum(["weighted-random", "weighted-round-robin"]).default("weighted-random"),
  minIntervalMs: z.number().int().min(1000).max(3_600_000).default(8000),
  maxIntervalMs: z.number().int().min(1000).max(3_600_000).default(18_000),
  avoidImmediateRepeat: z.boolean().default(true),
}).superRefine((scheduler, context) => {
  if (scheduler.maxIntervalMs < scheduler.minIntervalMs) {
    context.addIssue({ code: "custom", path: ["maxIntervalMs"], message: "Maximum idle interval must be at least the minimum." });
  }
});

export const defaultPointerGazeDirectionKeyframesMs: [number, number, number, number, number, number, number, number] = [
  600, 1200, 1800, 2400, 3000, 3600, 4200, 4800,
];

export const defaultPointerGazeAnchor = { x: 0.5, y: 0.5 };

const pointerGazeAnchorSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

/** Left, upper-left, up, upper-right, right, lower-right, down, lower-left. */
const nativeGazeImagesSchema = z.tuple([
  z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1),
  z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1),
]);

export const pointerGazeSchema = z.object({
  enabled: z.boolean(),
  motionTarget: z.enum(["eyes", "head"]),
  activationRadius: z.number().min(0.6).max(3).default(1.4),
  anchor: pointerGazeAnchorSchema.default(defaultPointerGazeAnchor),
  videoArtifactId: z.string().min(1).optional(),
  videoArtifactIds: z.array(z.string().min(1)).default([]),
  nativeImageArtifactIds: nativeGazeImagesSchema.optional(),
  durationMs: z.number().int().positive().optional(),
  segmentStartMs: z.number().int().nonnegative().default(0),
  segmentEndMs: z.number().int().positive().optional(),
  directionKeyframesMs: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]).default(defaultPointerGazeDirectionKeyframesMs),
  blendDurationMs: z.number().int().min(0).max(1000).default(240),
}).superRefine((gaze, context) => {
  if (gaze.segmentEndMs !== undefined && gaze.segmentEndMs <= gaze.segmentStartMs) {
    context.addIssue({ code: "custom", path: ["segmentEndMs"], message: "Gaze segment end must be after its start." });
  }
});

export const runtimePointerGazeSchema = z.object({
  enabled: z.boolean(),
  motionTarget: z.enum(["eyes", "head"]),
  activationRadius: z.number().min(0.6).max(3),
  anchor: pointerGazeAnchorSchema.default(defaultPointerGazeAnchor),
  videoUri: z.string().min(1).optional(),
  nativeImageUris: nativeGazeImagesSchema.optional(),
  durationMs: z.number().int().positive().optional(),
  segmentStartMs: z.number().int().nonnegative().default(0),
  segmentEndMs: z.number().int().positive().optional(),
  directionKeyframesMs: z.tuple([
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
  ]).default(defaultPointerGazeDirectionKeyframesMs),
  blendDurationMs: z.number().int().min(0).max(1000).default(240),
});

export const dragInteractionSchema = z.object({
  enabled: z.boolean(),
  targetLogicalStateId: z.string().min(1),
  targetVariantId: z.string().min(1).optional(),
  anchor: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
  }),
  alignmentDurationMs: z.number().int().min(80).max(1000).default(600),
  returnDurationMs: z.number().int().min(80).max(1500).default(500),
});

export const runtimeDragInteractionSchema = dragInteractionSchema.extend({
  targetStateId: z.string().min(1),
}).omit({ targetLogicalStateId: true, targetVariantId: true });

export const logicalStateSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  semanticKey: z.string().min(1).optional(),
  semanticAliases: z.array(z.string().min(1)).optional(),
  description: z.string().default(""),
  position: z.object({ x: z.number(), y: z.number() }),
  defaultVariantId: z.string().optional(),
  preferredOutboundVariantId: z.string().optional(),
  referenceArtifactId: z.string().optional(),
  referenceArtifactIds: z.array(z.string()).default([]),
  idleScheduler: idleSchedulerSchema.default({
    enabled: false,
    strategy: "weighted-random",
    minIntervalMs: 8000,
    maxIntervalMs: 18_000,
    avoidImmediateRepeat: true,
  }),
  pointerGaze: pointerGazeSchema.optional(),
});

export const generationSettingsSchema = z
  .object({
    imageProviderId: z.string().uuid().optional(),
    imageModel: z.string().min(1),
    imageMode: z.literal("native-image"),
    videoProviderId: z.string().uuid().optional(),
    videoModel: z.string().min(1),
    imageResolution: z.enum(["1K", "2K"]),
    imageCandidateCount: z.number().int().min(1).max(5).default(3),
    videoResolution: z.enum(["480p", "720p", "1080p"]),
    ratio: z.literal("1:1"),
    durationMode: z.enum(["smart", "fixed"]),
    durationSeconds: z.number().int().min(2).max(15).optional(),
  })
  .superRefine((settings, context) => {
    if (settings.durationMode === "fixed" && !settings.durationSeconds) {
      context.addIssue({
        code: "custom",
        path: ["durationSeconds"],
        message: "Fixed duration requires a value between 2 and 15 seconds.",
      });
    }
  });

export const runtimePresentationSettingsSchema = z.object({
  defaultFrameRate: z.union([z.literal(12), z.literal(18), z.literal(24), z.literal(30), z.literal(60)]).default(24),
  defaultRenderResolution: z.union([
    z.literal(64),
    z.literal(80),
    z.literal(96),
    z.literal(128),
    z.literal(160),
    z.literal(256),
    z.literal(384),
    z.literal(480),
    z.literal(720),
    z.literal(1024),
  ]).default(480),
  defaultPixelGridSize: z.union([
    z.literal(24),
    z.literal(32),
    z.literal(40),
    z.literal(48),
    z.literal(64),
    z.literal(80),
    z.literal(96),
  ]).optional(),
  defaultDisplaySize: z.union([
    z.literal(160),
    z.literal(192),
    z.literal(200),
    z.literal(240),
    z.literal(256),
    z.literal(280),
    z.literal(288),
    z.literal(320),
    z.literal(384),
    z.literal(400),
    z.literal(480),
  ]).optional(),
  pixelated: z.boolean().default(false),
});

export const videoBackgroundSettingsSchema = z.object({
  mode: z.enum(["auto", "manual"]).default("auto"),
  autoColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#00FF00"),
  manualColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#FFFFFF"),
  analyzedAt: z.string().datetime().optional(),
});

export const orderCostEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  category: z.enum(["labor", "tool", "delivery", "other"]).default("other"),
  amountCny: z.number().nonnegative(),
  createdAt: z.string().datetime(),
  note: z.string().default(""),
});

export const deliveryChecklistSchema = z.object({
  customerApproved: z.boolean().default(false),
  desktopTested: z.boolean().default(false),
  packageDelivered: z.boolean().default(false),
  packageExportedAt: z.string().datetime().optional(),
});

export const customerReviewItemSchema = z.object({
  id: z.string().min(1),
  entityType: z.enum(["state", "transition"]),
  entityId: z.string().min(1),
  label: z.string().min(1),
  mediaKind: z.enum(["image", "video"]),
  mediaArtifactId: z.string().min(1),
  decision: z.enum(["pending", "approved", "changes"]).default("pending"),
  comment: z.string().default(""),
});

export const customerReviewRoundSchema = z.object({
  id: z.string().min(1),
  sequence: z.number().int().positive(),
  createdAt: z.string().datetime(),
  exportedAt: z.string().datetime().optional(),
  respondedAt: z.string().datetime().optional(),
  status: z.enum(["draft", "exported", "responded"]).default("draft"),
  items: z.array(customerReviewItemSchema).min(1),
});

export const customerReviewResponseSchema = z.object({
  format: z.literal("petlord-review-response"),
  version: z.literal(1),
  projectId: z.string().min(1),
  roundId: z.string().min(1),
  customerName: z.string().default(""),
  respondedAt: z.string().datetime(),
  items: z.array(z.object({
    id: z.string().min(1),
    decision: z.enum(["approved", "changes"]),
    comment: z.string().default(""),
  })).min(1),
});

export const customerOrderSchema = z.object({
  orderNumber: z.string().min(1),
  customerName: z.string().default(""),
  contact: z.string().default(""),
  channel: z.enum(["xianyu", "private", "other"]).default("xianyu"),
  status: z.enum(["inquiry", "assets", "creating", "review", "revision", "ready", "delivered", "closed"]).default("inquiry"),
  quotedPriceCny: z.number().nonnegative().default(0),
  depositCny: z.number().nonnegative().default(0),
  finalPaymentCny: z.number().nonnegative().default(0),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  revisionLimit: z.number().int().min(0).max(99).default(2),
  revisionUsed: z.number().int().min(0).max(99).default(0),
  notes: z.string().default(""),
  serviceTemplateId: z.string().default("standard"),
  manualCosts: z.array(orderCostEntrySchema).default([]),
  deliveryChecklist: deliveryChecklistSchema.default({
    customerApproved: false,
    desktopTested: false,
    packageDelivered: false,
  }),
  reviewRounds: z.array(customerReviewRoundSchema).default([]),
});

export const stateVariantSchema = z.object({
  id: z.string().min(1),
  logicalStateId: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(["draft", "approved"]),
  imageArtifactId: z.string().min(1),
  origin: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("initial") }),
    z.object({
      kind: z.literal("transition-tail"),
      transitionId: z.string().min(1),
    }),
    z.object({
      kind: z.literal("reference"),
      transitionId: z.string().min(1).optional(),
    }),
  ]),
});

export const transitionStatusSchema = z.enum([
  "draft",
  "target-ready",
  "generating",
  "review",
  "approved",
  "failed",
]);

export const interactionRegionSchema = z.object({
  shape: z.enum(["rectangle", "ellipse"]).default("rectangle"),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
}).superRefine((region, context) => {
  if (region.x + region.width > 1 || region.y + region.height > 1) {
    context.addIssue({ code: "custom", message: "Interaction region must stay inside the pet canvas." });
  }
});

export const transitionTriggerSchema = z.object({
  id: z.string().min(1),
  event: z.enum(["hover", "pointer-leave", "left-click", "right-click", "double-click", "inactivity", "state-timeout"]),
  enabled: z.boolean().default(true),
  hoverDurationMs: z.number().int().min(100).max(30_000).optional(),
  repeatWhileHovered: z.boolean().optional(),
  timerDurationMs: z.number().int().min(1_000).max(86_400_000).optional(),
  region: interactionRegionSchema.optional(),
}).superRefine((trigger, context) => {
  if (trigger.event === "hover" && trigger.hoverDurationMs === undefined) {
    context.addIssue({ code: "custom", path: ["hoverDurationMs"], message: "Hover trigger requires a duration." });
  }
  if ((trigger.event === "inactivity" || trigger.event === "state-timeout") && trigger.timerDurationMs === undefined) {
    context.addIssue({ code: "custom", path: ["timerDurationMs"], message: "Timer trigger requires a duration." });
  }
  if (trigger.repeatWhileHovered && trigger.event !== "hover") {
    context.addIssue({ code: "custom", path: ["repeatWhileHovered"], message: "Repeat-while-hovered is only valid for hover triggers." });
  }
});

export const authorityBridgeSchema = z.object({
  mode: z.enum(["crossfade", "blur-dissolve", "hard-cut"]).default("crossfade"),
  durationMs: z.number().int().min(120).max(1500).default(700),
});

export const transparencyProcessingSchema = z.object({
  keyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#00FF00"),
  similarity: z.number().min(0.05).max(0.7).default(0.34),
});

export const idleTransitionRuleSchema = z.object({
  enabled: z.boolean().default(true),
  weight: z.number().int().min(1).max(100).default(1),
  cooldownMs: z.number().int().min(0).max(3_600_000).default(0),
});

export const defaultTransitionPlayback = {
  mode: "forward",
  repeatMode: "fixed",
  minCycles: 1,
  maxCycles: 1,
  segmentStartMs: 0,
} as const;

export const transitionPlaybackSchema = z.object({
  mode: z.enum(["forward", "ping-pong"]).default("forward"),
  repeatMode: z.enum(["fixed", "random"]).default("fixed"),
  minCycles: z.number().int().min(1).max(12).default(1),
  maxCycles: z.number().int().min(1).max(12).default(1),
  segmentStartMs: z.number().int().nonnegative().default(0),
  segmentEndMs: z.number().int().positive().optional(),
}).superRefine((playback, context) => {
  if (playback.maxCycles < playback.minCycles) {
    context.addIssue({ code: "custom", path: ["maxCycles"], message: "Maximum cycles must be at least the minimum cycles." });
  }
  if (playback.segmentEndMs !== undefined && playback.segmentEndMs <= playback.segmentStartMs) {
    context.addIssue({ code: "custom", path: ["segmentEndMs"], message: "Playback segment end must be after its start." });
  }
});

export const transitionMediaVersionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  videoArtifactId: z.string().min(1),
  tailArtifactId: z.string().min(1),
  createdAt: z.string().datetime(),
  sourceJobId: z.string().optional(),
  transparent: z.boolean(),
  durationMs: z.number().int().positive(),
  selectedEndMs: z.number().int().nonnegative().optional(),
  generationPrompt: z.string().optional(),
  generationModel: z.string().optional(),
  chromaKeyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sourceVideoArtifactId: z.string().optional(),
  playback: transitionPlaybackSchema.optional(),
});

export const transitionSchema = z.object({
  nativeAnimation: nativeAnimationSchema.optional(),
  id: z.string().min(1),
  label: z.string().min(1),
  fromVariantId: z.string().min(1),
  toLogicalStateId: z.string().min(1),
  toVariantId: z.string().optional(),
  targetDraftArtifactId: z.string().optional(),
  guidanceArtifactIds: z.array(z.string()).optional(),
  videoArtifactId: z.string().optional(),
  extractedTailArtifactId: z.string().optional(),
  mediaVersions: z.array(transitionMediaVersionSchema).default([]),
  activeMediaVersionId: z.string().optional(),
  endFrameSource: z.enum(["authority-reference", "video-frame", "source-frame"]).default("video-frame"),
  selectedEndMs: z.number().int().nonnegative().optional(),
  sourceVideoDurationMs: z.number().int().positive().optional(),
  triggers: z.array(transitionTriggerSchema).default([]),
  status: transitionStatusSchema,
  prompt: z.string().default(""),
  durationMs: z.number().int().positive().default(2400),
  entryBlendMs: z.number().int().min(0).max(1000).optional(),
  durationMode: z.enum(["smart", "fixed"]).default("smart"),
  durationSeconds: z.number().int().min(2).max(15).optional(),
  transparentVideo: z.boolean().default(true),
  transparencyProcessing: transparencyProcessingSchema.default({ keyColor: "#00FF00", similarity: 0.34 }),
  authorityBridge: authorityBridgeSchema.default({ mode: "crossfade", durationMs: 700 }),
  idleRule: idleTransitionRuleSchema.optional(),
  playback: transitionPlaybackSchema.optional(),
  lastGenerationPrompt: z.string().optional(),
  lastGenerationModel: z.string().optional(),
  lastChromaKeyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export const generationJobSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["identity", "state-draft", "transition", "tail-extraction"]),
  status: z.enum(["queued", "running", "succeeded", "failed"]),
  progress: z.number().min(0).max(100),
  prompt: z.string(),
  provider: z.string(),
  model: z.string(),
  createdAt: z.string().datetime(),
  outputArtifactIds: z.array(z.string()),
  error: z.string().optional(),
  assembledPrompt: z.string().optional(),
  chromaKeyColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  cost: z.object({
    status: z.enum(["estimated", "settled"]).default("estimated"),
    source: z.enum(["estimate", "provider-usage", "unit-output", "duration-reconciled"]).default("estimate"),
    estimatedMinCny: z.number().nonnegative(),
    estimatedMaxCny: z.number().nonnegative(),
    actualCny: z.number().nonnegative().optional(),
    priorAttemptsReservedCny: z.number().nonnegative().optional(),
    basis: z.string().min(1),
  }).optional(),
});

export const pluginPermissionSchema = z.enum([
  "pet:read",
  "pet:control",
  "storage",
  "ui:panel",
  "ui:context-menu",
  "notifications",
  "background:events",
  "integration:claude:events",
  "integration:claude:open-session",
  "integration:codex:events",
  "integration:codex:open-session",
]);

export const agentEventSourceSchema = z.enum(["claude", "codex"]);
export const agentEventTypeSchema = z.enum([
  "session-started",
  "working",
  "needs-attention",
  "turn-completed",
  "task-completed",
  "failed",
  "session-ended",
]);
export const agentEventSeveritySchema = z.enum(["info", "success", "warning", "error"]);
export const agentEventSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1).max(240),
  source: agentEventSourceSchema,
  type: agentEventTypeSchema,
  severity: agentEventSeveritySchema,
  sessionId: z.string().min(1).max(240),
  occurredAt: z.string().datetime(),
  receivedAt: z.string().datetime(),
  dedupeKey: z.string().min(1).max(500),
  title: z.string().min(1).max(240),
  summary: z.string().max(4000).optional(),
  cwd: z.string().max(4096).optional(),
  acknowledgedAt: z.string().datetime().optional(),
  openedAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export const pluginDeclarationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  entry: z.string().min(1),
  permissions: z.array(pluginPermissionSchema),
});

export const identityProfileSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  identityPrompt: z.string(),
  referenceArtifacts: z.array(artifactSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const characterProjectSchema = z.object({
  importedPackage: z.object({ fingerprint: z.string(), fileName: z.string(), source: z.enum(["runtime-reconstructed", "editable-source"]), warnings: z.array(z.string()) }).optional(),
  productionRoute: z.enum(["generated", "native-pixel"]).optional().describe("Legacy source hint retained for compatibility. It does not restrict tools or media availability; native pixel metadata belongs to individual assets."),
  pixelDocument: nativePixelDocumentSchema.optional(),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string().min(1),
  characterName: z.string().min(1),
  identityProfileId: z.string().min(1).optional(),
  styleProfileId: z.string().min(1).optional(),
  stylePrompt: z.string(),
  imageStylePrompt: z.string().optional(),
  videoStylePrompt: z.string().optional(),
  identityPrompt: z.string(),
  generationBudgetCny: z.number().positive().max(5000).default(50),
  generationSettings: generationSettingsSchema,
  runtimePresentation: runtimePresentationSettingsSchema.optional(),
  videoBackground: videoBackgroundSettingsSchema.default({
    mode: "auto",
    autoColor: "#00FF00",
    manualColor: "#FFFFFF",
  }),
  dragInteraction: dragInteractionSchema.optional(),
  order: customerOrderSchema.default({
    orderNumber: "LEGACY-PROJECT",
    customerName: "",
    contact: "",
    channel: "xianyu",
    status: "creating",
    quotedPriceCny: 0,
    depositCny: 0,
    finalPaymentCny: 0,
    revisionLimit: 2,
    revisionUsed: 0,
    notes: "",
    serviceTemplateId: "standard",
    manualCosts: [],
    deliveryChecklist: {
      customerApproved: false,
      desktopTested: false,
      packageDelivered: false,
    },
    reviewRounds: [],
  }),
  referenceArtifactIds: z.array(z.string()),
  initialVariantId: z.string().min(1).optional(),
  logicalStates: z.array(logicalStateSchema),
  variants: z.array(stateVariantSchema),
  transitions: z.array(transitionSchema),
  artifacts: z.array(artifactSchema),
  jobs: z.array(generationJobSchema),
  plugins: z.array(pluginDeclarationSchema).default([{
    id: "petlord.todo",
    name: "To Do",
    version: "0.1.0",
    entry: "index.js",
    permissions: ["pet:read", "pet:control", "storage", "ui:panel", "notifications"],
  }, {
    id: "petlord.agent-activity",
    name: "Agent Activity",
    version: "0.1.0",
    entry: "index.js",
    permissions: [
      "pet:read",
      "pet:control",
      "ui:panel",
      "ui:context-menu",
      "notifications",
      "background:events",
      "integration:claude:events",
      "integration:claude:open-session",
      "integration:codex:events",
      "integration:codex:open-session",
    ],
  }]),
  updatedAt: z.string().datetime(),
});

export const runtimeStateSchema = z.object({
  nativePixel: nativePixelDimensionsSchema.optional(),
  id: z.string().min(1),
  logicalStateId: z.string().min(1),
  label: z.string().min(1),
  imageUri: z.string().min(1),
  origin: z.enum(["initial", "transition-tail", "reference"]),
});

export const runtimeTransitionSchema = z.object({
  nativeAnimation: runtimeNativeAnimationSchema.optional(),
  id: z.string().min(1),
  fromStateId: z.string().min(1),
  toStateId: z.string().min(1),
  videoUri: z.string().min(1).optional(),
  tailFrameUri: z.string().min(1),
  durationMs: z.number().int().positive(),
  entryBlendMs: z.number().int().min(0).max(1000).optional(),
  endFrameSource: z.enum(["authority-reference", "video-frame", "source-frame"]).default("video-frame"),
  transparentVideo: z.boolean().default(false),
  authorityBridge: authorityBridgeSchema.default({ mode: "crossfade", durationMs: 700 }),
  idleRule: idleTransitionRuleSchema.optional(),
  playback: transitionPlaybackSchema.optional(),
  triggers: z.array(transitionTriggerSchema).default([]),
}).superRefine((transition, context) => {
  if (!transition.videoUri && !transition.nativeAnimation) context.addIssue({code: "custom", message: "Transition requires videoUri or nativeAnimation."});
  if (transition.nativeAnimation) {
    if (transition.playback?.mode === "ping-pong") context.addIssue({code: "custom", path: ["playback", "mode"], message: "Author ping-pong motion as an explicit native frame sequence with forward playback."});
    if (transition.durationMs !== transition.nativeAnimation.frames.reduce((sum, frame) => sum + frame.durationMs, 0)) context.addIssue({code: "custom", path: ["durationMs"], message: "Native duration must equal the sum of frame durations."});
    if ((transition.playback?.segmentStartMs ?? 0) !== 0 || (transition.playback?.segmentEndMs !== undefined && transition.playback.segmentEndMs !== transition.durationMs)) context.addIssue({code: "custom", path: ["playback"], message: "Native playback uses the complete explicit frame sequence."});
  }
});

export const petPackageManifestSchema = z
  .object({
    manifestVersion: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1),
    characterName: z.string().min(1),
    runtimePresentation: runtimePresentationSettingsSchema.optional(),
    initialStateId: z.string().min(1),
    states: z.array(runtimeStateSchema).min(1),
    transitions: z.array(runtimeTransitionSchema),
    logicalStates: z.array(
      z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        variantIds: z.array(z.string()),
        idleScheduler: idleSchedulerSchema,
        pointerGaze: runtimePointerGazeSchema.optional(),
      }),
    ),
    dragInteraction: runtimeDragInteractionSchema.optional(),
    semanticActions: z.record(z.string(), z.string()),
    plugins: z.array(pluginDeclarationSchema).default([]),
  })
  .superRefine((manifest, context) => {
    const states = new Map(manifest.states.map((state) => [state.id, state]));
    if (!states.has(manifest.initialStateId)) {
      context.addIssue({
        code: "custom",
        path: ["initialStateId"],
        message: "Initial state must reference an exported state.",
      });
    }

    for (const logical of manifest.logicalStates) {
      if (!logical.pointerGaze?.nativeImageUris) continue;
      const variants = manifest.states.filter(state => state.logicalStateId === logical.id);
      const size = variants[0]?.nativePixel;
      if (variants.some(state => !size || !state.nativePixel || state.nativePixel.width !== size.width || state.nativePixel.height !== size.height)) context.addIssue({code: "custom", path: ["logicalStates", logical.id, "pointerGaze"], message: "Native gaze requires matching native dimensions across logical-state variants."});
    }

    for (const transition of manifest.transitions) {
      const target = states.get(transition.toStateId);
      if (!states.has(transition.fromStateId) || !target) {
        context.addIssue({
          code: "custom",
          path: ["transitions", transition.id],
          message: "Transition endpoints must reference exported states.",
        });
        continue;
      }
      if (transition.nativeAnimation) {
        const source = states.get(transition.fromStateId)!;
        const frames = transition.nativeAnimation.frames;
        if (frames[0]?.imageUri !== source.imageUri || frames.at(-1)?.imageUri !== target.imageUri) context.addIssue({code: "custom", path: ["transitions", transition.id, "nativeAnimation"], message: "Native first/last frames must match source/target stills."});
        if (!source.nativePixel || !target.nativePixel || source.nativePixel.width !== target.nativePixel.width || source.nativePixel.height !== target.nativePixel.height) context.addIssue({code: "custom", path: ["transitions", transition.id], message: "Native endpoints require matching pixel dimensions."});
      }
      if (target.imageUri !== transition.tailFrameUri) {
        context.addIssue({
          code: "custom",
          path: ["transitions", transition.id, "tailFrameUri"],
          message: "Target still must match the transition's selected end frame.",
        });
      }
    }
  });

export const petPackageBundleSchema = z.object({
  format: z.literal("petlord-package"),
  bundleVersion: z.union([z.literal(1), z.literal(2)]),
  createdAt: z.string().datetime(),
  manifest: petPackageManifestSchema,
  sourceProject: characterProjectSchema.optional(),
  assets: z.record(z.string(), z.string()).default({}),
  integrity: z.object({
    algorithm: z.literal("SHA-256"),
    manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
    sourceProjectSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    assets: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/)),
  }).optional(),
}).superRefine((bundle, context) => {
  if (bundle.bundleVersion === 1) return;
  if (!bundle.integrity) {
    context.addIssue({ code: "custom", path: ["integrity"], message: "V2 package requires integrity metadata." });
    return;
  }
  if (bundle.sourceProject && !bundle.integrity.sourceProjectSha256) context.addIssue({code:"custom",path:["integrity"],message:"Editable source requires its own integrity hash."});
  const uris = [...collectRuntimeMediaUris(bundle.manifest), ...(bundle.sourceProject?.artifacts.map(artifact => artifact.uri) ?? [])];
  for (const uri of uris) {
    if (!uri.startsWith("asset://")) {
      context.addIssue({ code: "custom", path: ["manifest"], message: "V2 package media must use asset:// references." });
      continue;
    }
    const key = uri.slice("asset://".length);
    if (!bundle.assets[key] || !bundle.integrity.assets[key]) {
      context.addIssue({ code: "custom", path: ["assets", key], message: `V2 package is missing asset ${key}.` });
    }
  }
});

export const publishedPackageSummarySchema = z.object({
  publicationId: z.string().regex(/^[a-f0-9]{64}$/),
  packageId: z.string().min(1),
  name: z.string().min(1),
  characterName: z.string().min(1),
  createdAt: z.string().datetime(),
  publishedAt: z.string().datetime(),
  stateCount: z.number().int().positive(),
  transitionCount: z.number().int().nonnegative(),
  sizeBytes: z.number().int().positive().max(224 * 1024 * 1024),
  downloadPath: z.string().regex(/^\/api\/library\/packages\/[a-f0-9]{64}\/download$/),
});

export type Artifact = z.infer<typeof artifactSchema>;
export type LogicalState = z.infer<typeof logicalStateSchema>;
export type StateVariant = z.infer<typeof stateVariantSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type TransitionTrigger = z.infer<typeof transitionTriggerSchema>;
export type AuthorityBridge = z.infer<typeof authorityBridgeSchema>;
export type IdleScheduler = z.infer<typeof idleSchedulerSchema>;
export type PointerGaze = z.infer<typeof pointerGazeSchema>;
export type RuntimePointerGaze = z.infer<typeof runtimePointerGazeSchema>;
export type DragInteraction = z.infer<typeof dragInteractionSchema>;
export type RuntimeDragInteraction = z.infer<typeof runtimeDragInteractionSchema>;
export type IdleTransitionRule = z.infer<typeof idleTransitionRuleSchema>;
export type TransitionPlayback = z.infer<typeof transitionPlaybackSchema>;
export type TransparencyProcessing = z.infer<typeof transparencyProcessingSchema>;
export type TransitionMediaVersion = z.infer<typeof transitionMediaVersionSchema>;
export type InteractionRegion = z.infer<typeof interactionRegionSchema>;
export type GenerationJob = z.infer<typeof generationJobSchema>;
export type GenerationSettings = z.infer<typeof generationSettingsSchema>;
export type RuntimePresentationSettings = z.infer<typeof runtimePresentationSettingsSchema>;
export type VideoBackgroundSettings = z.infer<typeof videoBackgroundSettingsSchema>;
export type CustomerOrder = z.infer<typeof customerOrderSchema>;
export type OrderCostEntry = z.infer<typeof orderCostEntrySchema>;
export type DeliveryChecklist = z.infer<typeof deliveryChecklistSchema>;
export type CustomerReviewItem = z.infer<typeof customerReviewItemSchema>;
export type CustomerReviewRound = z.infer<typeof customerReviewRoundSchema>;
export type CustomerReviewResponse = z.infer<typeof customerReviewResponseSchema>;
export type CharacterProject = z.infer<typeof characterProjectSchema>;
export type IdentityProfile = z.infer<typeof identityProfileSchema>;
export type PetPackageManifest = z.infer<typeof petPackageManifestSchema>;
export type PetPackageBundle = z.infer<typeof petPackageBundleSchema>;
export type PublishedPackageSummary = z.infer<typeof publishedPackageSummarySchema>;
export type RuntimeState = z.infer<typeof runtimeStateSchema>;
export type RuntimeTransition = z.infer<typeof runtimeTransitionSchema>;
export type PluginDeclaration = z.infer<typeof pluginDeclarationSchema>;
export type PluginPermission = z.infer<typeof pluginPermissionSchema>;
export type AgentEventSource = z.infer<typeof agentEventSourceSchema>;
export type AgentEventType = z.infer<typeof agentEventTypeSchema>;
export type AgentEventSeverity = z.infer<typeof agentEventSeveritySchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;

/** Every state, animation frame, video, selected tail and pointer-gaze media URI. */
export function collectRuntimeMediaUris(manifest: PetPackageManifest): string[] {
  return [...new Set([
    ...manifest.states.map(state => state.imageUri),
    ...manifest.transitions.flatMap(transition => [
      ...(transition.videoUri ? [transition.videoUri] : []), transition.tailFrameUri,
      ...(transition.nativeAnimation?.frames.map(frame => frame.imageUri) ?? []),
    ]),
    ...manifest.logicalStates.flatMap(state => [
      ...(state.pointerGaze?.videoUri ? [state.pointerGaze.videoUri] : []),
      ...(state.pointerGaze?.nativeImageUris ?? []),
    ]),
  ])];
}
/** Rewrites media while leaving absent optional fields absent (legacy hash compatibility). */
export function mapRuntimeMediaUris(manifest: PetPackageManifest, resolve: (uri: string) => string): PetPackageManifest {
  return {
    ...manifest,
    states: manifest.states.map(state => ({...state, imageUri: resolve(state.imageUri)})),
    transitions: manifest.transitions.map(transition => ({
      ...transition,
      ...(transition.videoUri ? {videoUri: resolve(transition.videoUri)} : {}),
      tailFrameUri: resolve(transition.tailFrameUri),
      ...(transition.nativeAnimation ? {nativeAnimation: {...transition.nativeAnimation, frames: transition.nativeAnimation.frames.map(frame => ({...frame, imageUri: resolve(frame.imageUri)}))}} : {}),
    })),
    logicalStates: manifest.logicalStates.map(state => ({
      ...state,
      pointerGaze: state.pointerGaze ? {...state.pointerGaze,
        ...(state.pointerGaze.videoUri ? {videoUri: resolve(state.pointerGaze.videoUri)} : {}),
        ...(state.pointerGaze.nativeImageUris ? {nativeImageUris: state.pointerGaze.nativeImageUris.map(resolve) as NonNullable<RuntimePointerGaze["nativeImageUris"]>} : {}),
      } : undefined,
    })),
  };
}
export type NativeAnimation = z.infer<typeof nativeAnimationSchema>;
export type RuntimeNativeAnimation = z.infer<typeof runtimeNativeAnimationSchema>;
