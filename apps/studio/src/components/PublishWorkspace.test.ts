import { describe, expect, it } from "vitest";
import { localApplyPresentation } from "./PublishWorkspace";

describe("local apply presentation", () => {
  it("labels active, inactive-linked, and new projects by the runtime switch they perform", () => {
    const base = { available: true, currentRevision: 9, hasDraftChanges: true, exists: true };
    expect(localApplyPresentation({ ...base, linked: true, active: true }, true).label).toBe("更新本机宠物");
    expect(localApplyPresentation({ ...base, linked: true, active: false }, true).label).toBe("更新并在本机使用");
    expect(localApplyPresentation({ ...base, linked: false, active: false, exists: false }, true).label).toBe("在本机使用");
  });

  it("gives standalone web users a desktop-specific next step", () => {
    expect(localApplyPresentation(undefined, false)).toEqual({
      label: "在桌面应用中使用",
      disabled: true,
      message: "请在 PetLord 桌面应用中打开 Studio，即可直接更新本机宠物。",
    });
  });

  it("does not offer to recreate a linked installation whose key disappeared", () => {
    expect(localApplyPresentation({
      available: true,
      linked: true,
      packageKey: "missing.petlord",
      currentRevision: 9,
      appliedRevision: 7,
      hasDraftChanges: true,
      exists: false,
      active: false,
    }, true)).toMatchObject({ disabled: true, label: "关联宠物已不存在" });
  });
});
