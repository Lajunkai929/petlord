import { describe, expect, it } from "vitest";
import {
  dragPoseStateDescription,
  dragPoseTransitionPrompt,
  shouldRefreshDragPoseDescription,
  shouldRefreshDragTransitionPrompt,
} from "./dragPose";

describe("drag pose prompts", () => {
  it("locks the authority image to a side view lifted from the scruff", () => {
    expect(dragPoseStateDescription).toContain("严格、完整的右侧视图");
    expect(dragPoseStateDescription).toContain("后颈皮与鬃毛");
    expect(dragPoseStateDescription).toContain("禁止正面、三分之二视角");
    expect(dragPoseStateDescription).toContain("不是头顶、耳朵、项圈或背部");
  });

  it("creates a generic transition prompt without embedding a character name", () => {
    const prompt = dragPoseTransitionPrompt("坐着");
    expect(prompt).toContain("{{characterName}}");
    expect(prompt).toContain("严格右侧视图");
    expect(prompt).not.toContain("Lottery");
  });

  it("only replaces empty, generic, or legacy drag descriptions", () => {
    expect(shouldRefreshDragPoseDescription("游戏角色式的悬空姿势，后颈形成锚点")).toBe(true);
    expect(shouldRefreshDragPoseDescription("自定义的飞行动作，保留披风细节")).toBe(false);
    expect(shouldRefreshDragTransitionPrompt("角色从坐着自然转换到被拎起，动作稳定且身份保持一致。")).toBe(true);
    expect(shouldRefreshDragTransitionPrompt("沿自定义弧线飞到左上角")).toBe(false);
  });
});
