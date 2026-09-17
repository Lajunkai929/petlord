import { describe, expect, it } from "vitest";
import { defaultDesktopSettings } from "./hooks/useDesktopSettings";

describe("desktop companion defaults", () => {
  it("starts interactive without forcing the pet above other windows", () => {
    expect(defaultDesktopSettings.settingsVersion).toBe(2);
    expect(defaultDesktopSettings.theme).toBe("light");
    expect(defaultDesktopSettings.alwaysOnTop).toBe(false);
    expect(defaultDesktopSettings.clickThrough).toBe(false);
    expect(defaultDesktopSettings.gazeTrackingArea).toBe("wide");
  });
});
