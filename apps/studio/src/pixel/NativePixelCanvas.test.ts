// @vitest-environment happy-dom
import { afterEach, it, expect, vi } from "vitest";
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { createCanvas, type Canvas } from "@napi-rs/canvas";
import type { NativePixelDocument } from "@petlord/schema";
import { NativePixelCanvas } from "./NativePixelCanvas";
import { paintPixel } from "./pixelEditing";
const backings = new WeakMap<HTMLCanvasElement, Canvas>();
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
  function (this: HTMLCanvasElement) {
    let canvas = backings.get(this);
    if (
      !canvas ||
      canvas.width !== this.width ||
      canvas.height !== this.height
    ) {
      canvas = createCanvas(this.width, this.height);
      backings.set(this, canvas);
    }
    return canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  },
);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
it("draws original palette bytes and changes the real canvas after pointer editing", async () => {
  const source: NativePixelDocument = {
    schemaVersion: 1 as const,
    width: 2,
    height: 1,
    palette: { R: "#FF0000", B: "#0000FF" },
    frames: [{ id: "one", layers: [{ id: "body", x: 0, y: 0, rows: ["R."] }] }],
  };
  let saved = source;
  function Harness() {
    const [document, setDocument] = useState(source);
    return createElement(NativePixelCanvas, {
      document,
      frameId: "one",
      zoom: 8,
      editable: true,
      onPaint: (x, y) =>
        setDocument((current) => {
          saved = paintPixel(current, "one", "body", x, y, "B");
          return saved;
        }),
    });
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  cleanups.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  await act(async () => root.render(createElement(Harness)));
  const canvas = host.querySelector("canvas")!;
  expect([
    ...backings.get(canvas)!.getContext("2d").getImageData(0, 0, 2, 1).data,
  ]).toEqual([255, 0, 0, 255, 0, 0, 0, 0]);
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
        clientX: 12,
        clientY: 4,
        button: 0,
        bubbles: true,
        pointerId: 1,
      }),
    );
    canvas.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, pointerId: 1 }),
    );
  });
  expect(saved.frames[0].layers![0].rows).toEqual(["RB"]);
  expect([
    ...backings.get(canvas)!.getContext("2d").getImageData(0, 0, 2, 1).data,
  ]).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
  expect(canvas.width).toBe(2);
  expect(canvas.height).toBe(1);
});
