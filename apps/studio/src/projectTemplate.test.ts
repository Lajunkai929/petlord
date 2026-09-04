import { describe, expect, it } from "vitest";
import { characterProjectSchema, identityProfileSchema } from "@petlord/schema";
import {
  activateAuthorityReference,
  createBlankProject,
  createIdentityProfileFromProject,
  duplicateProjectForOrder,
  ensureAuthorityVariants,
  promoteReferenceToInitialState,
} from "./projectTemplate";
import { seedProject } from "./seed";
import { saveProjectAsTemplate, sourceStateIdFromVariant } from "./projectTemplates";

const input = {
  customerName: "小林",
  contact: "闲鱼号 8231",
  characterName: "奶盖",
  quotedPriceCny: 799,
  depositCny: 300,
  dueDate: "2026-09-08",
  revisionLimit: 2,
  notes: "优先做睡觉动作",
};

describe("customer project templates", () => {
  it("creates the default companion graph without leaking demo media", () => {
    const project = characterProjectSchema.parse(createBlankProject(input));
    expect(project.logicalStates).toHaveLength(5);
    expect(project.transitions).toHaveLength(13);
    expect(sourceStateIdFromVariant(project, project.transitions[0].fromVariantId)).toBeTruthy();
    expect(project.artifacts).toHaveLength(0);
    expect(project.variants).toHaveLength(0);
    expect(project.initialVariantId).toBeUndefined();
    expect(project.order).toMatchObject({ customerName: "小林", quotedPriceCny: 799, status: "assets" });
    expect(project.logicalStates.filter((state) => state.idleScheduler.enabled).every((state) =>
      state.idleScheduler.playbackMode === (state.semanticKey === "play" ? "continuous" : "interval") &&
      state.idleScheduler.minIntervalMs === 10_000 &&
      state.idleScheduler.maxIntervalMs === 30_000)).toBe(true);
    expect(project.transitions.find((transition) => transition.id === "template-sleep-breathe")?.idleRule?.weight).toBe(50);
    expect(project.transitions.find((transition) => transition.id === "template-sleep-dream")?.idleRule?.weight).toBe(1);
    expect(project.transitions.find((transition) => transition.id === "template-rest-belly")?.triggers[0]?.region).toEqual({ shape: "ellipse", x: 0.04, y: 0.04, width: 0.92, height: 0.92 });
  });

  it("creates a truly blank project or a complete fixed interaction graph", () => {
    const blank = createBlankProject({ ...input, projectTemplateId: "blank" });
    const companion = createBlankProject({ ...input, projectTemplateId: "companion" });
    const complete = createBlankProject({ ...input, serviceTemplateId: "complete" });
    expect(blank.logicalStates).toHaveLength(0);
    expect(blank.transitions).toHaveLength(0);
    expect(companion.logicalStates.map((state) => state.semanticKey)).toEqual(["idle", "rest", "sleep", "play", "greet"]);
    expect(companion.order.serviceTemplateId).toBe("companion");
    expect(complete.logicalStates).toHaveLength(8);
    expect(complete.transitions).toHaveLength(22);
    expect(complete.logicalStates.map((state) => state.semanticKey)).toContain("cuddle");
    expect(complete.transitions.every((transition) => !transition.prompt.includes("Lottery"))).toBe(true);
  });

  it("binds template edges to authority variants as state candidates are accepted", () => {
    const project = createBlankProject({ ...input, projectTemplateId: "companion" });
    const edge = project.transitions.find((transition) => transition.id === "template-sit-rest")!;
    expect(edge.fromVariantId).toBe("template-source-state-sitting");
    expect(edge.status).toBe("draft");
    project.artifacts.push(
      { id: "sitting-reference", kind: "state-draft", uri: "/sitting.png", mimeType: "image/png", createdAt: "2026-09-01T00:00:00.000Z" },
      { id: "rest-reference", kind: "state-draft", uri: "/rest.png", mimeType: "image/png", createdAt: "2026-09-01T00:00:00.000Z" },
    );
    const withSource = activateAuthorityReference(project, "state-sitting", "sitting-reference");
    const ready = activateAuthorityReference(withSource, "state-lying", "rest-reference");
    expect(ready.transitions.find((transition) => transition.id === edge.id)).toMatchObject({
      fromVariantId: "variant-authority-state-sitting-sitting-reference",
      targetDraftArtifactId: "rest-reference",
      status: "target-ready",
    });
  });

  it("saves a finished project as a media-free reusable template", () => {
    const source = createBlankProject({ ...input, projectTemplateId: "companion" });
    source.logicalStates[0] = { ...source.logicalStates[0], pointerGaze: { enabled: true, motionTarget: "head", activationRadius: 1.4, anchor: { x: 0.72, y: 0.3 }, videoArtifactId: "private-gaze-video", videoArtifactIds: ["private-gaze-video"], durationMs: 6_000, segmentStartMs: 0, segmentEndMs: 6_000, directionKeyframesMs: [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800], blendDurationMs: 240 } };
    source.plugins = [{ id: "petlord.todo", name: "To Do", version: "0.1.0", entry: "plugins/todo/index.js", permissions: ["pet:read"] }];
    source.artifacts.push({ id: "private-media", kind: "state-draft", uri: "/private/dog.png", mimeType: "image/png", createdAt: "2026-09-01T00:00:00.000Z" });
    const template = saveProjectAsTemplate(source, "陪伴工作流", "复用当前交互图");
    expect(template.states).toHaveLength(5);
    expect(template.transitions).toHaveLength(13);
    expect(template.transitions[0].promptTemplate).toContain("{{characterName}}");
    expect(template.transitions[0].promptTemplate).not.toContain("奶盖");
    expect(template.states[0].pointerGaze).toEqual({ enabled: true, motionTarget: "head", activationRadius: 1.4, anchor: { x: 0.5, y: 0.5 }, videoArtifactIds: [], segmentStartMs: 0, directionKeyframesMs: [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800], blendDurationMs: 240 });
    expect(JSON.stringify(template)).not.toContain("private-gaze-video");
    expect(JSON.stringify(template)).not.toContain("/private/dog.png");

    const reused = createBlankProject({ ...input, characterName: "团子", projectName: "团子的新项目", projectTemplateId: template.id, projectTemplate: template });
    expect(reused.logicalStates).toHaveLength(5);
    expect(reused.transitions).toHaveLength(13);
    expect(reused.transitions[0].prompt).toContain("{{characterName}}");
    expect(reused.transitions[0].prompt).not.toContain("奶盖");
    expect(reused.transitions.every((transition) => transition.status === "draft")).toBe(true);
    expect(reused.artifacts).toHaveLength(0);
    expect(reused.plugins).toEqual(template.plugins);
    expect(reused.logicalStates[0].pointerGaze).toEqual({ enabled: true, motionTarget: "head", activationRadius: 1.4, anchor: { x: 0.5, y: 0.5 }, videoArtifactIds: [], segmentStartMs: 0, directionKeyframesMs: [600, 1200, 1800, 2400, 3000, 3600, 4200, 4800], blendDurationMs: 240 });
    expect(reused.order.serviceTemplateId).toBe(template.id);
  });

  it("duplicates a proven graph while starting a new order ledger", () => {
    const duplicated = duplicateProjectForOrder(seedProject, input);
    expect(duplicated.id).not.toBe(seedProject.id);
    expect(duplicated.transitions).toHaveLength(seedProject.transitions.length);
    expect(duplicated.jobs).toHaveLength(0);
    expect(duplicated.order.customerName).toBe("小林");
  });

  it("uses the authority reference itself as the approved default and initial runtime variant", () => {
    const blank = createBlankProject(input);
    blank.artifacts.push({ id: "reference", kind: "state-draft", uri: "data:image/png;base64,AA==", mimeType: "image/png", createdAt: "2026-08-30T00:00:00.000Z" });
    blank.logicalStates = blank.logicalStates.map((state) => state.id === "state-sitting" ? { ...state, referenceArtifactId: "reference", referenceArtifactIds: ["reference"] } : state);
    let sequence = 0;
    const promoted = promoteReferenceToInitialState(blank, "state-sitting", () => String(++sequence));
    expect(promoted.initialVariantId).toBe("variant-authority-state-sitting-reference");
    expect(promoted.logicalStates.find((state) => state.id === "state-sitting")?.defaultVariantId).toBe(promoted.initialVariantId);
    expect(promoted.variants[0]).toMatchObject({ logicalStateId: "state-sitting", imageArtifactId: "reference", status: "approved", origin: { kind: "reference" } });
    expect(promoted.artifacts).toHaveLength(1);
  });

  it("reuses one global identity across projects with independent style rules", () => {
    const source = createBlankProject(input);
    source.artifacts.push({ id: "identity-photo", kind: "identity-reference", uri: "/media/nai-gai.jpg", mimeType: "image/jpeg", createdAt: "2026-08-30T00:00:00.000Z", provenance: "user-upload" });
    source.referenceArtifactIds = ["identity-photo"];
    const identity = identityProfileSchema.parse(createIdentityProfileFromProject(source));
    const handDrawn = createBlankProject({ ...input, projectName: "奶盖 · 手绘版", stylePrompt: "柔和手绘" }, identity);
    const pixel = createBlankProject({ ...input, projectName: "奶盖 · 像素版", stylePrompt: "16 bit 像素艺术" }, identity);
    expect(handDrawn.identityProfileId).toBe(identity.id);
    expect(pixel.identityProfileId).toBe(identity.id);
    expect(handDrawn.referenceArtifactIds).toEqual(["identity-photo"]);
    expect(handDrawn.stylePrompt).toBe("柔和手绘");
    expect(pixel.stylePrompt).toBe("16 bit 像素艺术");
  });

  it("materializes reusable style variables with the new pet name", () => {
    const project = createBlankProject({
      ...input,
      characterName: "球球",
      stylePrompt: "保持 {{characterName}} 的真实比例",
      imageStylePrompt: "生成 {{characterName}} 的清透实拍母版",
      videoStylePrompt: "锁定 {{characterName}} 的眼睛和毛色",
    });
    expect(project.stylePrompt).toBe("保持 {{characterName}} 的真实比例");
    expect(project.imageStylePrompt).toBe("生成 {{characterName}} 的清透实拍母版");
    expect(project.videoStylePrompt).toBe("锁定 {{characterName}} 的眼睛和毛色");
    expect(project.transitions.every((transition) => transition.prompt.includes("{{characterName}}") && !transition.prompt.includes("Lottery"))).toBe(true);
  });

  it("keeps the authority reference as state default while retaining transition-tail variants", () => {
    const project = createBlankProject(input);
    project.artifacts.push({ id: "reference-a", kind: "state-draft", uri: "/state-a.png", mimeType: "image/png", createdAt: "2026-08-30T00:00:00.000Z" });
    const activated = activateAuthorityReference(project, "state-sitting", "reference-a");
    activated.variants.push({ id: "variant-tail", logicalStateId: "state-sitting", label: "过渡选帧", status: "approved", imageArtifactId: "reference-a", origin: { kind: "transition-tail", transitionId: "transition-a" } });
    expect(activated.logicalStates.find((state) => state.id === "state-sitting")?.defaultVariantId).toBe("variant-authority-state-sitting-reference-a");
  });

  it("migrates a former video-tail default into the preferred outbound source", () => {
    const project = createBlankProject(input);
    project.artifacts.push(
      { id: "authority", kind: "state-draft", uri: "/authority.png", mimeType: "image/png", createdAt: "2026-08-30T00:00:00.000Z" },
      { id: "tail", kind: "state-actual", uri: "/tail.png", mimeType: "image/png", createdAt: "2026-08-30T00:00:00.000Z" },
    );
    project.variants.push({ id: "tail-variant", logicalStateId: "state-sitting", label: "视频选帧", status: "approved", imageArtifactId: "tail", origin: { kind: "transition-tail", transitionId: "transition-a" } });
    project.logicalStates = project.logicalStates.map((state) => state.id === "state-sitting"
      ? { ...state, referenceArtifactId: "authority", referenceArtifactIds: ["authority"], defaultVariantId: "tail-variant" }
      : state);
    project.initialVariantId = "tail-variant";
    const migrated = ensureAuthorityVariants(project);
    const state = migrated.logicalStates.find((candidate) => candidate.id === "state-sitting");
    expect(state?.defaultVariantId).toBe("variant-authority-state-sitting-authority");
    expect(state?.preferredOutboundVariantId).toBe("tail-variant");
    expect(migrated.initialVariantId).toBe("variant-authority-state-sitting-authority");
  });
});
