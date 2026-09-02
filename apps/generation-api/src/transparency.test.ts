import { describe, expect, it } from "vitest";
import { adaptiveAlphaExpression, alphaCoverage, detectBackgroundPalette } from "./transparency";

describe("adaptive video transparency", () => {
  it("learns dominant background chroma from the frame border instead of trusting a prompt color", () => {
    const width = 8;
    const height = 8;
    const bytes = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 3;
        const subject = x >= 2 && x <= 5 && y >= 2 && y <= 5;
        bytes.set(subject ? [30, 25, 22] : [138, 164, 96], offset);
      }
    }
    const palette = detectBackgroundPalette(bytes, width, height, 4);
    expect(palette[0]).toMatchObject({ count: expect.any(Number) });
    expect(palette[0]?.green).toBeGreaterThan(palette[0]?.red ?? 1);
    expect(adaptiveAlphaExpression(palette, 0.34)).toContain("r(X,Y)");
  });

  it("measures actual transparent pixels instead of trusting file metadata", () => {
    expect(alphaCoverage(new Uint8Array([
      0, 0, 0, 0,
      0, 0, 0, 8,
      0, 0, 0, 250,
      0, 0, 0, 255,
    ]))).toEqual({ transparentRatio: 0.5, opaqueRatio: 0.5 });
  });
});
