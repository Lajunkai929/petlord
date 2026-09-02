import { describe, expect, it, vi } from "vitest";
import { pixelIsOpaque } from "./usePetWindowHitTest";

function canvas(alpha: number) {
  return {
    width: 100,
    height: 100,
    getBoundingClientRect: () => ({ left: 10, top: 20, right: 110, bottom: 120, width: 100, height: 100 }),
    getContext: vi.fn(() => ({ getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, alpha]) })) })),
  } as unknown as HTMLCanvasElement;
}

describe("transparent pet hit testing", () => {
  it("allows clicks only on visible pet pixels", () => {
    expect(pixelIsOpaque(canvas(255), 60, 70)).toBe(true);
    expect(pixelIsOpaque(canvas(0), 60, 70)).toBe(false);
    expect(pixelIsOpaque(canvas(255), 4, 70)).toBe(false);
  });
});
