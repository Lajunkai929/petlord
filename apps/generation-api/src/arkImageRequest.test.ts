import { describe, expect, it } from "vitest";
import { normalizeArkImageRequest, normalizeArkImageSize } from "./arkImageRequest";

describe("Ark image request normalization", () => {
  it("maps Studio resolution labels to Seedream API values", () => {
    expect(normalizeArkImageSize("1K")).toBe("1024x1024");
    expect(normalizeArkImageSize("1K", "doubao-seedream-5-0-260128")).toBe("2k");
    expect(normalizeArkImageSize("2K")).toBe("2k");
    expect(normalizeArkImageSize("2048x2048")).toBe("2k");
  });

  it("preserves the rest of the request", () => {
    expect(normalizeArkImageRequest({ model: "doubao-seedream-5-0-260128", size: "1K" as const, prompt: "Lottery" })).toEqual({
      model: "doubao-seedream-5-0-260128",
      size: "2k",
      prompt: "Lottery",
    });
  });
});
