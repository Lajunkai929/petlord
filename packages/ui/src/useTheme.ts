import { useCallback, useEffect, useState } from "react";
import type { PetLordTheme } from "./theme";
interface ThemeBridge {
  getTheme?(): Promise<PetLordTheme>;
  setTheme?(theme: PetLordTheme): Promise<PetLordTheme>;
  onThemeChanged?(listener: (theme: PetLordTheme) => void): () => void;
}
export const themeStorageKey = "petlord.appearance.theme";
export function normalizeTheme(value: unknown): PetLordTheme { return value === "dark" ? "dark" : "light"; }
export function usePetLordTheme(bridge?: ThemeBridge) {
  const [theme, updateTheme] = useState<PetLordTheme>(() => {
    try { return normalizeTheme(localStorage.getItem(themeStorageKey)); } catch { return "light"; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme=theme;
    try { localStorage.setItem(themeStorageKey,theme); } catch {}
  },[theme]);
  useEffect(() => {
    let active=true;
    void bridge?.getTheme?.().then(value => {if(active)updateTheme(normalizeTheme(value));}).catch(() => undefined);
    const unsubscribe=bridge?.onThemeChanged?.(value => updateTheme(normalizeTheme(value)));
    return () => {active=false;unsubscribe?.();};
  },[bridge]);
  const setTheme=useCallback(async (next:PetLordTheme) => {
    if(bridge?.setTheme) updateTheme(normalizeTheme(await bridge.setTheme(next)));
    else updateTheme(next);
  },[bridge]);
  return {theme,setTheme};
}
