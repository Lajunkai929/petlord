import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assembleStateDraftPrompt,
  createArkGenerationProvider,
  createSandboxGenerationProvider,
  calculateVideoGenerationCostFromTokens,
  estimateImageGenerationCost,
  estimateVideoGenerationCost,
  materializePromptVariables,
  parseJsonResponse,
  submitStateDraftJob,
  submitTransitionJob,
  templateCharacterNamePrompt,
} from "./index";

const settings = {
  imageModel: "doubao-seedream-5-0-260128",
  imageMode: "native-image" as const,
  videoModel: "doubao-seedance-2-0-mini-260615",
  imageResolution: "1K" as const,
  imageCandidateCount: 3,
  videoResolution: "480p" as const,
  ratio: "1:1" as const,
  durationMode: "smart" as const,
};

describe("generation provider contract", () => {
  it("turns an interrupted empty response into an actionable retry message", async () => {
    await expect(parseJsonResponse(new Response(null, { status: 502 }), "Apple Vision 透明化"))
      .rejects.toThrow("本地生成服务可能在处理期间重启，请重新执行");
  });

  it("preserves structured server errors and rejects non-JSON proxy pages", async () => {
    await expect(parseJsonResponse(new Response(JSON.stringify({ error: { message: "主体分割失败" } }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }), "Apple Vision 透明化")).rejects.toThrow("主体分割失败");
    await expect(parseJsonResponse(new Response("Bad Gateway", {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    }), "Apple Vision 透明化")).rejects.toThrow("收到无法解析的服务响应");
  });

  it("reports progress and returns the encoded tail as the actual state candidate", async () => {
    const provider = createSandboxGenerationProvider({ stepDelayMs: 0 });
    const onProgress = vi.fn();
    const result = await provider.generateTransition(
      {
        fromStateImageUri: "sit.png",
        targetDraftImageUri: "lying-draft.png",
        identityReferenceUris: ["identity.png"],
        identityPrompt: "黑棕色矮壮小狗",
        stylePrompt: "2D 游戏角色",
        prompt: "自然趴下",
        settings,
        durationMode: "fixed",
        durationSeconds: 4,
        transparentVideo: false,
        transparencyKeyColor: "#00FF00",
        transparencySimilarity: 0.34,
        chromaBackgroundColor: "#00FF00",
      },
      onProgress,
    );
    expect(onProgress).toHaveBeenLastCalledWith(91);
    expect(result.extractedTail.uri).toBe("lying-draft.png");
    expect(result.video.mimeType).toBe("video/webm");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the native image API with the lowest square Seedream size", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      model: "doubao-seedream-5-0-260128",
      data: [{ url: "https://example.com/state.png" }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = createArkGenerationProvider();
    const media = await provider.generateStateDraft({
      identityReferenceUris: ["data:image/jpeg;base64,AA=="],
      identityPrompt: "黑棕色小狗",
      stylePrompt: "像素插画",
      targetStateLabel: "醒来",
      prompt: "抬头睁眼",
      settings: { ...settings, imageMode: "native-image", imageModel: "doubao-seedream-5-0-260128", imageResolution: "2K" },
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ size: "2K", watermark: false });
    expect(media.uri).toBe("https://example.com/state.png");
  });

  it("omits duration for smart Seedance transitions and consumes the returned real tail", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      const payload = url.endsWith("/api/ark/video/tasks")
        ? { id: "cgt-test" }
        : {
            id: "cgt-test",
            status: "succeeded",
            model: settings.videoModel,
            duration: "5",
            content: { video_url: "https://example.com/transition.mp4", last_frame_url: "https://example.com/tail.png" },
          };
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createArkGenerationProvider();
    const result = await provider.generateTransition({
      fromStateImageUri: "data:image/png;base64,AA==",
      targetDraftImageUri: "data:image/png;base64,AA==",
      identityReferenceUris: [],
      identityPrompt: "黑棕色矮壮小狗",
      stylePrompt: "2D 游戏角色",
      prompt: "自然醒来",
      settings,
      durationMode: "smart",
      transparentVideo: false,
      transparencyKeyColor: "#00FF00",
      transparencySimilarity: 0.34,
      chromaBackgroundColor: "#00FF00",
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ resolution: "480p", ratio: "1:1", return_last_frame: true, generate_audio: false });
    expect(body).not.toHaveProperty("duration");
    expect(result.extractedTail.uri).toBe("https://example.com/tail.png");
    expect(result.durationMs).toBe(5000);
  });

  it("submits resumable transition jobs with their navigation trigger", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "11111111-1111-4111-8111-111111111111",
      kind: "transition-video",
      status: "queued",
      progress: 0,
      model: settings.videoModel,
      trigger: { projectId: "project", entityType: "transition", entityId: "edge", label: "坐着到趴着" },
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    }), { status: 202, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await submitTransitionJob({
      jobId: "11111111-1111-4111-8111-111111111111",
      trigger: { projectId: "project", entityType: "transition", entityId: "edge", label: "坐着到趴着" },
      fromStateImageUri: "data:image/png;base64,AA==",
      targetDraftImageUri: "data:image/png;base64,AA==",
      identityReferenceUris: [],
      identityPrompt: "黑棕色矮壮小狗",
      stylePrompt: "2D 游戏角色",
      prompt: "自然趴下",
      settings,
      durationMode: "smart",
      transparentVideo: true,
      transparencyKeyColor: "#00FF00",
      transparencySimilarity: 0.34,
      chromaBackgroundColor: "#00FF00",
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("/api/jobs");
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      kind: "transition-video",
      arkType: "video",
      trigger: { entityType: "transition", entityId: "edge" },
      request: { resolution: "480p", ratio: "1:1", return_last_frame: true, generate_audio: false },
      postprocess: { transparentVideo: true, resolution: "480p", keyColor: "#00FF00", similarity: 0.34 },
    });
    expect(body.request).not.toHaveProperty("duration");
    expect(body.request.generate_audio).toBe(false);
    expect(body.request.content[0].text).toContain("#00FF00");
    expect(body.request.content[0].text).toContain("位置、朝向和光轴必须从第一帧到最后一帧完全固定");
    expect(body.request.content[0].text).toContain("禁止渐变、聚光、暗角、地面、水平线、投影、接触阴影");
    expect(body.request.content[0].text).toContain("【角色身份】\n黑棕色矮壮小狗");
    expect(body.cost).toMatchObject({ status: "estimated", estimatedMinCny: expect.any(Number), estimatedMaxCny: expect.any(Number) });
    expect(body.assembledPrompt).toBe(body.request.content[0].text);
    expect(body.chromaKeyColor).toBe("#00FF00");
    expect(body.request.content.slice(1).every((item: { role?: string }) => item.role === "reference_image")).toBe(true);
  });

  it("submits a 1K Seedream candidate group for state authority selection", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: "22222222-2222-4222-8222-222222222222",
      kind: "state-image",
      status: "queued",
      progress: 0,
      model: settings.imageModel,
      trigger: { projectId: "project", entityType: "state", entityId: "state", label: "趴着" },
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-30T00:00:00.000Z",
    }), { status: 202, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await submitStateDraftJob({
      jobId: "22222222-2222-4222-8222-222222222222",
      trigger: { projectId: "project", entityType: "state", entityId: "state", label: "趴着" },
      identityReferenceUris: ["data:image/png;base64,AA=="],
      identityPrompt: "黑棕色矮壮小狗",
      stylePrompt: "2D 游戏角色",
      targetStateLabel: "趴着",
      prompt: "自然趴下",
      settings,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ kind: "state-image", arkType: "image" });
    expect(body.request).toMatchObject({
      model: "doubao-seedream-5-0-260128",
      size: "1K",
      sequential_image_generation: "auto",
      sequential_image_generation_options: { max_images: 3 },
    });
    expect(body.cost).toMatchObject({ status: "estimated", estimatedMinCny: 0.66, estimatedMaxCny: 0.66 });
    expect(body.request).not.toHaveProperty("duration");
    expect(body.assembledPrompt).toBe(body.request.prompt);
    expect(body.request.prompt).toContain("【参考图职责】");
    expect(body.request.prompt).toContain("【角色身份】\n黑棕色矮壮小狗");
    expect(body.request.prompt).toContain("【项目风格】\n2D 游戏角色");
  });

  it("assembles the previewed state prompt in the same explicit segment order", () => {
    const prompt = assembleStateDraftPrompt({
      identityReferenceUris: ["identity.png"],
      identityPrompt: "黑棕色矮壮小狗",
      stylePrompt: "自然宠物摄影",
      targetStateLabel: "趴着",
      prompt: "身体放低，舒服地趴在地上",
      settings,
    });
    expect(prompt.indexOf("【参考图职责】")).toBeLessThan(prompt.indexOf("【角色身份】"));
    expect(prompt.indexOf("【角色身份】")).toBeLessThan(prompt.indexOf("【项目风格】"));
    expect(prompt.indexOf("【项目风格】")).toBeLessThan(prompt.indexOf("【目标状态】"));
    expect(prompt).toContain("【输出约束】\n正方形 1:1 构图，1K 清晰度");
  });

  it("stores reusable name variables and materializes them only for the active pet", () => {
    const template = templateCharacterNamePrompt("Lottery 保持 Lottery 的真实眼睛", "Lottery");
    expect(template).toBe("{{characterName}} 保持 {{characterName}} 的真实眼睛");
    expect(materializePromptVariables(template, "球球")).toBe("球球 保持 球球 的真实眼睛");
    const prompt = assembleStateDraftPrompt({
      characterName: "球球",
      identityReferenceUris: ["identity.png"],
      identityPrompt: "{{characterName}} 是白色小狗",
      stylePrompt: "保持 {{characterName}} 的真实毛发",
      targetStateLabel: "坐着",
      prompt: "{{characterName}} 放松地坐着",
      settings,
    });
    expect(prompt).toContain("球球 是白色小狗");
    expect(prompt).not.toContain("{{characterName}}");
    expect(prompt).not.toContain("Lottery");
  });

  it("estimates image and video spend before submission", () => {
    expect(estimateImageGenerationCost("doubao-seedream-5-0-260128", 3)).toMatchObject({
      minimumCny: 0.66,
      maximumCny: 0.66,
    });
    const video = estimateVideoGenerationCost({
      model: "doubao-seedance-2-0-mini-260615",
      resolution: "480p",
      durationMode: "fixed",
      durationSeconds: 4,
    });
    expect(video?.minimumCny).toBeCloseTo(0.8924, 4);
    expect(video?.maximumCny).toBeCloseTo(0.8924, 4);
    expect(calculateVideoGenerationCostFromTokens("doubao-seedance-2-0-mini-260615", 38_800)).toBeCloseTo(0.8924, 4);
  });
});
