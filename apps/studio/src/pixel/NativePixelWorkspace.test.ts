// @vitest-environment happy-dom
import { it, expect, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { createCanvas } from "@napi-rs/canvas";
import { NativePixelWorkspace } from "./NativePixelWorkspace";
import { createBlankProject } from "../projectTemplate";
import { hasDrawingDraft, savePixelSourceDraft, useDrawingDraftStatus } from "./drawingDrafts";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
  function (this: HTMLCanvasElement) {
    return createCanvas(this.width, this.height).getContext(
      "2d",
    ) as unknown as CanvasRenderingContext2D;
  },
);
const documentSource = {
  schemaVersion: 1 as const,
  width: 2,
  height: 1,
  palette: { R: "#FF0000" },
  frames: [
    { id: "one", layers: [{ id: "body", x: 0, y: 0, rows: ["R."] }] },
    { id: "two", baseFrameId: "one" },
  ],
};
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
  productionRoute: "native-pixel" as const,
  pixelDocument: documentSource,
};
function button(host: HTMLElement, text: string) {
  return [...host.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(text),
  )!;
}
it("preserves a drawing draft between tools and keeps publishing blocked until save completes", async () => {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const id = "shared-tool-draft";
  let savedFrames = 0;
  function Harness() {
    const [current, setCurrent] = useState({ ...project, id, productionRoute: "generated" as const });
    const [drawing, setDrawing] = useState(true);
    const pending = useDrawingDraftStatus(current);
    return createElement("div", {}, createElement("button", { onClick: () => setDrawing(value => !value) }, "工作视图"), createElement("button", { disabled: pending, "data-publish": true }, "发布"), drawing ? createElement(NativePixelWorkspace, { project: current, onPreview: () => {}, runCommand: async (_name, input) => {
      const next = { ...current, pixelDocument: (input as { document: typeof documentSource }).document };
      savedFrames = next.pixelDocument.frames.length; setCurrent(next); return { project: next, revision: 2 };
    } }) : createElement("p", {}, "状态与动作"));
  }
  try {
    await act(async () => root.render(createElement(Harness)));
    await act(async () => button(host, "派生帧").click());
    expect(hasDrawingDraft(id)).toBe(true);
    await act(async () => button(host, "工作视图").click());
    expect(host.querySelector(".native-workspace")).toBeNull();
    expect(host.querySelector<HTMLButtonElement>("[data-publish]")?.disabled).toBe(true);
    await act(async () => button(host, "工作视图").click());
    expect(host.querySelectorAll(".native-frame-list > button")).toHaveLength(3);
    await act(async () => button(host, "放弃画布草稿").click());
    expect(host.querySelectorAll(".native-frame-list > button")).toHaveLength(2);
    expect(hasDrawingDraft(id)).toBe(false);
    await act(async () => button(host, "派生帧").click());
    await act(async () => button(host, "保存画布").click());
    expect(savedFrames).toBe(3);
    expect(hasDrawingDraft(id)).toBe(false);
    expect(host.querySelector<HTMLButtonElement>("[data-publish]")?.disabled).toBe(false);
  } finally { await act(async () => root.unmount()); savePixelSourceDraft(id); host.remove(); }
});
it("keeps draft edits and blocks saving when a different document arrives", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let commands = 0;
  const props = {
    project,
    runCommand: async () => {
      commands++;
      return { project, revision: 1 };
    },
    onPreview: () => {},
  };
  await act(async () =>
    root.render(createElement(NativePixelWorkspace, props)),
  );
  await act(async () => button(host, "派生帧").click());
  expect(host.textContent).toContain("未保存");
  await act(async () =>
    root.render(
      createElement(NativePixelWorkspace, {
        ...props,
        project: {
          ...project,
          pixelDocument: { ...documentSource, palette: { R: "#00FF00" } },
        },
      }),
    ),
  );
  expect(host.textContent).toContain("外部更新");
  expect(button(host, "保存画布").disabled).toBe(true);
  expect(commands).toBe(0);
  await act(async () => button(host, "载入最新画布").click());
  expect(button(host, "保存画布").disabled).toBe(false);
  act(() => root.unmount());
  host.remove();
});
it("saves a derived frame as editable source and retains its base link", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  let submitted: any;
  await act(async () =>
    root.render(
      createElement(NativePixelWorkspace, {
        project,
        runCommand: async (command, input) => {
          submitted = { command, input };
          return {
            project: { ...project, pixelDocument: (input as any).document },
            revision: 2,
          };
        },
        onPreview: () => {},
      }),
    ),
  );
  await act(async () => button(host, "派生帧").click());
  await act(async () => button(host, "保存画布").click());
  expect(submitted.command).toBe("pixel.document.save");
  expect(submitted.input.document.frames.at(-1)).toMatchObject({
    baseFrameId: "one",
  });
  expect(host.querySelector("video")).toBeNull();
  expect(host.textContent).not.toContain("一键透明化");
  act(() => root.unmount());
  host.remove();
});
it("keeps every cell of a brush stroke when pointer events arrive before React rerenders", async () => {
  const p = {
    ...project,
    pixelDocument: {
      ...documentSource,
      frames: [
        { id: "one", layers: [{ id: "body", x: 0, y: 0, rows: [".."] }] },
      ],
    },
  };
  let saved: any;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(NativePixelWorkspace, {
        project: p,
        onPreview: () => {},
        runCommand: async (_command, input) => {
          saved = (input as any).document;
          return { project: { ...p, pixelDocument: saved }, revision: 2 };
        },
      }),
    ),
  );
  const canvas = host.querySelector<HTMLCanvasElement>(
    'canvas[aria-label="原生像素画布"]',
  )!;
  vi.spyOn(canvas, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
    width: 16,
    height: 8,
    right: 16,
    bottom: 8,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  await act(async () => {
    canvas.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 4,
        clientY: 4,
        button: 0,
        bubbles: true,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 12,
        clientY: 4,
        buttons: 1,
        bubbles: true,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
    );
  });
  await act(async () => button(host, "保存画布").click());
  expect(saved.frames[0].layers[0].rows).toEqual(["RR"]);
  act(() => root.unmount());
  host.remove();
});
