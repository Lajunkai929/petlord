import type { CharacterProject, LogicalState, StateVariant, Transition, TransitionTrigger } from "@petlord/schema";
import { CHARACTER_NAME_PROMPT_VARIABLE, materializePromptVariables, templateCharacterNamePrompt } from "@petlord/generation";

export const projectStateBlueprints = [
  { id: "state-sitting", label: "坐着", key: "idle", description: "安静坐着并看向用户", x: 80, y: 210 },
  { id: "state-lying", label: "趴着", key: "rest", description: "身体放低，舒服地趴在地上", x: 420, y: 80 },
  { id: "state-sleeping", label: "睡觉", key: "sleep", description: "侧卧蜷缩并闭眼熟睡", x: 760, y: 80 },
  { id: "state-belly", label: "翻肚皮", key: "play", description: "仰躺露出肚皮，前爪自然弯曲", x: 760, y: 340 },
  { id: "state-eating", label: "吃饭", key: "eat", description: "低头从小碗里专心吃饭", x: 420, y: 470 },
  { id: "state-bowing", label: "鞠躬", key: "greet", description: "前腿伸展、胸口放低做礼貌鞠躬", x: 80, y: 470 },
  { id: "state-happy", label: "开心摇尾巴", key: "happy", description: "开心地轻轻摇尾巴并看向用户", x: 1100, y: 150 },
  { id: "state-cuddle", label: "求摸摸", key: "cuddle", description: "靠近用户并抬头期待被摸", x: 1100, y: 410 },
] as const;

type StateKey = typeof projectStateBlueprints[number]["key"];

const fullRegion = { shape: "ellipse" as const, x: 0.04, y: 0.04, width: 0.92, height: 0.92 };
const headRegion = { shape: "ellipse" as const, x: 0.05, y: 0.02, width: 0.48, height: 0.5 };
const bellyRegion = { shape: "ellipse" as const, x: 0.24, y: 0.3, width: 0.54, height: 0.48 };
const tailRegion = { shape: "ellipse" as const, x: 0.69, y: 0.43, width: 0.28, height: 0.42 };

function trigger(id: string, value: Omit<TransitionTrigger, "id">): TransitionTrigger {
  return { id: `template-trigger-${id}`, ...value };
}

interface TransitionBlueprint {
  id: string;
  label: string;
  from: StateKey;
  to: StateKey;
  prompt: (characterName: string) => string;
  triggers?: TransitionTrigger[];
  idleRule?: Transition["idleRule"];
  durationSeconds?: number;
  endFrameSource?: Transition["endFrameSource"];
  guidanceKeys?: StateKey[];
}

export interface SavedProjectTemplateState {
  id: string;
  label: string;
  semanticKey?: string;
  description: string;
  position: LogicalState["position"];
  idleScheduler: LogicalState["idleScheduler"];
  pointerGaze?: LogicalState["pointerGaze"];
}

export interface SavedProjectTemplateTransition {
  id: string;
  label: string;
  fromStateId: string;
  toStateId: string;
  guidanceStateIds: string[];
  promptTemplate: string;
  triggers: TransitionTrigger[];
  idleRule?: Transition["idleRule"];
  durationMs: number;
  entryBlendMs?: number;
  durationMode: Transition["durationMode"];
  durationSeconds?: number;
  endFrameSource: Transition["endFrameSource"];
  transparentVideo: boolean;
  transparencyProcessing: Transition["transparencyProcessing"];
  authorityBridge: Transition["authorityBridge"];
  playback?: Transition["playback"];
}

export interface SavedProjectTemplate {
  kind: "custom";
  id: string;
  name: string;
  description: string;
  sourceProjectName: string;
  sourceCharacterName?: string;
  states: SavedProjectTemplateState[];
  transitions: SavedProjectTemplateTransition[];
  dragInteraction?: CharacterProject["dragInteraction"];
  plugins: CharacterProject["plugins"];
  createdAt: string;
  updatedAt: string;
}

