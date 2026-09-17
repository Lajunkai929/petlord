// @vitest-environment happy-dom
import { it, expect, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { createCanvas } from "@napi-rs/canvas";
import { transitionSchema, logicalStateSchema, stateVariantSchema, defaultTransitionPlayback } from "@petlord/schema";
import { createBlankProject } from "../projectTemplate";
import { NativeAnimationEditor } from "./NativeAnimationEditor";
import { hasDrawingDraft, savePixelTimelineDraft } from "./drawingDrafts";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
  function (this: HTMLCanvasElement) {
    return createCanvas(this.width, this.height).getContext(
      "2d",
    ) as unknown as CanvasRenderingContext2D;
  },
);
it.each([false,true])("saves authored frame durations through native binding after artwork refresh=%s", async (refreshed) => {
  const doc = {
    schemaVersion: 1 as const,
    width: 1,
    height: 1,
    palette: { R: "#FF0000" },
    frames: [
      { id: "a", layers: [{ id: "body", x: 0, y: 0, rows: ["R"] }] },
      { id: "b", baseFrameId: "a" },
    ],
  };
  const transition = transitionSchema.parse({
    id: "edge",
    label: "Blink",
    fromVariantId: "v-a",
    toLogicalStateId: "idle",
    status: "draft",
    nativeAnimation: {
      frames: [
        { imageArtifactId: "img-a", durationMs: 100 },
        { imageArtifactId: "img-b", durationMs: 150 },
      ],
    },
  });
  const project = {
    ...createBlankProject({
      customerName: "",
      contact: "",
      characterName: "Pet",
      quotedPriceCny: 0,
      depositCny: 0,
      revisionLimit: 0,
      notes: "",
      projectTemplateId: "blank",
    }),
    pixelDocument: doc,
    transitions: [transition],
    logicalStates: [logicalStateSchema.parse({ id: "start", label: "Start", position: { x: 0, y: 0 }, referenceArtifactId: "img-a" }), logicalStateSchema.parse({ id: "idle", label: "Idle", position: { x: 10, y: 0 }, referenceArtifactId: "img-b" })],
    variants: [stateVariantSchema.parse({ id: "v-a", logicalStateId: "start", label: "Start", status: "approved", imageArtifactId: "img-a", origin: { kind: "reference" } })],
    artifacts: ["a", "b"].map((id) => ({
      id: `img-${id}`,
      kind: "state-actual" as const,
      uri: `/${id}.png`,
      mimeType: "image/png",
      createdAt: "2026-09-09T00:00:00.000Z",
      nativePixel: { frameId: id, width: 1, height: 1 },
    })),
  };
  const calls: any[] = [];
  let operationError: unknown;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(NativeAnimationEditor, {
        project,
        document: doc,
        transition,
        busy: false,
        runCommand: async (command, input) => {
          calls.push({ command, input });
          return { project, revision: 1 };
        },
        saveDocument: async () => ({ project: refreshed ? {...project, transitions:[{...transition,nativeAnimation:{frames:transition.nativeAnimation!.frames.map(frame=>({...frame,imageArtifactId:`new-${frame.imageArtifactId}`}))}}]} : project, revision: 1, value: refreshed ? {artifactReplacements:{"img-a":"new-img-a","img-b":"new-img-b"}} : undefined }),
        onTask: async (action) => {
          try { await action(); } catch(error) { operationError=error; }
        },
      }),
    ),
  );
  const duration = host.querySelector<HTMLInputElement>(
    '[aria-label="第 1 帧时长"]',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(duration, "120");
    duration.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    [...host.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("批准动画"))!
      .click(),
  );
  expect(operationError).toBeUndefined();
  expect(calls.at(-1)).toEqual({
    command: "pixel.animation.bind",
    input: {
      transitionId: "edge",
      frames: [
        { frameId: "a", durationMs: 120 },
        { frameId: "b", durationMs: 150 },
      ],
      approve: true,
      playback: {repeatMode: "fixed", minCycles: 1, maxCycles: 1},
    },
  });
  expect(host.textContent).toContain("270 ms");
  expect(host.textContent).not.toContain("ping-pong");
  expect(calls).toHaveLength(1);
  act(() => root.unmount());
  host.remove();
});

