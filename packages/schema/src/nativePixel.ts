import { z } from 'zod';

export const nativePixelLimits = { dimension: 256, frames: 256, layers: 32, patches: 256, sourceCells: 4_194_304, resolvedCells: 4_194_304 } as const;
const id = z.string().min(1).max(128);
const offset = z.number().int().min(0).max(nativePixelLimits.dimension - 1);
const rows = z.array(z.string().min(1).max(nativePixelLimits.dimension)).min(1).max(nativePixelLimits.dimension);
export const nativePixelLayerSchema = z.object({ id, x: offset, y: offset, rows, visible: z.boolean().optional() });
export const nativePixelPatchSchema = z.object({ layerId: id, x: offset, y: offset, rows });
export const nativePixelFrameSchema = z.object({
  id, baseFrameId: id.optional(),
  layers: z.array(nativePixelLayerSchema).max(nativePixelLimits.layers).optional(),
  patches: z.array(nativePixelPatchSchema).max(nativePixelLimits.patches).optional(),
});
const sourceSchema = z.object({
  schemaVersion: z.literal(1), width: z.number().int().min(1).max(nativePixelLimits.dimension), height: z.number().int().min(1).max(nativePixelLimits.dimension),
  palette: z.record(z.string().regex(/^[!-~]$/), z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable()),
  frames: z.array(nativePixelFrameSchema).min(1).max(nativePixelLimits.frames),
});
export type NativePixelDocument = z.infer<typeof sourceSchema>;
export type NativePixelLayer = z.infer<typeof nativePixelLayerSchema>;
export type NativePixelFrame = z.infer<typeof nativePixelFrameSchema>;
export interface PixelDiagnostic { frameId?: string; message: string; path?: PropertyKey[] }

/** Resolves a structurally parsed source. Bounded cumulative materialized cells include inherited layers. */
function resolveDocument(source: NativePixelDocument) {
  const diagnostics: PixelDiagnostic[] = [];
  const resolved = new Map<string, { id: string; layers: NativePixelLayer[] }>();
  const frames = new Map(source.frames.map(frame => [frame.id, frame]));
  const visiting = new Set<string>();
  let sourceCells = 0;
  let resolvedCells = 0;
  if (source.palette['.'] != null) diagnostics.push({message: 'The . palette key is always transparent.'});
  for (const frame of source.frames) {
    if (source.frames.filter(other => other.id === frame.id).length > 1) diagnostics.push({frameId: frame.id, message: 'Duplicate frame id.'});
    for (const edit of [...(frame.layers ?? []), ...(frame.patches ?? [])]) {
      sourceCells += edit.rows.reduce((sum, row) => sum + row.length, 0);
      if (sourceCells > nativePixelLimits.sourceCells) return {resolved, diagnostics: [{frameId: frame.id, message: 'Source cell budget exceeded.'}]};
      if (edit.rows.some(row => row.length !== edit.rows[0].length)) diagnostics.push({frameId: frame.id, message: 'Rows must be rectangular.'});
      if (edit.rows.some(row => [...row].some(key => key !== '.' && !Object.hasOwn(source.palette, key)))) diagnostics.push({frameId: frame.id, message: 'Unknown palette color.'});
    }
  }
  if (sourceCells > nativePixelLimits.sourceCells) diagnostics.push({message: 'Source cell budget exceeded.'});
  if (diagnostics.length) return {resolved, diagnostics};
  function resolve(frameId: string): {id: string; layers: NativePixelLayer[]} {
    const cached = resolved.get(frameId);
    if (cached) return cached;
    if (visiting.has(frameId)) throw new Error('Cyclic frame inheritance.');
    const frame = frames.get(frameId);
    if (!frame) throw new Error(`Unknown base frame: ${frameId}.`);
    visiting.add(frameId);
    try {
      const inherited = frame.baseFrameId ? resolve(frame.baseFrameId).layers : [];
      // Borrow immutable row arrays until the cumulative resolved budget is checked.
      const layers = inherited.map(layer => ({...layer}));
      const seen = new Set<string>();
      for (const layer of frame.layers ?? []) {
        if (seen.has(layer.id)) throw new Error('Duplicate layer id.');
        seen.add(layer.id);
        const position = layers.findIndex(item => item.id === layer.id);
        const copy = {...layer, rows: [...layer.rows]};
        if (position < 0) layers.push(copy); else layers[position] = copy;
      }
      if (layers.length > nativePixelLimits.layers) throw new Error('Resolved layer limit exceeded.');
      const cells = layers.reduce((sum, layer) => sum + layer.rows.length * layer.rows[0].length, 0);
      if (resolvedCells + cells > nativePixelLimits.resolvedCells) throw new Error('Resolved cell budget exceeded.');
      resolvedCells += cells;
      for (const layer of layers) layer.rows = [...layer.rows];
      for (const layer of layers) {
        if (layer.x + layer.rows[0].length > source.width || layer.y + layer.rows.length > source.height) throw new Error('Layer is out of canvas bounds.');
      }
      for (const patch of frame.patches ?? []) {
        const layer = layers.find(item => item.id === patch.layerId);
        if (!layer) throw new Error(`Unknown patch layer: ${patch.layerId}.`);
        if (patch.x + patch.rows[0].length > layer.rows[0].length || patch.y + patch.rows.length > layer.rows.length) throw new Error('Patch is out of layer bounds.');
        patch.rows.forEach((row, index) => {
          const old = layer.rows[index + patch.y];
          layer.rows[index + patch.y] = old.slice(0, patch.x) + row + old.slice(patch.x + row.length);
        });
      }
      const result = {id: frameId, layers};
      resolved.set(frameId, result);
      return result;
    } finally { visiting.delete(frameId); }
  }
  for (const frame of source.frames) {
    try { resolve(frame.id); } catch (error) { diagnostics.push({frameId: frame.id, message: error instanceof Error ? error.message : String(error)}); }
  }
  return {resolved, diagnostics};
}

export const nativePixelDocumentSchema = sourceSchema.superRefine((source, context) => {
  for (const diagnostic of resolveDocument(source).diagnostics) {
    context.addIssue({code: 'custom', path: diagnostic.frameId ? ['frames', source.frames.findIndex(frame => frame.id === diagnostic.frameId)] : [], message: diagnostic.message});
  }
});
export function validatePixelDocument(input: unknown): {valid: boolean; diagnostics: PixelDiagnostic[]} {
  const parsed = sourceSchema.safeParse(input);
  if (!parsed.success) return {valid: false, diagnostics: parsed.error.issues.map(issue => {
    const frames = input && typeof input === 'object' && 'frames' in input && Array.isArray(input.frames) ? input.frames : [];
    const frame = issue.path[0] === 'frames' && typeof issue.path[1] === 'number' ? frames[issue.path[1]] : undefined;
    return {message: issue.message, path: issue.path, ...(frame && typeof frame.id === 'string' ? {frameId: frame.id} : {})};
  })};
  const {diagnostics} = resolveDocument(parsed.data);
  return {valid: diagnostics.length === 0, diagnostics};
}
export function resolvePixelFrame(input: NativePixelDocument, frameId: string) {
  const source = sourceSchema.parse(input);
  const result = resolveDocument(source);
  if (result.diagnostics.length) throw new Error(result.diagnostics.map(diagnostic => `${diagnostic.frameId ?? 'document'}: ${diagnostic.message}`).join('\n'));
  const frame = result.resolved.get(frameId);
  if (!frame) throw new Error(`Unknown pixel frame: ${frameId}.`);
  return frame;
}
