export interface StylePromptRevision {
  id: string;
  imagePrompt: string;
  videoPrompt: string;
  source: "manual" | "image-test" | "video-test";
  createdAt: string;
  jobId?: string;
}

export interface StyleProfile {
  id: string;
  name: string;
  description: string;
  definitionVersion: number;
  /** Legacy image prompt retained so older stored profiles remain readable. */
  prompt: string;
  imagePrompt: string;
  videoPrompt: string;
  experimentBudgetCny: number;
  revisions: StylePromptRevision[];
  createdAt: string;
  updatedAt: string;
}

const cozyFarmImagePrompt = "高品质温暖农场生活 RPG 宠物角色母版，2K 正方形输出，但所有形状都按 96×96 逻辑像素网格设计。轮廓由清楚的大阶梯形色块构成，禁止柔焦、半透明抗锯齿、摄影毛发、噪点与细碎纹理。角色的头身比、体型、四肢长度、耳型、尾型和全部花纹必须严格继承形象参考，不得强制改成矮胖、幼态或任何通用品种比例。使用从形象参考归纳出的 12–16 个稳定颜色和一档硬边阴影；相邻五官与毛色块必须保留足够明度或色相差，暗部不能合并成一整块。眼睛复杂度由逻辑像素面积决定：小眼睛使用大小相同、水平对称的 2×2 或 2×3 高对比纯色色块，颜色从真实眼睛和面部配色中提取；禁止擅自增加眼白、多重高光、渐变、斜线和交叉形状。只有眼睛至少达到 6×6 逻辑像素且设计明确要求大眼睛时，才允许两级颜色，仍必须服从形象参考。温暖、亲切、像原创乡村生活游戏中的宠物伙伴，但不要复制任何现有游戏角色。略带俯视的 3/4 游戏视角，完整全身，纯色背景，无地面、无投影、无文字。";
const cozyFarmVideoPrompt = "温暖农场生活 RPG 的 2D 像素角色动画。严格继承输入图片的 96×96 逻辑像素尺度、参考图调色板、阶梯轮廓和 3/4 游戏视角。每一帧都必须保持角色包围盒、脚底基线、真实头身比例、脸型、五官和毛色块位置一致；轮廓只能以整逻辑像素移动，禁止亚像素抖动、插值模糊、纹理爬动、调色板漂移和逐帧重画。小眼睛必须作为刚性 sprite 原样复制，位置、大小和颜色与首帧一致；眨眼只能短暂变成一条水平线，睁开后恢复原始色块。不得新增形象参考中不存在的眼白、高光、花纹或配色。动作幅度服从动作提示，节奏接近手工游戏动画，但输出保持正常时长和流畅播放。";
const clearLivelyImagePrompt = "清透自然的高清宠物摄影母版，2K 正方形输出。采用可信的真实光学镜头、自然皮毛光泽与柔和体积；不是插画、手绘、平涂、动漫、Q 版、3D 或毛绒玩具。使用明亮柔和的专业影棚漫射光与准确曝光，在高光和暗部都保留清楚的毛发层次。眼睛呈现真实的眼睑包裹、虹膜、瞳孔和同方向单枚自然反光，禁止动漫大眼、玻璃珠眼、额外眼白、多重高光、泪光或斜视。固定略带俯视的 3/4 宠物棚拍视角，完整全身，角色占画面约 72%，纯色无缝背景，无地面线、无投影、无道具、无文字。";
const clearLivelyVideoPrompt = "清透自然的真实宠物棚拍视频，延续输入图片中的真实光学质感、自然毛发细节和影棚光线；禁止插画化、动漫化、3D 化或逐帧重塑。固定摄影机、焦距、角色包围盒、脚底基线与画布位置，保持曝光、白平衡、清晰度和材质表现稳定。严格执行本次动作提示；禁止轮廓融化、纹理爬动、额外肢体、调色漂移和画面闪烁。";

