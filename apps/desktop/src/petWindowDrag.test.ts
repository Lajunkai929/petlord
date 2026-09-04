import { describe, expect, it } from "vitest";
import { normalizedPointerAnchor, petWindowPositionForAnchor } from "./petWindowDrag";

describe("petWindowPositionForAnchor", () => {
  it("moves the operating-system window so the configured pet anchor stays under the pointer", () => {
    expect(petWindowPositionForAnchor(
      { x: 900, y: 520 },
      { left: 18, top: 72, width: 320, height: 320 },
      { x: 0.46, y: 0.28 },
    )).toEqual({ x: 735, y: 358 });
  });

  it("supports screens whose desktop coordinates are negative", () => {
    expect(petWindowPositionForAnchor(
      { x: -260, y: 240 },
      { left: 12, top: 56, width: 240, height: 240 },
      { x: 0.5, y: 0.25 },
    )).toEqual({ x: -392, y: 124 });
  });

  it("uses the exact grab point as the fallback anchor for free positioning", () => {
    expect(normalizedPointerAnchor(
      { x: 178, y: 312 },
      { left: 18, top: 72, width: 320, height: 320 },
    )).toEqual({ x: 0.5, y: 0.75 });
  });
});