const companionTransitions: TransitionBlueprint[] = [
  { id: "rest-sleep", label: "趴着 30 秒后睡觉", from: "rest", to: "sleep", prompt: (name) => `${name} 趴着逐渐犯困，眼皮缓慢合上，头轻轻落到前爪上，身体自然蜷缩进入熟睡。动作慵懒、连续、低幅度。`, triggers: [trigger("rest-sleep", { event: "inactivity", enabled: true, timerDurationMs: 30_000 })] },
  { id: "rest-ear", label: "趴着呼吸、动耳朵", from: "rest", to: "rest", prompt: (name) => `${name} 保持趴姿和身体稳定，胸腹持续轻微呼吸，两只耳朵先后轻轻抖动，眼睛短暂跟随用户，最后回到完全相同的趴姿。`, triggers: [trigger("head-click", { event: "left-click", enabled: true, region: headRegion })], idleRule: { enabled: true, weight: 5, cooldownMs: 0 }, endFrameSource: "source-frame" },
  { id: "rest-belly", label: "双击肚皮翻身", from: "rest", to: "play", prompt: (name) => `${name} 开心地从趴姿向侧面翻滚，再平稳翻到背上露出柔软肚皮，四只爪自然抬起；四肢长度、粗细和毛发必须严格继承当前形象参考。`, triggers: [trigger("belly-double", { event: "double-click", enabled: true, region: bellyRegion })] },
  { id: "rest-sit", label: "点击尾巴坐起来", from: "rest", to: "idle", prompt: (name) => `${name} 的尾巴被点击后轻轻摆动，前腿撑起身体，后腿收拢，稳稳坐起并看向用户。`, triggers: [trigger("tail-click", { event: "left-click", enabled: true, region: tailRegion })] },
  { id: "belly-wiggle", label: "翻肚皮持续呼吸、左右晃", from: "play", to: "play", prompt: (name) => `${name} 保持仰躺露肚皮，胸腹持续轻微呼吸，开心地左右轻轻晃动身体和四只爪，幅度小而有节奏，最后回到同一源帧；四肢长度、粗细和毛发必须严格继承当前形象参考。`, triggers: [trigger("belly-hover", { event: "hover", enabled: true, hoverDurationMs: 500, repeatWhileHovered: true, region: fullRegion })], idleRule: { enabled: true, weight: 5, cooldownMs: 0 }, endFrameSource: "source-frame" },
  { id: "belly-rest", label: "鼠标移开翻回趴着", from: "play", to: "rest", prompt: (name) => `${name} 察觉鼠标离开后停止晃动，从仰躺姿势向侧面翻身，四爪落地，平稳回到抬头趴着。`, triggers: [trigger("belly-leave", { event: "pointer-leave", enabled: true })] },
  { id: "sit-rest", label: "坐着 30 秒后或双击后趴下", from: "idle", to: "rest", prompt: (name) => `${name} 安静坐了一会儿后放松身体，前爪向前伸，胸口和腹部缓慢落下，变成舒适趴姿。`, triggers: [
    trigger("sit-rest", { event: "inactivity", enabled: true, timerDurationMs: 30_000 }),
    trigger("sit-double-rest", { event: "double-click", enabled: true, region: fullRegion }),
  ] },
  { id: "sit-blink", label: "坐着呼吸、眨眼和动耳朵", from: "idle", to: "idle", prompt: (name) => `${name} 坐姿和身体位置保持稳定，胸腹持续轻微呼吸，自然眨眼两次，耳尖轻微响应，最后回到完全相同的坐姿。`, triggers: [
    trigger("sit-click", { event: "left-click", enabled: true, region: fullRegion }),
  ], idleRule: { enabled: true, weight: 5, cooldownMs: 0 }, endFrameSource: "source-frame" },
  { id: "sleep-breathe", label: "睡觉呼吸起伏", from: "sleep", to: "sleep", prompt: (name) => `${name} 熟睡不醒，胸腹持续缓慢呼吸并轻微起伏，耳朵和爪子保持放松，最后回到同一睡姿。`, idleRule: { enabled: true, weight: 50, cooldownMs: 0 }, endFrameSource: "source-frame" },
  { id: "sleep-dream", label: "睡觉偶尔蹬腿吧嗒嘴", from: "sleep", to: "sleep", prompt: (name) => `${name} 仍闭眼熟睡，像做梦一样一只后腿轻轻蹬两下，嘴巴小幅吧嗒一下，随后完全放松回到源睡姿。`, idleRule: { enabled: true, weight: 1, cooldownMs: 30_000 }, endFrameSource: "source-frame" },
  { id: "sleep-wake", label: "双击睡醒拉伸后趴下", from: "sleep", to: "rest", prompt: (name) => `${name} 被双击后慢慢睁眼，抬头迷糊地看向用户，站起做一次前腿伸展和礼貌鞠躬，打个小哈欠，最后慵懒地重新趴下。`, triggers: [trigger("sleep-double", { event: "double-click", enabled: true, region: fullRegion })], durationSeconds: 5, guidanceKeys: ["greet"] },
  { id: "rest-greet", label: "新增待办后起身鞠躬", from: "rest", to: "greet", prompt: (name) => `${name} 听到新的待办后从趴姿轻快站起，前腿向前伸展、胸口放低，朝用户做一次可爱克制的鞠躬。` },
  { id: "greet-rest", label: "鞠躬后自动趴回", from: "greet", to: "rest", prompt: (name) => `${name} 完成鞠躬后抬起胸口，前爪向后收回，缓慢放松身体并回到抬头趴着。`, triggers: [trigger("greet-return", { event: "state-timeout", enabled: true, timerDurationMs: 1_500 })] },
];

