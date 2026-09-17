import { describe, it, expect } from "vitest";
import { renderPixelFrame } from "@petlord/pixel-art";
import { type NativePixelDocument } from "@petlord/schema";
import * as edit from "./pixelEditing";
const source: NativePixelDocument = {
  schemaVersion: 1,
  width: 3,
  height: 2,
  palette: { R: "#FF0000", B: "#0000FF" },
  frames: [
    {
      id: "base",
      layers: [
        { id: "body", x: 0, y: 0, rows: ["RRR", "RRR"] },
        { id: "eye", x: 1, y: 0, rows: ["B"] },
      ],
    },
    { id: "derived", baseFrameId: "base" },
  ],
};
describe("pixel editing", () => {
  it("clears an inherited top-layer cell and reveals the original lower red pixel", () => {
    const next = edit.paintPixel(source, "derived", "eye", 1, 0, ".");
    expect([...renderPixelFrame(next, "derived").rgba.slice(4, 8)]).toEqual([
      255, 0, 0, 255,
    ]);
    expect([...renderPixelFrame(source, "derived").rgba.slice(4, 8)]).toEqual([
      0, 0, 255, 255,
    ]);
    expect(next.frames[1].baseFrameId).toBe("base");
  });
  it("maps pointer coordinates to original pixels and rejects the outside edge", () => {
    expect(
      edit.canvasPixel(
        { left: 10, top: 20, width: 300, height: 200 },
        109,
        219,
        3,
        2,
      ),
    ).toEqual({ x: 0, y: 1 });
    expect(
      edit.canvasPixel(
        { left: 10, top: 20, width: 300, height: 200 },
        310,
        220,
        3,
        2,
      ),
    ).toBeNull();
  });
  it("applies a changed layer offset and visibility without touching its base frame", () => {
    const next = edit.updatePixelLayer(source, "derived", "eye", {
      x: 2,
      y: 1,
      visible: false,
    });
    expect([...renderPixelFrame(next, "derived").rgba.slice(4, 8)]).toEqual([
      255, 0, 0, 255,
    ]);
    expect(source.frames[0].layers?.[1].x).toBe(1);
    expect(() =>
      edit.updatePixelLayer(source, "derived", "eye", { x: 3 }),
    ).toThrow();
  });
  it("makes a transparent document and preserves palette color edits through import/export", () => {
    const doc = edit.createPixelDocument(2, 1);
    expect([...renderPixelFrame(doc, "frame-1").rgba]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(edit.importPixelDocument(JSON.stringify(source))).toEqual(source);
    expect(() => edit.importPixelDocument('{"schemaVersion":1}')).toThrow();
  });
});
it("resizes a layer without stretching pixels and fills new cells with transparency", () => {
  const next = edit.resizePixelLayer(source, "derived", "eye", 2, 2);
  expect([...renderPixelFrame(next, "derived").rgba]).toEqual([
    255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0,
    255, 255, 0, 0, 255,
  ]);
  expect(
    next.frames[1].layers?.find((layer) => layer.id === "eye")?.rows,
  ).toEqual(["B.", ".."]);
  expect(() => edit.resizePixelLayer(source, "derived", "eye", 3, 1)).toThrow();
});
