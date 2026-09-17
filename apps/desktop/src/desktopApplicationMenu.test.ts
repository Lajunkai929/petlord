import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("desktop application menu", () => {
  it("installs discoverable settings, Studio, and pet recovery actions", () => {
    const { installApplicationMenu } = require("../electron/application-menu.cjs") as {
      installApplicationMenu(options: Record<string, unknown>): unknown;
    };
    const actions: string[] = [];
    let installedMenu: unknown;
    const Menu = {
      buildFromTemplate(template: unknown) { return { template }; },
      setApplicationMenu(menu: unknown) { installedMenu = menu; },
    };

    const template = installApplicationMenu({
      Menu,
      appName: "PetLord",
      isMac: true,
      showSettings: () => actions.push("settings"),
      showStudio: () => actions.push("studio"),
      showPet: () => actions.push("pet"),
    }) as Array<{ label?: string; role?: string; submenu?: Array<{ label?: string; accelerator?: string; click?: () => void }> }>;

    expect(installedMenu).toEqual({ template });
    expect(template).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "fileMenu" }),
      expect.objectContaining({ role: "viewMenu" }),
      expect.objectContaining({ role: "editMenu" }),
      expect.objectContaining({ role: "windowMenu" }),
    ]));
    const applicationMenu = template[0].submenu ?? [];
    const settings = applicationMenu.find((item) => item.label === "设置…");
    const studio = applicationMenu.find((item) => item.label === "打开 Studio");
    const pet = applicationMenu.find((item) => item.label === "显示宠物");
    expect(settings?.accelerator).toBe("CmdOrCtrl+,");
    settings?.click?.();
    studio?.click?.();
    pet?.click?.();
    expect(actions).toEqual(["settings", "studio", "pet"]);
  });
});
