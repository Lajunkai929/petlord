import { nativePixelDocumentSchema, resolvePixelFrame, type NativePixelDocument } from '@petlord/schema';
export { resolvePixelFrame, validatePixelDocument, nativePixelLimits } from '@petlord/schema';
export function renderPixelFrame(document: NativePixelDocument, frameId: string): {width: number; height: number; rgba: Uint8ClampedArray} {
  const frame = resolvePixelFrame(document, frameId);
  const rgba = new Uint8ClampedArray(document.width * document.height * 4);
  for (const layer of frame.layers) {
    if (layer.visible === false) continue;
    layer.rows.forEach((row, y) => [...row].forEach((key, x) => {
      const color = key === '.' ? null : document.palette[key];
      if (!color) return;
      const index = ((layer.y + y) * document.width + layer.x + x) * 4;
      rgba[index] = parseInt(color.slice(1, 3), 16);
      rgba[index + 1] = parseInt(color.slice(3, 5), 16);
      rgba[index + 2] = parseInt(color.slice(5, 7), 16);
      rgba[index + 3] = 255;
    }));
  }
  return {width: document.width, height: document.height, rgba};
}
/** Canonical palette key order; arrays retain their semantic order. */
export function serializePixelDocument(document: NativePixelDocument): string {
  const source = nativePixelDocumentSchema.parse(document);
  source.palette = Object.fromEntries(Object.entries(source.palette).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(source);
}
