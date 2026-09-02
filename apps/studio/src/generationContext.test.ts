import { describe, expect, it } from "vitest";
import { createBlankIdentityProfile, createBlankProject } from "./projectTemplate";
import { resolveProjectGenerationContext } from "./generationContext";
import type { StyleProfile } from "./styleLibrary";

const input = {
  customerName: "",
  contact: "",
  characterName: "旧名字",
  quotedPriceCny: 0,
  depositCny: 0,
  revisionLimit: 0,
  notes: "",
};

function style(): StyleProfile {
  const timestamp = "2026-09-02T00:00:00.000Z";
  return {
    id: "style-test",
    name: "测试风格",
    definitionVersion: 1,
    description: "",
    prompt: "{{characterName}} 的图片风格",
    imagePrompt: "{{characterName}} 的图片风格",
    videoPrompt: "锁定 {{characterName}} 的视频风格",
    experimentBudgetCny: 30,
    revisions: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe("project generation context", () => {
  it("uses live identity and style profiles instead of stale project prompt copies", () => {
    const identity = createBlankIdentityProfile("球球");
    identity.identityPrompt = "{{characterName}} 的全局形象特征";
    const profile = style();
    const project = createBlankProject({ ...input, identityProfileId: identity.id, styleProfileId: profile.id }, identity);
    project.characterName = "过期名字";
    project.identityPrompt = "过期项目身份";
    project.imageStylePrompt = "过期项目图片风格";
    project.videoStylePrompt = "过期项目视频风格";

    const context = resolveProjectGenerationContext(project, [identity], [profile]);

    expect(context.characterName).toBe("球球");
    expect(context.identityPrompt).toBe("球球 的全局形象特征");
    expect(context.imageStylePrompt).toBe("球球 的图片风格");
    expect(context.videoStylePrompt).toBe("锁定 球球 的视频风格");
  });
});
