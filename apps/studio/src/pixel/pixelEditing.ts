import {
  nativePixelDocumentSchema,
  type NativePixelDocument,
  type NativePixelLayer,
  type NativePixelFrame,
} from "@petlord/schema";
import { resolvePixelFrame } from "@petlord/pixel-art";
export function createPixelDocument(
  width = 48,
  height = 48,
): NativePixelDocument {
  return nativePixelDocumentSchema.parse({
    schemaVersion: 1,
    width,
    height,
    palette: { o: "#2B252D", b: "#76503E", g: "#E8B975", c: "#FFF0C5" },
    frames: [
      {
        id: "frame-1",
        layers: [
          {
            id: "body",
            x: 0,
            y: 0,
            rows: Array.from({ length: height }, () => ".".repeat(width)),
          },
        ],
      },
    ],
  });
}
export function importPixelDocument(text: string): NativePixelDocument {
  if (text.length > 8_388_608) throw new Error("像素文档超过 8 MB。");
  return nativePixelDocumentSchema.parse(JSON.parse(text));
}
export function replacePixelFrame(
  document: NativePixelDocument,
  frame: NativePixelFrame,
): NativePixelDocument {
  return nativePixelDocumentSchema.parse({
    ...document,
    frames: document.frames.some((item) => item.id === frame.id)
      ? document.frames.map((item) => (item.id === frame.id ? frame : item))
      : [...document.frames, frame],
  });
}
export function updatePixelLayer(
  document: NativePixelDocument,
  frameId: string,
  layerId: string,
  patch: Partial<NativePixelLayer>,
): NativePixelDocument {
  const frame = document.frames.find((item) => item.id === frameId);
  const layer = resolvePixelFrame(document, frameId).layers.find(
    (item) => item.id === layerId,
  );
  if (!frame || !layer) throw new Error("请选择有效图层。");
  const next = { ...layer, ...patch, id: layerId };
  const layers = frame.layers?.some((item) => item.id === layerId)
    ? frame.layers.map((item) => (item.id === layerId ? next : item))
    : [...(frame.layers ?? []), next];
  return replacePixelFrame(document, {
    ...frame,
    layers,
    patches: frame.patches?.filter((item) => item.layerId !== layerId),
  });
}
export function paintPixel(
  document: NativePixelDocument,
  frameId: string,
  layerId: string,
  x: number,
  y: number,
  key: string,
): NativePixelDocument {
  const layer = resolvePixelFrame(document, frameId).layers.find(
    (item) => item.id === layerId,
  );
  if (!layer || layer.visible === false)
    throw new Error("请选择可见图层后绘制。");
  const localX = x - layer.x,
    localY = y - layer.y;
  if (
    localX < 0 ||
    localY < 0 ||
    localY >= layer.rows.length ||
    localX >= layer.rows[0].length
  )
    return document;
  if (layer.rows[localY][localX] === key) return document;
  const rows = [...layer.rows];
  rows[localY] =
    rows[localY].slice(0, localX) + key + rows[localY].slice(localX + 1);
  return updatePixelLayer(document, frameId, layerId, { rows });
}
export function canvasPixel(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
  width: number,
  height: number,
) {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.floor(((clientX - rect.left) * width) / rect.width),
    y = Math.floor(((clientY - rect.top) * height) / rect.height);
  return x < 0 || y < 0 || x >= width || y >= height ? null : { x, y };
}
export function resizePixelLayer(
  document: NativePixelDocument,
  frameId: string,
  layerId: string,
  width: number,
  height: number,
): NativePixelDocument {
  const layer = resolvePixelFrame(document, frameId).layers.find(
    (item) => item.id === layerId,
  );
  if (
    !layer ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width + layer.x > document.width ||
    height + layer.y > document.height
  )
    throw new Error("图层尺寸必须为画布内的正整数。");
  const rows = Array.from({ length: height }, (_, y) =>
    (layer.rows[y] ?? "").slice(0, width).padEnd(width, "."),
  );
  return updatePixelLayer(document, frameId, layerId, { rows });
}
