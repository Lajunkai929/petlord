import { describe, expect, it, vi } from "vitest";
import { defaultStyleProfiles, mergeStyleProfiles } from "./styleLibrary";

describe("global style library", () => {
  it("excludes legacy project pixel prompts while keeping curated dual-channel styles", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000000" });
    const profiles = mergeStyleProfiles([], [
      { name: "像素项目", characterName: "Lottery", prompt: "16-bit pixel 像素宠物" },
      { name: "自然项目", characterName: "Lottery", prompt: "干净自然的宠物摄影" },
    ]);
    expect(profiles.some((profile) => profile.prompt === "干净自然的宠物摄影")).toBe(true);
    expect(profiles.some((profile) => profile.name === "像素项目 风格")).toBe(false);
    expect(profiles.some((profile) => profile.id === "style-cozy-farm-rpg-pixel" && profile.imagePrompt !== profile.videoPrompt)).toBe(true);
    const clear = profiles.find((profile) => profile.id === "style-clear-lively-2d")!;
    expect(clear.imagePrompt).not.toContain("Lottery");
    expect(clear.imagePrompt).not.toContain("棕色眉点");
    expect(clear.videoPrompt).toContain("真实光学质感");
    expect(clear.videoPrompt).not.toContain("体型比例");
    expect(clear.videoPrompt).not.toContain("{{characterName}}");
    expect(profiles).toEqual(expect.arrayContaining(defaultStyleProfiles));
    vi.unstubAllGlobals();
  });

  it("does not duplicate an existing prompt", () => {
    const first = defaultStyleProfiles[0];
    const profiles = mergeStyleProfiles([first], [{ name: "重复", characterName: "Lottery", prompt: first.prompt, imagePrompt: first.imagePrompt, videoPrompt: first.videoPrompt }]);
    expect(profiles.filter((profile) => profile.prompt === first.prompt)).toHaveLength(1);
  });

  it("turns a project-specific pet name into a reusable variable", () => {
    const profiles = mergeStyleProfiles([], [{
      name: "Lottery 实拍",
      characterName: "Lottery",
      prompt: "保持 Lottery 的真实毛色",
      videoPrompt: "Lottery 的眼睛逐帧稳定",
    }]);
    const collected = profiles.find((profile) => profile.name === "Lottery 实拍 风格")!;
    expect(collected.imagePrompt).toBe("保持 {{characterName}} 的真实毛色");
    expect(collected.videoPrompt).toBe("{{characterName}} 的眼睛逐帧稳定");
  });
});
