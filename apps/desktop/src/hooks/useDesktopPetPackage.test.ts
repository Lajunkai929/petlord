import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePetPackage, sameNamePackageTarget } from "./useDesktopPetPackage";

describe("desktop package loading", () => {
  it("accepts the deliverable package contract", () => {
    const contents = readFileSync(new URL("../../public/demo/sample.petlord", import.meta.url), "utf8");
    const bundle = parsePetPackage(contents);
    expect(bundle.manifest.characterName).toBe("Lottery");
    expect(bundle.manifest.initialStateId).toBe("variant-sitting-a");
  });

  it("accepts multiple installable versions of the same pet", () => {
    const first = parsePetPackage(readFileSync(new URL("../../public/demo/sample.petlord", import.meta.url), "utf8"));
    const second = parsePetPackage(readFileSync(new URL("../../public/demo/sample-v2.petlord", import.meta.url), "utf8"));
    expect(second.createdAt).not.toBe(first.createdAt);
    expect(second.manifest.id).not.toBe(first.manifest.id);
    expect(second.manifest.characterName).toBe("Lottery V2");
  });

  it("prefers replacing a same-name configuration on import", () => {
    const packages = [
      { key: "lottery.petlord", active: true, createdAt: "2026-09-02T00:00:00.000Z", id: "one", name: "Lottery 清透版", characterName: "Lottery", stateCount: 4, transitionCount: 6 },
      { key: "qiuqiu.petlord", active: false, createdAt: "2026-09-01T00:00:00.000Z", id: "two", name: "球球", characterName: "球球", stateCount: 4, transitionCount: 6 },
    ];
    expect(sameNamePackageTarget(" lottery 清透版 ", packages)?.key).toBe("lottery.petlord");
    expect(sameNamePackageTarget("新宠物", packages)).toBeUndefined();
  });
});
