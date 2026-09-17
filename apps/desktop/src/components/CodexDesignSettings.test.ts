// @vitest-environment happy-dom
import { afterEach, expect, it } from "vitest";
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CodexDesignSettings } from "./CodexDesignSettings";
import type { CodexNotificationStatus } from "../codexNotificationTypes";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; delete window.petLordDesktop; });
const button = (name: string) => [...document.querySelectorAll("button")].find(item => item.textContent?.replace(/\s/g, "") === name)!;
async function mount(fail = false) {
  let status: CodexNotificationStatus = { available: true, configured: false, helperReady: false, requiresHookReview: false, configPath: "/isolated/hooks.json", message: "尚未配置" };
  let installs = 0; let tests = 0;
  window.petLordDesktop = {
    getCodexDesignStatus: async () => ({ available: true, connected: true, message: "", launcherReady: true, conflict: false, requiresReload: false }),
    getCodexNotificationStatus: async () => status,
    installCodexNotifications: async () => { installs++; if (fail) throw new Error("hooks.json 无法合并"); return status = { ...status, configured: true, helperReady: true, requiresHookReview: true, message: "配置已写入" }; },
    testCodexNotifications: async () => { tests++; return status = { ...status, lastTestAt: new Date().toISOString() }; },
  } as unknown as NonNullable<Window["petLordDesktop"]>;
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(h(CodexDesignSettings)));
  return { get installs() { return installs; }, get tests() { return tests; } };
}
it("installs task notifications next to Codex connection and distinguishes self-test from observed live events", async () => {
  const test = await mount();
  expect(document.body.textContent).toContain("任务提醒");
  await act(async () => button("配置任务提醒").click());
  expect(test.installs).toBe(1);
  expect(document.body.textContent).toContain("/hooks");
  expect(document.body.textContent).toContain("等待真实任务");
  await act(async () => button("发送自测提醒").click());
  expect(test.tests).toBe(1);
  expect(document.body.textContent).toContain("自测已送达");
  expect(document.body.textContent).toContain("等待真实任务");
  expect(document.body.textContent).not.toContain("已收到真实任务");
});
it("keeps failed installation visible and lets the user retry without claiming configuration succeeded", async () => {
  const test = await mount(true);
  await act(async () => button("配置任务提醒").click());
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("hooks.json 无法合并");
  expect(button("配置任务提醒").disabled).toBe(false);
  expect(test.installs).toBe(1); expect(document.body.textContent).not.toContain("等待真实任务");
});