const starterTransitionIds = new Set(["rest-sleep", "rest-ear", "rest-sit", "sit-rest", "sit-blink", "sleep-breathe", "sleep-dream", "sleep-wake", "rest-greet", "greet-rest"]);
const starterTransitions = companionTransitions.filter((transition) => starterTransitionIds.has(transition.id));

const completeTransitions: TransitionBlueprint[] = [
  ...companionTransitions,
  { id: "rest-eat", label: "右键呼出饭碗", from: "rest", to: "eat", prompt: (name) => `${name} 听到饭碗出现的声音后精神起来，平稳靠近小碗，低头开始专心吃饭。`, triggers: [trigger("rest-eat", { event: "right-click", enabled: true, region: fullRegion })] },
  { id: "eat-chew", label: "吃饭咀嚼与舔嘴", from: "eat", to: "eat", prompt: (name) => `${name} 保持低头吃饭的姿势，小口咀嚼并偶尔舔嘴，身体与饭碗位置稳定，最后回到同一吃饭姿势。`, idleRule: { enabled: true, weight: 5, cooldownMs: 0 }, endFrameSource: "source-frame" },
  { id: "eat-rest", label: "吃完回到趴着", from: "eat", to: "rest", prompt: (name) => `${name} 吃完最后一口，舔舔嘴，抬头离开饭碗并舒服地趴回原位。`, triggers: [trigger("eat-rest", { event: "state-timeout", enabled: true, timerDurationMs: 15_000 })] },
  { id: "sit-happy", label: "点击后开心摇尾巴", from: "idle", to: "happy", prompt: (name) => `${name} 被点击后眼神变得开心，保持身体重心稳定并明显摇起尾巴，呈现热情但不过度跳动的状态。`, triggers: [trigger("sit-happy", { event: "left-click", enabled: true, region: headRegion })] },
  { id: "happy-wag", label: "开心持续摇尾巴", from: "happy", to: "happy", prompt: (name) => `${name} 保持开心姿势，稳定呼吸并持续自然摇尾巴，偶尔眨眼，最后回到同一姿势。`, idleRule: { enabled: true, weight: 8, cooldownMs: 0 }, endFrameSource: "source-frame" },
  { id: "happy-rest", label: "开心后恢复趴着", from: "happy", to: "rest", prompt: (name) => `${name} 逐渐放慢摇尾巴，前爪向前伸展，平稳放低身体回到舒服趴姿。`, triggers: [trigger("happy-rest", { event: "inactivity", enabled: true, timerDurationMs: 20_000 })] },
  { id: "rest-cuddle", label: "悬停头部后求摸摸", from: "rest", to: "cuddle", prompt: (name) => `${name} 察觉用户在头部停留，抬头靠近并露出期待被抚摸的表情，动作温柔自然。`, triggers: [trigger("rest-cuddle", { event: "hover", enabled: true, hoverDurationMs: 1_000, region: headRegion })] },
  { id: "cuddle-nuzzle", label: "求摸摸轻蹭", from: "cuddle", to: "cuddle", prompt: (name) => `${name} 保持靠近用户的姿势，轻轻蹭动脑袋、眨眼并稳定呼吸，最后回到同一求摸摸姿势。`, triggers: [trigger("cuddle-hover", { event: "hover", enabled: true, hoverDurationMs: 400, repeatWhileHovered: true, region: headRegion })], idleRule: { enabled: true, weight: 6, cooldownMs: 0 }, endFrameSource: "source-frame" },
  { id: "cuddle-rest", label: "鼠标移开后趴回", from: "cuddle", to: "rest", prompt: (name) => `${name} 察觉用户离开后停止轻蹭，缓慢退回并重新舒服地趴下。`, triggers: [trigger("cuddle-leave", { event: "pointer-leave", enabled: true })] },
];

