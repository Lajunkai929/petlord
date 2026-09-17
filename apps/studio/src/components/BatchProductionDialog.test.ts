// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BatchProductionDialog } from "./BatchProductionDialog";
import type { BatchProductionController } from "../hooks/useBatchProduction";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; });
it("labels batch choices without nested labels and blocks changes during execution", async () => {
  const toggle = vi.fn();
  const controller = {
    open: true, running: false, items: [{ key: "state-1", action: "generate-state", label: "生成待机图", detail: "待机", unknownPrice: false }],
    selectedKeys: [], selected: [], budget: { committedCny: 0, limitCny: 100, remainingCny: 100, usageRatio: 0 },
    cost: { minimumCny: 0, maximumCny: 0 }, progress: { completed: 0, total: 1 },
    toggle, setOpen: vi.fn(), selectAction: vi.fn(), execute: vi.fn(),
  } as unknown as BatchProductionController;
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const render = async () => { await act(async () => root.render(h(BatchProductionDialog, { controller }))); };
  await render();
  const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  const label = checkbox.closest("label")!;
  expect(label.textContent).toContain("生成待机图");
  expect(label.querySelector("label")).toBeNull();
  await act(async () => checkbox.click());
  expect(toggle).toHaveBeenCalledOnce();
  expect(toggle).toHaveBeenCalledWith("state-1");
  controller.running = true;
  await render();
  expect(checkbox.disabled).toBe(true);
  await act(async () => checkbox.click());
  expect(toggle).toHaveBeenCalledOnce();
  expect(document.querySelector<HTMLButtonElement>('button[aria-label="关闭批量制作"]')?.type).toBe("button");
});
