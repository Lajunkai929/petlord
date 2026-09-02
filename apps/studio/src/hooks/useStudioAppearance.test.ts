import { describe, expect, it } from "vitest";
import { normalizeStudioFontSize, studioFontSizeOptions } from "./useStudioAppearance";

describe("studio appearance preferences", () => {
  it("offers three ordered font sizes and defaults invalid storage to standard", () => {
    expect(studioFontSizeOptions.map((option) => option.value)).toEqual(["compact", "standard", "large"]);
    expect(normalizeStudioFontSize("compact")).toBe("compact");
    expect(normalizeStudioFontSize("large")).toBe("large");
    expect(normalizeStudioFontSize("legacy-value")).toBe("standard");
    expect(normalizeStudioFontSize(null)).toBe("standard");
  });
});