export const projectTemplates = [
  { kind: "builtin", id: "blank", name: "空白项目", description: "不预置任何状态和连线，从零开始自由编排。", stateKeys: [] as StateKey[], transitions: [] as TransitionBlueprint[] },
  { kind: "builtin", id: "starter", name: "四状态风格验证", description: "坐着、趴着、睡觉、鞠躬；覆盖静态图、待机循环、状态转换与插件动作。", stateKeys: ["idle", "rest", "sleep", "greet"] as StateKey[], transitions: starterTransitions },
  { kind: "builtin", id: "companion", name: "基础陪伴桌宠", description: "坐着、趴着、睡觉、翻肚皮、鞠躬；包含随机待机与 13 条常用交互。", stateKeys: ["idle", "rest", "sleep", "play", "greet"] as StateKey[], transitions: companionTransitions },
  { kind: "builtin", id: "complete", name: "完整日常互动", description: "八个状态、吃饭与求摸摸等完整交互；适合直接自动化制作。", stateKeys: projectStateBlueprints.map((state) => state.key), transitions: completeTransitions },
] as const;

export type ProjectTemplateId = typeof projectTemplates[number]["id"];
export type BuiltinProjectTemplate = typeof projectTemplates[number];
export type ProjectTemplateDefinition = BuiltinProjectTemplate | SavedProjectTemplate;

export function templateSourceVariantId(stateId: string) {
  return `template-source-${stateId}`;
}

export function templateGuidanceArtifactId(stateId: string) {
  return `template-guidance-${stateId}`;
}

export function sourceStateIdFromVariant(project: CharacterProject, fromVariantId: string) {
  return project.variants.find((variant) => variant.id === fromVariantId)?.logicalStateId
    ?? (fromVariantId.startsWith("template-source-") ? fromVariantId.slice("template-source-".length) : undefined);
}

function renderPromptTemplate(promptTemplate: string, characterName: string) {
  return materializePromptVariables(promptTemplate, characterName);
}

function anonymizePrompt(prompt: string, characterName: string) {
  return templateCharacterNamePrompt(prompt, characterName);
}

export function templateStateCount(template: ProjectTemplateDefinition) {
  return template.kind === "custom" ? template.states.length : template.stateKeys.length;
}

export function templateStateLabels(template: ProjectTemplateDefinition) {
  if (template.kind === "custom") return template.states.map((state) => state.label);
  const stateKeys = new Set<string>(template.stateKeys);
  return projectStateBlueprints.filter((state) => stateKeys.has(state.key)).map((state) => state.label);
}

export function templateTransitionPreviews(template: ProjectTemplateDefinition, characterName: string) {
  if (template.kind === "custom") {
    return template.transitions.map((transition) => ({ id: transition.id, label: transition.label, prompt: renderPromptTemplate(transition.promptTemplate, characterName) }));
  }
  return template.transitions.map((transition) => ({ id: transition.id, label: transition.label, prompt: transition.prompt(characterName) }));
}

