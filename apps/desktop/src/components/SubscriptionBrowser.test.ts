// @vitest-environment happy-dom
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ConfigProvider } from "@petlord/ui";
import { petLordAntdTheme } from "@petlord/ui";
import { useDesktopPetPackage } from "../hooks/useDesktopPetPackage";
import { SubscriptionBrowser } from "./SubscriptionBrowser";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ""; localStorage.clear(); delete window.petLordDesktop; });
const button = (name: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.replace(/\s/g, "") === name)!;
async function fill(value: string) { await act(async () => { const input = document.querySelector<HTMLInputElement>('input[aria-label="服务器地址"]')!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }

it("discards a cancelled address and only remembers a successfully connected server", async () => {
  const list = vi.fn().mockResolvedValue([]);
  window.petLordDesktop = { loadPackage: async () => undefined, listPackages: async () => [], listSubscriptionPackages: list } as unknown as NonNullable<typeof window.petLordDesktop>;
  function Harness() { const petPackages = useDesktopPetPackage(); return h(SubscriptionBrowser, { petPackages }); }
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(h(ConfigProvider, { theme: { ...petLordAntdTheme("light"), token: { motion: false } } }, h(Harness))));
  expect(document.querySelector("form")).toBeNull();
  await act(async () => button("浏览作品").click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await fill("https://discard.example.com");
  await act(async () => button("关闭").click());
  expect(localStorage.getItem("petlord.desktop.subscription-url.v1")).toBeNull();
  await act(async () => button("浏览作品").click());
  expect(document.querySelector<HTMLInputElement>("input")?.value).not.toContain("discard");
  await fill("file:///tmp/pets");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("HTTP 或 HTTPS");
  expect(list).not.toHaveBeenCalled();
  await fill("https://creator.example.com/api/library/packages");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(list).toHaveBeenCalledWith("https://creator.example.com");
  expect(localStorage.getItem("petlord.desktop.subscription-url.v1")).toBe("https://creator.example.com");
  list.mockRejectedValueOnce(new Error("服务器暂时不可用"));
  await fill("https://unavailable.example.com");
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("服务器暂时不可用");
  expect(localStorage.getItem("petlord.desktop.subscription-url.v1")).toBe("https://creator.example.com");
});
