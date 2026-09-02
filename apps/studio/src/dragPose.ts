import { CHARACTER_NAME_PROMPT_VARIABLE } from "@petlord/generation";

export const dragPoseStateDescription = `${CHARACTER_NAME_PROMPT_VARIABLE} 以严格、完整的右侧视图呈现，鼻尖朝画面右侧，身体中轴与摄影机光轴垂直；主要只看见靠近摄影机一侧的眼睛、耳朵、前腿和后腿，禁止正面、三分之二视角或回头看镜头。一个画面外不可见的竖直提力轻轻拎住肩胛前方的后颈皮与鬃毛，而不是头顶、耳朵、项圈或背部；后颈受力点形成清楚稳定的轻微皮毛褶皱，作为鼠标拖拽锚点。身体自然悬空并受重力下垂，四只脚全部离地，胸腹、短腿和尾巴自然向下，神情放松、略微无奈但没有疼痛。画面只出现宠物，不出现人手、手指、手臂、绳子、夹子、挂钩、衣架、项圈、胸背或其他道具。保持形象身份、真实体型和毛色花纹，纯色无缝背景，无地面、投影和接触阴影。`;

export function dragPoseTransitionPrompt(sourceStateLabel: string) {
  return `${CHARACTER_NAME_PROMPT_VARIABLE} 从“${sourceStateLabel}”迅速而自然地进入被拎后颈的悬空姿态：摄影机保持固定，宠物身体绕竖直轴转为严格右侧视图，鼻尖朝画面右侧；画面外不可见的提力作用在肩胛前方的后颈皮与鬃毛，后颈受力点先向上移动，随后胸腹、四条腿和尾巴受重力自然垂落，四只脚全部离地。最终姿态必须与侧视权威参考一致，角色比例、脸型和毛色不变。不要出现人手、手指、手臂、绳子、夹子、挂钩、衣架、项圈、胸背或任何外力道具。`;
}

export function shouldRefreshDragPoseDescription(description: string) {
  const value = description.trim();
  if (!value) return true;
  return value.includes("悬空") && (value.includes("后颈") || value.includes("拎"));
}

export function shouldRefreshDragTransitionPrompt(prompt: string) {
  const value = prompt.trim();
  return !value
    || /^角色从.+自然转换到.+动作稳定且身份保持一致。$/.test(value)
    || value.includes("竖直悬空待机姿势")
    || (value.includes("悬空") && value.includes("后颈"));
}
