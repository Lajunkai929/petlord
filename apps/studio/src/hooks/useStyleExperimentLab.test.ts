// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { toast } from "sonner";
import { submitStateDraftJob } from "@petlord/generation";
import { seedProject } from "../seed";
import type { StudioController } from "./useStudioController";
import type { StyleProfile } from "../styleLibrary";
import { useStyleExperimentLab } from "./useStyleExperimentLab";
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@petlord/generation", async importOriginal => ({ ...await importOriginal<typeof import("@petlord/generation")>(), listPersistentJobs: async () => [], submitStateDraftJob: vi.fn(async () => ({ id: "test-job", kind: "state-image", status: "queued" })) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; vi.clearAllMocks(); });
function fixture(price?: number) {
  const project = structuredClone(seedProject); project.generationSettings.imageModel = "custom-image"; project.generationSettings.videoModel = "custom-video";
  const identity = { id: "identity", name: "Pet", identityPrompt: "Pet", referenceArtifacts: [{ uri: "https://fixture.invalid/reference.png" }] };
  const provider = (id: string, capability: "image" | "video", model: string) => ({ id, capability, enabled: true, models: [{ id: model, label: model, description: "", estimatedUnitCostCny: price }] });
  const studio = { project, activeIdentity: identity, identities: [identity], generationProviders: { snapshot: { providers: [provider("image", "image", "custom-image"), provider("video", "video", "custom-video")], defaults: { image: "image", video: "video" } } }, styleLibrary: { snapshotProfile: vi.fn() } } as unknown as StudioController;
  const profile = { id: "profile", name: "Profile", imagePrompt: "Style", videoPrompt: "Style", experimentBudgetCny: 30 } as StyleProfile;
  return { studio, profile };
}
async function mount(price?: number) {
  const { studio, profile } = fixture(price); let lab!: ReturnType<typeof useStyleExperimentLab>;
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  function Probe() { lab = useStyleExperimentLab(studio, profile); return h("div"); }
  await act(async () => root.render(h(Probe)));
  return { current: () => lab };
}
it("previews configured custom image/video prices and lets a priced image experiment submit", async () => {
  const lab = await mount(0.2);
  expect(lab.current().imageEstimate?.maximumCny).toBeCloseTo(0.6);
  expect(lab.current().videoEstimate?.maximumCny).toBeCloseTo(0.8);
  await act(async () => lab.current().generateImageTest());
  expect(submitStateDraftJob).toHaveBeenCalledWith(expect.objectContaining({ settings: expect.objectContaining({ imageModel: "custom-image" }) }));
});
it("keeps an unpriced experiment unsent and explains where to enter the estimate", async () => {
  const lab = await mount(); expect(lab.current().imageEstimate).toBeNull();
  await act(async () => lab.current().generateImageTest());
  expect(submitStateDraftJob).not.toHaveBeenCalled(); expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("模型服务"));
});
