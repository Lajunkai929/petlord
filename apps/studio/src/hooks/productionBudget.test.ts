// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { seedProject } from "../seed";
import { useBatchProduction, type BatchProductionController } from "./useBatchProduction";
import { useAutomaticProduction, type AutomaticProductionController } from "./useAutomaticProduction";
import { BatchProductionDialog } from "../components/BatchProductionDialog";
import { AutomaticProductionDialog } from "../components/AutomaticProductionDialog";
vi.mock("../workspaceApi", () => ({ readWorkspaceState: async () => undefined, saveWorkspaceState: async () => undefined, deleteWorkspaceState: async () => undefined }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; localStorage.clear(); });
async function mount(component: () => ReturnType<typeof h>) { const host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(h(component))); }
const actions = () => ({ generateState: vi.fn(async () => {}), generateTransition: vi.fn(async () => {}), transparentize: vi.fn(async () => {}), approve: vi.fn() });
it("shows an unknown batch price and blocks its generation handler", async () => {
  const project = structuredClone(seedProject); project.generationSettings.videoModel = "unpriced-custom";
  const handlers = actions(); let controller!: BatchProductionController;
  await mount(() => { controller = useBatchProduction(project, handlers); return h(BatchProductionDialog, { controller }); });
  await act(async () => { controller.setOpen(true); controller.selectAction("generate-transition"); });
  expect(controller.unknownPrice).toBe(true);
  expect(document.body.textContent).toContain("费用待配置");
  const execute = [...document.querySelectorAll("button")].find(button => button.textContent?.includes("费用待配置"));
  expect(execute?.disabled).toBe(true);
  await act(async () => controller.execute());
  expect(handlers.generateTransition).not.toHaveBeenCalled();
  expect(controller.message).toContain("模型服务");
});
it("allows a selected local task even when other generation tasks have unknown prices", async () => {
  const project = structuredClone(seedProject); project.generationSettings.videoModel = "unpriced-custom";
  project.transitions[0].videoArtifactId = "opaque";
  project.artifacts.push({ id: "opaque", kind: "transition-video", uri: "clip.mp4", mimeType: "video/mp4", hasAlpha: false, createdAt: "2026-09-10T00:00:00.000Z" });
  const handlers = actions(); let controller!: BatchProductionController;
  await mount(() => { controller = useBatchProduction(project, handlers); return h("div"); });
  await act(async () => controller.selectAction("transparentize"));
  expect(controller.unknownPrice).toBe(false); expect(controller.cost.maximumCny).toBe(0);
  await act(async () => controller.execute());
  expect(handlers.transparentize).toHaveBeenCalledWith(project.transitions[0].id);
  expect(handlers.generateTransition).not.toHaveBeenCalled();
});
it("shows an unknown automatic price and refuses to start a paid workflow", async () => {
  const project = structuredClone(seedProject); project.generationSettings.videoModel = "unpriced-custom";
  project.referenceArtifactIds = [project.artifacts[0].id];
  const handlers = { generateState: vi.fn(async () => {}), generateTransition: vi.fn(async () => {}), activateStateReference: vi.fn(), approveTransition: vi.fn() }; let controller!: AutomaticProductionController;
  await mount(() => { controller = useAutomaticProduction(project, [], false, handlers); return h(AutomaticProductionDialog, { controller }); });
  await act(async () => controller.setOpen(true));
  expect(controller.unknownPrice).toBe(true); expect(controller.blockedReason).toContain("费用待配置");
  expect(document.body.textContent).toContain("费用待配置");
  await act(async () => controller.start());
  expect(controller.run).toBeUndefined(); expect(handlers.generateTransition).not.toHaveBeenCalled();
});