export const defaultStyleProfiles: StyleProfile[] = [
  {
    id: "style-natural-pet-photography",
    name: "自然宠物摄影",
    definitionVersion: 2,
    description: "真实、可爱、稳定的宠物摄影母版，适合后续视频与像素化展示。",
    prompt: "照片级自然宠物摄影，真实镜头质感与可信解剖，毛发长度、密度和质地严格继承形象参考，具有自然皮毛光泽和细腻体积。柔和稳定的专业影棚光线，完整展示全身，背景干净，轮廓清晰。",
    imagePrompt: "照片级自然宠物摄影，真实镜头质感与可信解剖，毛发长度、密度和质地严格继承形象参考，具有自然皮毛光泽和细腻体积。柔和稳定的专业影棚光线，完整展示全身，背景干净，轮廓清晰。",
    videoPrompt: "自然宠物摄影视频，严格延续参考图中的可信解剖、毛色、毛发质感和影棚光线。动作低幅、自然，身体结构与面部身份在每一帧保持稳定，禁止纹理漂移和五官变化。",
    experimentBudgetCny: 30,
    revisions: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  },
  {
    id: "style-soft-2d-companion",
    name: "柔和 2D 桌宠",
    definitionVersion: 1,
    description: "高清手绘角色母版，像素效果由运行时后处理完成。",
    prompt: "高保真手绘 2D 游戏角色，柔和赛璐璐明暗，细致自然的毛发块面，可爱但保留可信的宠物解剖，完整展示角色，造型、构图和光影稳定统一。",
    imagePrompt: "高保真手绘 2D 游戏角色，柔和赛璐璐明暗，细致自然的毛发块面，可爱但保留可信的宠物解剖，完整展示角色，造型、构图和光影稳定统一。",
    videoPrompt: "高保真手绘 2D 游戏角色动画，严格继承参考图的轮廓、色块、线条与赛璐璐明暗。动作清楚克制，禁止线条抖动、色块漂移、五官重绘和体型变化。",
    experimentBudgetCny: 30,
    revisions: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  },
  {
    id: "style-cozy-farm-rpg-pixel",
    name: "星露谷感 · 2D 像素伙伴",
    definitionVersion: 3,
    description: "温暖农场生活 RPG 气质；小眼睛强制单色，大眼睛才允许双色，避免暗色面部产生恐怖噪点。",
    prompt: cozyFarmImagePrompt,
    imagePrompt: cozyFarmImagePrompt,
    videoPrompt: cozyFarmVideoPrompt,
    experimentBudgetCny: 30,
    revisions: [
      { id: "style-revision-cozy-video-1", imagePrompt: cozyFarmImagePrompt, videoPrompt: cozyFarmVideoPrompt, source: "video-test", createdAt: "2026-09-01T04:58:36.913Z", jobId: "5e6ca469-31f9-4b01-88a2-1064c05f8949" },
      { id: "style-revision-cozy-image-1", imagePrompt: cozyFarmImagePrompt, videoPrompt: cozyFarmVideoPrompt, source: "image-test", createdAt: "2026-09-01T04:56:24.957Z", jobId: "12467c42-bf62-47f9-b483-69619334dd7c" },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
  {
    id: "style-clear-lively-2d",
    name: "清透真实 · 实拍宠物",
    definitionVersion: 8,
    description: "以多张实拍为唯一身份依据的真实宠物棚拍风格；保持真实眼神、毛发和个体比例。",
    prompt: clearLivelyImagePrompt,
    imagePrompt: clearLivelyImagePrompt,
    videoPrompt: clearLivelyVideoPrompt,
    experimentBudgetCny: 30,
    revisions: [
      { id: "style-revision-clear-real-video-1", imagePrompt: clearLivelyImagePrompt, videoPrompt: clearLivelyVideoPrompt, source: "video-test", createdAt: "2026-09-01T06:18:49.182Z", jobId: "83f0311f-4ffd-4eed-9e52-d6a09e8c24a3" },
      { id: "style-revision-clear-real-image-1", imagePrompt: clearLivelyImagePrompt, videoPrompt: clearLivelyVideoPrompt, source: "image-test", createdAt: "2026-09-01T06:13:55.151Z", jobId: "4c962526-c3f2-4956-8d7f-d56bf03fb131" },
    ],
    createdAt: "2026-09-01T06:00:00.000Z",
    updatedAt: "2026-09-01T06:00:00.000Z",
  },
];

export function isLegacyPixelPrompt(prompt: string) {
  return /像素|pixel|16-bit/i.test(prompt);
}

export function normalizeStyleProfile(profile: Partial<StyleProfile> & Pick<StyleProfile, "id" | "name">): StyleProfile {
  const timestamp = new Date().toISOString();
  const imagePrompt = profile.imagePrompt?.trim() || profile.prompt?.trim() || defaultStyleProfiles[0]?.imagePrompt || "";
  const videoPrompt = profile.videoPrompt?.trim() || profile.prompt?.trim() || imagePrompt;
  return {
    id: profile.id,
    name: profile.name,
    definitionVersion: profile.definitionVersion ?? 1,
    description: profile.description ?? "可复用于任意宠物项目的生成风格。",
    prompt: imagePrompt,
    imagePrompt,
    videoPrompt,
    experimentBudgetCny: profile.experimentBudgetCny ?? 30,
    revisions: Array.isArray(profile.revisions) ? profile.revisions : [],
    createdAt: profile.createdAt ?? timestamp,
    updatedAt: profile.updatedAt ?? timestamp,
  };
}

export function mergeStyleProfiles(stored: StyleProfile[], projectStyles: Array<{ name: string; characterName: string; prompt: string; imagePrompt?: string; videoPrompt?: string }>) {
  const result: StyleProfile[] = [];
  const knownIds = new Set<string>();
  const storedPromptKeys = new Set<string>();
  for (const storedProfile of stored.map(normalizeStyleProfile)) {
    if (knownIds.has(storedProfile.id)) continue;
    const promptKey = `${storedProfile.imagePrompt.trim()}\n${storedProfile.videoPrompt.trim()}`;
    if (storedPromptKeys.has(promptKey)) continue;
    knownIds.add(storedProfile.id);
    storedPromptKeys.add(promptKey);
    result.push(storedProfile);
  }
  const knownPrompts = new Set(result.map((profile) => `${profile.imagePrompt.trim()}\n${profile.videoPrompt.trim()}`));
  for (const profile of defaultStyleProfiles) {
    const existingIndex = result.findIndex((candidate) => candidate.id === profile.id);
    if (existingIndex >= 0) {
      const existing = result[existingIndex];
      const revisions = [...existing.revisions];
      const revisionIds = new Set(revisions.map((revision) => revision.id));
      for (const revision of profile.revisions) if (!revisionIds.has(revision.id)) revisions.push(revision);
      const shouldUpgradeBundledDefinition = profile.definitionVersion > existing.definitionVersion;
      result[existingIndex] = shouldUpgradeBundledDefinition
        ? { ...existing, prompt: profile.prompt, imagePrompt: profile.imagePrompt, videoPrompt: profile.videoPrompt, description: profile.description, definitionVersion: profile.definitionVersion, revisions, updatedAt: profile.updatedAt }
        : { ...profile, ...existing, revisions };
      continue;
    }
    const key = `${profile.imagePrompt.trim()}\n${profile.videoPrompt.trim()}`;
    if (!knownPrompts.has(key)) {
      result.push(profile);
      knownPrompts.add(key);
    }
  }
  for (const projectStyle of projectStyles) {
    const imagePrompt = templateCharacterNamePrompt(projectStyle.imagePrompt?.trim() || projectStyle.prompt.trim(), projectStyle.characterName);
    const videoPrompt = templateCharacterNamePrompt(projectStyle.videoPrompt?.trim() || projectStyle.prompt.trim(), projectStyle.characterName);
    const key = `${imagePrompt}\n${videoPrompt}`;
    if (!imagePrompt || isLegacyPixelPrompt(imagePrompt) || knownPrompts.has(key)) continue;
    const timestamp = new Date().toISOString();
    result.push({
      id: `style-${crypto.randomUUID()}`,
      name: `${projectStyle.name} 风格`,
      definitionVersion: 1,
      description: "从已有项目风格自动收录，可在全局风格库继续整理。",
      prompt: imagePrompt,
      imagePrompt,
      videoPrompt,
      experimentBudgetCny: 30,
      revisions: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    knownPrompts.add(key);
  }
  return result;
}
import { templateCharacterNamePrompt } from "@petlord/generation";