it("syncs external repeat settings and preserves local repeat drafts across navigation and conflicts", async () => {
  const doc = {schemaVersion:1 as const,width:1,height:1,palette:{R:"#FF0000"},frames:[{id:"a",layers:[{id:"b",x:0,y:0,rows:["R"]}]}]};
  const project = createBlankProject({customerName:"",contact:"",characterName:"Repeat",quotedPriceCny:0,depositCny:0,revisionLimit:0,notes:"",projectTemplateId:"blank"});
  const transition = transitionSchema.parse({id:"repeat-test",label:"Repeat",fromVariantId:"v",toLogicalStateId:"s",status:"draft"});
  const host = document.createElement("div"); document.body.append(host); const root=createRoot(host);
  const render = (cycles:number) => root.render(createElement(NativeAnimationEditor,{key:"editor",project,document:doc,transition:{...transition,playback:{...defaultTransitionPlayback,minCycles:cycles,maxCycles:cycles}},busy:false,runCommand:async()=>({project,revision:1}),saveDocument:async()=>({project,revision:1}),onTask:async action=>action()}));
  const input = () => host.querySelector<HTMLInputElement>('[aria-label="原生动画最少轮数"]')!;
  try {
    await act(async()=>render(1)); await act(async()=>render(2)); expect(input().value).toBe("2");
    await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input(),"3");input().dispatchEvent(new Event("input",{bubbles:true}));});
    await act(async()=>root.render(createElement("div",null,"another animation")));
    await act(async()=>render(2)); expect(input().value).toBe("3");
    await act(async()=>render(4)); expect(input().value).toBe("3"); expect(host.textContent).toContain("草稿已保留");
    await act(async()=>[...host.querySelectorAll("button")].find(button=>button.textContent?.includes("载入最新时间线"))!.click());
    expect(input().value).toBe("4");
  } finally { act(()=>root.unmount());host.remove(); }
});

it("lets an unfinished timeline be discarded without changing the existing video", async () => {
  const doc = { schemaVersion: 1 as const, width: 1, height: 1, palette: { R: "#FF0000" }, frames: [{ id: "a", layers: [{ id: "body", x: 0, y: 0, rows: ["R"] }] }] };
  const transition = transitionSchema.parse({ id: "video-draft", label: "Video", fromVariantId: "v", toLogicalStateId: "s", videoArtifactId: "saved-video", status: "review" });
  const project = { ...createBlankProject({ customerName: "", contact: "", characterName: "Video", quotedPriceCny: 0, depositCny: 0, revisionLimit: 0, notes: "", projectTemplateId: "blank" }), transitions: [transition] };
  const runCommand = vi.fn();
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(NativeAnimationEditor, { project, document: doc, transition, busy: false, runCommand, saveDocument: async () => ({ project, revision: 1 }), onTask: action => action() })));
    const input = host.querySelector<HTMLInputElement>('[aria-label="第 1 帧时长"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "250"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(hasDrawingDraft(project.id)).toBe(true);
    const discard = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "放弃动画草稿");
    expect(discard).toBeDefined();
    await act(async () => discard!.click());
    expect(input.value).toBe("150");
    expect(hasDrawingDraft(project.id)).toBe(false);
    expect(runCommand).not.toHaveBeenCalled();
    expect(project.transitions[0].videoArtifactId).toBe("saved-video");
    expect([...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.includes("保存动画"))?.disabled).toBe(true);
  } finally { await act(async () => root.unmount()); savePixelTimelineDraft(project.id, transition.id); host.remove(); }
});
