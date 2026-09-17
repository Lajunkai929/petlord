import { useEffect, useState } from "react";
import type { DesktopRuntimeSettings } from "../desktopBridge";

const storageKey = "petlord.desktop.settings.v1";

export const defaultDesktopSettings: DesktopRuntimeSettings = {
  settingsVersion: 2,
  theme: "light",
  launchAtLogin: false,
  alwaysOnTop: false,
  clickThrough: false,
  displaySize: 320,
  frameRate: 24,
  renderResolution: 480,
  pixelGridSize: 64,
  pixelated: false,
  dock: "right",
  gazeTrackingArea: "wide",
  muted: true,
  todoEnabled: true,
  desktopWasteEnabled: false,
  pluginGrants: {},
  pluginEnabled: {},
};

function loadBrowserSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null") as Partial<DesktopRuntimeSettings> | null;
    return { ...defaultDesktopSettings, ...stored };
  } catch {
    return defaultDesktopSettings;
  }
}

export function useDesktopSettings() {
  const [settings, setSettings] = useState(defaultDesktopSettings);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { document.documentElement.dataset.theme = settings.theme === "dark" ? "dark" : "light"; }, [settings.theme]);

  useEffect(() => {
    let cancelled = false;
    const load = window.petLordDesktop?.getSettings?.() ?? Promise.resolve(loadBrowserSettings());
    void load.then((loaded) => {
      if (!cancelled) setSettings({ ...defaultDesktopSettings, ...loaded });
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "运行设置加载失败");
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    const unsubscribe = window.petLordDesktop?.onClickThroughChanged?.((clickThrough) => {
      setSettings((current) => ({ ...current, clickThrough }));
      setMessage(clickThrough ? "点击穿透已开启，按 ⌘/Ctrl + Shift + P 可恢复交互。" : "点击穿透已关闭。");
    });
    const unsubscribeSettings = window.petLordDesktop?.onSettingsChanged?.((next) => {
      setSettings({ ...defaultDesktopSettings, ...next });
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
      unsubscribeSettings?.();
    };
  }, []);

  async function update(patch: Partial<DesktopRuntimeSettings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    setError("");
    try {
      if (window.petLordDesktop?.updateSettings) {
        setSettings(await window.petLordDesktop.updateSettings(patch));
      } else {
        localStorage.setItem(storageKey, JSON.stringify(next));
      }
      setMessage("设置已保存。");
    } catch (caught) {
      setSettings(settings);
      setError(caught instanceof Error ? caught.message : "设置保存失败");
    }
  }

  async function exportDiagnostics() {
    setError("");
    if (!window.petLordDesktop?.exportDiagnostics) {
      setError("诊断报告只能在安装版桌面应用中导出。");
      return;
    }
    try {
      const path = await window.petLordDesktop.exportDiagnostics();
      if (path) setMessage("诊断报告已导出，可发送给制作者排查问题。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "诊断报告导出失败");
    }
  }

  return { settings, open, setOpen, busy, message, error, update, exportDiagnostics, isDesktop: Boolean(window.petLordDesktop) };
}

export type DesktopSettingsController = ReturnType<typeof useDesktopSettings>;
