import { describe, expect, it } from "vitest";
import { buildStablePixelPalette, pixelArtGridSize, pixelArtPaletteSize, quantizePixelArtPixels, renderPixelArtPixels } from "./pixelArtRenderer";

describe("pixel art renderer", () => {
  it("uses a deliberately coarse grid instead of merely lowering canvas quality", () => {
    expect(pixelArtGridSize(96, 24)).toBe(24);
    expect(pixelArtGridSize(96, 48)).toBe(48);
    expect(pixelArtGridSize(480, 96)).toBe(96);
  });

  it("builds a small adaptive palette and hardens alpha", () => {
    const source = new Uint8ClampedArray(Array.from({ length: 16 }, (_, pixel) => [pixel * 13, 70 + pixel * 5, 28 + pixel * 4, 255]).flat());
    const palette = buildStablePixelPalette(source, 6);
    expect(palette.length).toBeLessThanOrEqual(6);
    const withTransparency = new Uint8ClampedArray([...source.slice(0, 4), 236, 210, 181, 20]);
    const output = renderPixelArtPixels(withTransparency, 2, 1, { outline: false }).pixels;
    expect(output[3]).toBe(255);
    expect([...output.slice(4, 8)]).toEqual([0, 0, 0, 0]);
  });

  it("reserves palette colors for rare dark outlines and bright eye highlights", () => {
    const common = Array.from({ length: 80 }, () => [128, 92, 58, 255]).flat();
    const source = new Uint8ClampedArray([...common, 12, 10, 9, 255, 54, 48, 42, 255, 248, 244, 226, 255]);
    const palette = buildStablePixelPalette(source, 4);
    expect(palette.some(([red, green, blue]) => red < 20 && green < 20 && blue < 20)).toBe(true);
    expect(palette.some(([red, green, blue]) => red > 40 && red < 80 && green > 35 && green < 70 && blue < 60)).toBe(true);
    expect(palette.some(([red, green, blue]) => red > 240 && green > 235 && blue > 220)).toBe(true);
  });

  it("keeps enough palette room for dark fur, eye mask, pupil, iris and highlight", () => {
    expect(pixelArtPaletteSize).toBeGreaterThanOrEqual(16);
    const facialColors = [
      [10, 10, 12, 255],
      [36, 35, 42, 255],
      [68, 61, 64, 255],
      [137, 75, 38, 255],
      [238, 179, 101, 255],
      [252, 244, 214, 255],
    ];
    const source = new Uint8ClampedArray(facialColors.flatMap((color) => Array.from({ length: 4 }, () => color).flat()));
    const palette = buildStablePixelPalette(source, pixelArtPaletteSize);
    expect(palette).toHaveLength(facialColors.length);
    expect(palette.map((color) => color.join(","))).toEqual(expect.arrayContaining(facialColors.map((color) => color.slice(0, 3).join(","))));
  });

  it("adds a single crisp outline around a transparent character silhouette", () => {
    const source = new Uint8ClampedArray(3 * 3 * 4);
    const center = (1 * 3 + 1) * 4;
    source.set([180, 120, 80, 255], center);
    const output = quantizePixelArtPixels(source, 3, 3);
    expect(output[center + 3]).toBe(255);
    expect(output[3]).toBe(255);
    expect(output[0]).toBeLessThan(output[center]);
  });

  it("keeps near-threshold video colors on the previous palette index to reduce shimmer", () => {
    const palette = [[35, 30, 25], [155, 105, 70]] as const;
    const first = renderPixelArtPixels(new Uint8ClampedArray([100, 70, 48, 255]), 1, 1, { palette: [...palette] });
    const second = renderPixelArtPixels(new Uint8ClampedArray([104, 73, 50, 255]), 1, 1, { palette: [...palette], previousIndices: first.indices });
    expect(second.indices[0]).toBe(first.indices[0]);
    expect([...second.pixels]).toEqual([...first.pixels]);
  });

  it("uses alpha hysteresis so a moving cutout edge does not flicker", () => {
    const palette = [[35, 30, 25], [155, 105, 70]] as const;
    const first = renderPixelArtPixels(new Uint8ClampedArray([150, 100, 68, 255]), 1, 1, { palette: [...palette] });
    const unstableEdge = renderPixelArtPixels(new Uint8ClampedArray([150, 100, 68, 60]), 1, 1, { palette: [...palette], previousIndices: first.indices });
    const newEdge = renderPixelArtPixels(new Uint8ClampedArray([150, 100, 68, 60]), 1, 1, { palette: [...palette] });
    expect(unstableEdge.pixels[3]).toBe(255);
    expect(newEdge.pixels[3]).toBe(0);
  });

  it("removes isolated low-contrast mosaic specks but preserves high-contrast facial marks", () => {
    const palette = [[30, 30, 28], [105, 98, 88], [122, 112, 100]] as const;
    const source = new Uint8ClampedArray(3 * 3 * 4);
    for (let pixel = 0; pixel < 9; pixel += 1) source.set([105, 98, 88, 255], pixel * 4);
    source.set([122, 112, 100, 255], 4 * 4);
    const cleaned = renderPixelArtPixels(source, 3, 3, { palette: [...palette], outline: false });
    expect(cleaned.indices[4]).toBe(1);

    source.set([30, 30, 28, 255], 4 * 4);
    const facialMark = renderPixelArtPixels(source, 3, 3, { palette: [...palette], outline: false });
    expect(facialMark.indices[4]).toBe(0);
  });
});