export function saveProjectAsTemplate(project: CharacterProject, name: string, description: string): SavedProjectTemplate {
  const timestamp = new Date().toISOString();
  const stateIds = new Set(project.logicalStates.map((state) => state.id));
  const artifactState = new Map<string, string>();
  for (const state of project.logicalStates) {
    for (const artifactId of [state.referenceArtifactId, ...(state.referenceArtifactIds ?? [])]) {
      if (artifactId) artifactState.set(artifactId, state.id);
    }
  }
  const transitions = project.transitions.flatMap((transition, index): SavedProjectTemplateTransition[] => {
    const fromStateId = sourceStateIdFromVariant(project, transition.fromVariantId);
    if (!fromStateId || !stateIds.has(fromStateId) || !stateIds.has(transition.toLogicalStateId)) return [];
    return [{
      id: `edge-${index + 1}`,
      label: transition.label,
      fromStateId,
      toStateId: transition.toLogicalStateId,
      guidanceStateIds: [...new Set((transition.guidanceArtifactIds ?? []).map((id) => artifactState.get(id)).filter((id): id is string => Boolean(id)))],
      promptTemplate: anonymizePrompt(transition.prompt, project.characterName),
      triggers: structuredClone(transition.triggers),
      idleRule: transition.idleRule ? structuredClone(transition.idleRule) : undefined,
      durationMs: transition.durationMs,
      entryBlendMs: transition.entryBlendMs,
      durationMode: transition.durationMode,
      durationSeconds: transition.durationSeconds,
      endFrameSource: transition.endFrameSource,
      transparentVideo: transition.transparentVideo,
      transparencyProcessing: structuredClone(transition.transparencyProcessing),
      authorityBridge: structuredClone(transition.authorityBridge),
      playback: transition.playback ? structuredClone(transition.playback) : undefined,
    }];
  });
  return {
    kind: "custom",
    id: `custom-template-${crypto.randomUUID()}`,
    name: name.trim(),
    description: description.trim(),
    sourceProjectName: project.name,
    sourceCharacterName: project.characterName,
    states: project.logicalStates.map((state) => ({
      id: state.id,
      label: state.label,
      semanticKey: state.semanticKey,
      description: anonymizePrompt(state.description, project.characterName),
      position: structuredClone(state.position),
      idleScheduler: structuredClone(state.idleScheduler),
      pointerGaze: state.pointerGaze ? structuredClone(state.pointerGaze) : undefined,
    })),
    transitions,
    dragInteraction: project.dragInteraction ? structuredClone(project.dragInteraction) : undefined,
    plugins: structuredClone(project.plugins),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function logicalState(input: typeof projectStateBlueprints[number]): LogicalState {
  const hasIdleAnimation = ["idle", "rest", "sleep", "play", "eat", "happy", "cuddle"].includes(input.key);
  return {
    id: input.id,
    label: input.label,
    semanticKey: input.key,
    description: input.description,
    position: { x: input.x, y: input.y },
    referenceArtifactIds: [],
    idleScheduler: {
      enabled: hasIdleAnimation,
      playbackMode: "interval",
      strategy: "weighted-random",
      minIntervalMs: 10_000,
      maxIntervalMs: 30_000,
      avoidImmediateRepeat: input.key !== "sleep",
    },
  };
}

type TemplateGraphProject = Pick<CharacterProject, "characterName" | "logicalStates" | "variants">;

function preferredVariant(project: TemplateGraphProject, state: LogicalState): StateVariant | undefined {
  return project.variants.find((variant) => variant.id === state.preferredOutboundVariantId)
    ?? project.variants.find((variant) => variant.id === state.defaultVariantId)
    ?? project.variants.find((variant) => variant.logicalStateId === state.id && variant.status === "approved");
}

function materializeTransitions(project: TemplateGraphProject, blueprints: readonly TransitionBlueprint[]) {
  const states = new Map(project.logicalStates.filter((state) => state.semanticKey).map((state) => [state.semanticKey as StateKey, state]));
  return blueprints.flatMap((blueprint): Transition[] => {
    const source = states.get(blueprint.from);
    const target = states.get(blueprint.to);
    if (!source || !target) return [];
    const sourceVariant = preferredVariant(project, source);
    return [{
      id: `template-${blueprint.id}`,
      label: blueprint.label,
      fromVariantId: sourceVariant?.id ?? templateSourceVariantId(source.id),
      toLogicalStateId: target.id,
      targetDraftArtifactId: target.referenceArtifactId,
      guidanceArtifactIds: blueprint.guidanceKeys?.flatMap((key) => {
        const state = states.get(key);
        return state ? [state.referenceArtifactId ?? templateGuidanceArtifactId(state.id)] : [];
      }),
      mediaVersions: [],
      endFrameSource: blueprint.endFrameSource ?? "authority-reference",
      status: sourceVariant && target.referenceArtifactId ? "target-ready" : "draft",
      prompt: blueprint.prompt(CHARACTER_NAME_PROMPT_VARIABLE),
      durationMs: (blueprint.durationSeconds ?? 4) * 1_000,
      entryBlendMs: blueprint.idleRule ? 320 : 420,
      durationMode: "fixed",
      durationSeconds: blueprint.durationSeconds ?? 4,
      transparentVideo: true,
      transparencyProcessing: { keyColor: "#00FF00", similarity: 0.34 },
      authorityBridge: { mode: "crossfade", durationMs: blueprint.idleRule ? 360 : 700 },
      triggers: structuredClone(blueprint.triggers ?? []),
      idleRule: blueprint.idleRule ? structuredClone(blueprint.idleRule) : undefined,
    }];
  });
}

function createSavedTemplateGraph(template: SavedProjectTemplate, characterName: string) {
  void characterName;
  const renderSavedPrompt = (prompt: string) => template.sourceCharacterName
    ? templateCharacterNamePrompt(prompt, template.sourceCharacterName)
    : prompt;
  const logicalStates: LogicalState[] = template.states.map((state) => ({
    id: state.id,
    label: state.label,
    semanticKey: state.semanticKey,
    description: renderSavedPrompt(state.description),
    position: structuredClone(state.position),
    referenceArtifactIds: [],
    idleScheduler: structuredClone(state.idleScheduler),
    pointerGaze: state.pointerGaze ? structuredClone(state.pointerGaze) : undefined,
  }));
  const stateIds = new Set(logicalStates.map((state) => state.id));
  const transitions: Transition[] = template.transitions.flatMap((transition): Transition[] => {
    if (!stateIds.has(transition.fromStateId) || !stateIds.has(transition.toStateId)) return [];
    return [{
      id: `template-${template.id}-${transition.id}`,
      label: transition.label,
      fromVariantId: templateSourceVariantId(transition.fromStateId),
      toLogicalStateId: transition.toStateId,
      guidanceArtifactIds: transition.guidanceStateIds.map(templateGuidanceArtifactId),
      mediaVersions: [],
      endFrameSource: transition.endFrameSource,
      status: "draft",
      prompt: renderSavedPrompt(transition.promptTemplate),
      durationMs: transition.durationMs,
      entryBlendMs: transition.entryBlendMs,
      durationMode: transition.durationMode,
      durationSeconds: transition.durationSeconds,
      transparentVideo: transition.transparentVideo,
      transparencyProcessing: structuredClone(transition.transparencyProcessing),
      authorityBridge: structuredClone(transition.authorityBridge),
      triggers: structuredClone(transition.triggers),
      idleRule: transition.idleRule ? structuredClone(transition.idleRule) : undefined,
      playback: transition.playback ? structuredClone(transition.playback) : undefined,
    }];
  });
  return { logicalStates, transitions, dragInteraction: template.dragInteraction ? structuredClone(template.dragInteraction) : undefined };
}

export function createProjectTemplateGraph(templateInput: ProjectTemplateId | ProjectTemplateDefinition, characterName: string) {
  const template = typeof templateInput === "string"
    ? projectTemplates.find((candidate) => candidate.id === templateInput) ?? projectTemplates.find((candidate) => candidate.id === "companion")!
    : templateInput;
  if (template.kind === "custom") return createSavedTemplateGraph(template, characterName);
  const stateKeys = new Set<StateKey>(template.stateKeys);
  const project: TemplateGraphProject = {
    characterName,
    logicalStates: projectStateBlueprints.filter((state) => stateKeys.has(state.key)).map(logicalState),
    variants: [],
  };
  return { logicalStates: project.logicalStates, transitions: materializeTransitions(project, template.transitions), dragInteraction: undefined };
}

export function applyProjectTemplateGraph(project: CharacterProject, templateId: ProjectTemplateId = "companion") {
  const template = projectTemplates.find((candidate) => candidate.id === templateId) ?? projectTemplates.find((candidate) => candidate.id === "companion")!;
  return {
    ...project,
    transitions: [
      ...project.transitions.filter((transition) => !transition.id.startsWith("template-") && !transition.id.startsWith("recipe-companion-")),
      ...materializeTransitions(project, template.transitions),
    ],
  };
}
