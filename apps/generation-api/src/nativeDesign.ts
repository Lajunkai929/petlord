import { createHash } from "node:crypto";
import { PNG } from "pngjs";
import { artifactSchema, characterProjectSchema, nativePixelDocumentSchema, type Artifact, type CharacterProject, type NativePixelDocument, type TransitionPlayback } from "@petlord/schema";
import { renderPixelFrame, validatePixelDocument } from "@petlord/pixel-art";
import { applyDesignMutation, assertProjectReferences, DesignError } from "@petlord/design-core";

type ImportMedia = (dataUrl: string, mediaId: string) => Promise<{ id: string; uri: string; mimeType: string }>;
const digest = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");
function documentFor(project: CharacterProject) {
  if (!project.pixelDocument) throw new DesignError("NOT_FOUND", "Create a pixel document with pixel.document.set first.");
  return project.pixelDocument;
}
function encode(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray) {
  const image = new PNG({ width, height });
  image.data = Buffer.from(rgba);
  return PNG.sync.write(image, { colorType: 6, inputColorType: 6, bitDepth: 8 });
}
function frameIdsFor(project: CharacterProject, ids?: string[]) {
  const document = documentFor(project);
  const selected = ids ?? document.frames.map(f => f.id);
  for (const id of selected) if (!document.frames.some(f => f.id === id)) throw new DesignError("NOT_FOUND", `Pixel frame ${id} does not exist.`);
  return selected;
}

/** Rendered frames are immutable snapshots. Changing artwork never silently edits approved states. */
export async function renderNativeFrames(project: CharacterProject, requestedIds: string[] | undefined, importMedia: ImportMedia) {
  const document = documentFor(project);
  const artifacts = [...project.artifacts];
  const frames: Artifact[] = [];
  for (const frameId of frameIdsFor(project, requestedIds)) {
    const { width, height, rgba } = renderPixelFrame(document, frameId);
    const bytes = encode(width, height, rgba);
    const key = digest(`${project.id}:${frameId}:${digest(bytes)}`);
    const id = `pixel-${key}`;
    let artifact = artifacts.find(a => a.id === id);
    if (!artifact) {
      const media = await importMedia(`data:image/png;base64,${bytes.toString("base64")}`, key);
      artifact = artifactSchema.parse({ id, kind: "state-draft", uri: media.uri, mimeType: "image/png", label: frameId, provenance: "user-upload", createdAt: new Date().toISOString(), pixelWidth: width, pixelHeight: height, hasAlpha: true, nativePixel: { frameId, width, height } });
      artifacts.push(artifact);
    }
    frames.push(artifact);
  }
  return { project: { ...project, artifacts, updatedAt: new Date().toISOString() }, frames };
}

/** Explicit save refreshes graph bindings; render/set retain their immutable-snapshot contract. */
export async function saveNativeDocument(project: CharacterProject, input: NativePixelDocument, importMedia: ImportMedia) {
  const document = nativePixelDocumentSchema.parse(input);
  assertProjectReferences(project);
  const artifacts = new Map(project.artifacts.map(artifact => [artifact.id, artifact]));
  const bound = new Map<string, { frameId: string; paths: string[] }>();
  function collect(id: string | undefined, path: string, requireNative = false) {
    if (!id) return;
    const artifact = artifacts.get(id);
    if (!artifact?.nativePixel) {
      if (requireNative) throw new DesignError("INVALID_REFERENCE", `绑定帧 ${id} 缺少原生帧来源，无法刷新。`, { path, artifactId: id });
      return;
    }
    const binding = bound.get(id) ?? { frameId: artifact.nativePixel.frameId, paths: [] };
    binding.paths.push(path);
    bound.set(id, binding);
  }
  // Variants remain part of the editable/exportable graph, including non-default variants.
  for (const variant of project.variants) collect(variant.imageArtifactId, `variants.${variant.id}.imageArtifactId`);
  for (const state of project.logicalStates) {
    collect(state.referenceArtifactId, `logicalStates.${state.id}.referenceArtifactId`);
    for (const [index, id] of (state.pointerGaze?.nativeImageArtifactIds ?? []).entries()) collect(id, `logicalStates.${state.id}.pointerGaze.nativeImageArtifactIds.${index}`, true);
  }
  for (const transition of project.transitions) {
    for (const [index, frame] of (transition.nativeAnimation?.frames ?? []).entries()) collect(frame.imageArtifactId, `transitions.${transition.id}.nativeAnimation.frames.${index}`, true);
    if (transition.endFrameSource === "authority-reference") collect(transition.targetDraftArtifactId, `transitions.${transition.id}.targetDraftArtifactId`);
    if (transition.endFrameSource === "video-frame") collect(transition.extractedTailArtifactId, `transitions.${transition.id}.extractedTailArtifactId`);
  }
  const available = new Set(document.frames.map(frame => frame.id));
  const missing = [...bound.values()].filter(binding => !available.has(binding.frameId));
  if (missing.length) throw new DesignError("REFERENCED", `无法保存：已绑定的帧 ${[...new Set(missing.map(binding => binding.frameId))].join("、")} 已被删除。请保留这些帧，或先解除对应状态和动画的绑定。`, { missingBindings: missing });

  // All binding/source checks precede media writes. The service commits this entire
  // returned graph once with its original revision; a concurrent edit cannot partially apply it.
  const rendered = await renderNativeFrames({ ...project, pixelDocument: document }, [...new Set([...bound.values()].map(binding => binding.frameId))], importMedia);
  const byFrame = new Map(rendered.frames.map(artifact => [artifact.nativePixel!.frameId, artifact]));
  const artifactReplacements = Object.fromEntries([...bound].map(([id, binding]) => [id, byFrame.get(binding.frameId)!.id]));
  const replace = (id: string) => Object.hasOwn(artifactReplacements, id) ? artifactReplacements[id] : id;
  const next = characterProjectSchema.parse({
    ...rendered.project,
    variants: project.variants.map(variant => ({ ...variant, imageArtifactId: replace(variant.imageArtifactId) })),
    logicalStates: project.logicalStates.map(state => {
      const selected = state.referenceArtifactId;
      const referenceArtifactId = selected ? replace(selected) : undefined;
      return {
        ...state,
        ...(referenceArtifactId && referenceArtifactId !== selected ? {referenceArtifactId, referenceArtifactIds: [...new Set([...state.referenceArtifactIds, referenceArtifactId])]} : {}),
        ...(state.pointerGaze?.nativeImageArtifactIds ? {pointerGaze: {...state.pointerGaze, nativeImageArtifactIds: state.pointerGaze.nativeImageArtifactIds.map(replace)}} : {}),
      };
    }),
    transitions: project.transitions.map(transition => ({
      ...transition,
      ...(transition.nativeAnimation ? { nativeAnimation: { ...transition.nativeAnimation, frames: transition.nativeAnimation.frames.map(frame => ({ ...frame, imageArtifactId: replace(frame.imageArtifactId) })) } } : {}),
      ...(transition.targetDraftArtifactId && (transition.nativeAnimation || transition.endFrameSource === "authority-reference") ? { targetDraftArtifactId: replace(transition.targetDraftArtifactId) } : {}),
      ...(transition.extractedTailArtifactId && (transition.nativeAnimation || transition.endFrameSource === "video-frame") ? { extractedTailArtifactId: replace(transition.extractedTailArtifactId) } : {}),
    })),
  });
  assertProjectReferences(next);
  return { project: next, frames: rendered.frames, artifactReplacements };
}

