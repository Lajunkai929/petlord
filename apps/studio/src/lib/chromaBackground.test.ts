import { describe, expect, it } from "vitest";
import { chooseChromaBackgroundColor } from "./chromaBackground";

describe("automatic chroma background selection", () => {
  it("prefers green for black, brown and cream pets", () => {
    expect(chooseChromaBackgroundColor([
      { red: 24, green: 22, blue: 20, weight: 8 },
      { red: 132, green: 83, blue: 45, weight: 5 },
      { red: 231, green: 207, blue: 162, weight: 3 },
    ])).toBe("#00FF00");
  });

  it("moves away from green when green is part of the character palette", () => {
    expect(chooseChromaBackgroundColor([
      { red: 12, green: 238, blue: 28, weight: 10 },
      { red: 18, green: 92, blue: 35, weight: 4 },
    ])).not.toBe("#00FF00");
  });
});
