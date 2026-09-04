import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("../electron/main.cjs", import.meta.url), "utf8");

describe("desktop application lifecycle", () => {
  it("keeps one application instance and raises settings on a second launch", () => {
    expect(mainSource).toContain("app.requestSingleInstanceLock()");
    expect(mainSource).toContain('app.on("second-instance", () => showSettings())');
  });

  it("keeps the macOS Dock entry and menu-bar recovery actions available", () => {
    expect(mainSource).toContain("await app.dock?.show()");
    expect(mainSource).not.toContain("app.dock?.hide()");
    expect(mainSource).toContain('{ label: "打开设置", click: () => showSettings() }');
    expect(mainSource).toContain('{ label: "显示宠物", click: () => mainWindow?.showInactive() }');
  });
});