export function bindNativeAnimation(project: CharacterProject, transitionId: string, frames: { artifact: Artifact; durationMs: number }[], approve: boolean, repeat?: Pick<TransitionPlayback, "repeatMode" | "minCycles" | "maxCycles">) {
  const transition = project.transitions.find(t => t.id === transitionId);
  if (!transition) throw new DesignError("NOT_FOUND", "Transition does not exist.");
  const source = project.variants.find(v => v.id === transition.fromVariantId);
  const target = project.logicalStates.find(s => s.id === transition.toLogicalStateId);
  const loop = source?.logicalStateId === target?.id;
  const targetArtifactId = loop ? source?.imageArtifactId : target?.referenceArtifactId;
  if (frames[0].artifact.id !== source?.imageArtifactId || frames.at(-1)!.artifact.id !== targetArtifactId) throw new DesignError("ENDPOINT_MISMATCH", "First and last frames must be the exact source variant and target authority image. Bind the state frames before authoring the transition.", { expectedSourceArtifactId: source?.imageArtifactId, expectedTargetArtifactId: targetArtifactId, suppliedSourceArtifactId: frames[0].artifact.id, suppliedTargetArtifactId: frames.at(-1)!.artifact.id });
  const durationMs = frames.reduce((sum, f) => sum + f.durationMs, 0);
  const result = applyDesignMutation(project, "transition.update", { transitionId, patch: { nativeAnimation: { frames: frames.map(f => ({ imageArtifactId: f.artifact.id, durationMs: f.durationMs })) }, durationMs, endFrameSource: loop ? "source-frame" : "authority-reference", targetDraftArtifactId: targetArtifactId, status: "draft", playback: { ...transition.playback, ...repeat, mode: "forward", segmentStartMs: 0, segmentEndMs: durationMs }, entryBlendMs: 0 }, clear: ["videoArtifactId", "extractedTailArtifactId", "toVariantId"] });
  const updated = approve ? applyDesignMutation(result.project, "transition.approve", { transitionId }).project : result.project;
  return updated;
}

export async function nativeFeedback(project: CharacterProject, input: { frameIds?: string[]; columns: number; scale: number }, importMedia: ImportMedia) {
  const document = documentFor(project), frameIds = frameIdsFor(project, input.frameIds);
  const columns = Math.min(input.columns, frameIds.length), scale = input.scale;
  const width = columns * document.width * scale, height = Math.ceil(frameIds.length / columns) * document.height * scale;
  if (width * height > 16_777_216) throw new DesignError("INVALID_INPUT", "Contact sheet exceeds 16 million pixels; request fewer frames or a lower scale.");
  const rgba = new Uint8Array(width * height * 4);
  let previous: Uint8ClampedArray | undefined;
  const frames = frameIds.map((frameId, index) => {
    const image = renderPixelFrame(document, frameId);
    let opaquePixels = 0, changedPixels = 0, minX = document.width, minY = document.height, maxX = -1, maxY = -1;
    const originX = (index % columns) * document.width * scale, originY = Math.floor(index / columns) * document.height * scale;
    for (let y = 0; y < document.height; y++) for (let x = 0; x < document.width; x++) {
      const offset = (y * document.width + x) * 4, pixel = image.rgba.subarray(offset, offset + 4);
      if (pixel[3]) { opaquePixels++; minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
      if (previous && pixel.some((v, c) => v !== previous![offset + c])) changedPixels++;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) rgba.set(pixel, ((originY + y * scale + dy) * width + originX + x * scale + dx) * 4);
    }
    previous = image.rgba;
    return { frameId, index, x: originX, y: originY, width: document.width * scale, height: document.height * scale, opaquePixels, changedPixels, bounds: opaquePixels ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null };
  });
  const bytes = encode(width, height, rgba);
  const media = await importMedia(`data:image/png;base64,${bytes.toString("base64")}`, `sheet-${digest(bytes)}`);
  return { validation: validatePixelDocument(document), contactSheet: { ...media, width, height, scale }, frames, palette: document.palette };
}
