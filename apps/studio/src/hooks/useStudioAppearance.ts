import { useEffect, useState } from "react";

export type StudioFontSize = "compact" | "standard" | "large";

export const studioFontSizeOptions: Array<{ value: StudioFontSize; label: string }> = [
  { value: "compact", label: "紧凑" },
  { value: "standard", label: "标准" },
  { value: "large", label: "大号" },
];

const storageKey = "petlord.studio.font-size";

export function normalizeStudioFontSize(value: string | null | undefined): StudioFontSize {
  return studioFontSizeOptions.some((option) => option.value === value) ? value as StudioFontSize : "standard";
}

function initialFontSize(): StudioFontSize {
  if (typeof window === "undefined") return "standard";
  return normalizeStudioFontSize(window.localStorage.getItem(storageKey));
}

export function useStudioAppearance() {
  const [fontSize, setFontSize] = useState<StudioFontSize>(initialFontSize);

  useEffect(() => {
    document.documentElement.dataset.uiFontSize = fontSize;
    window.localStorage.setItem(storageKey, fontSize);
  }, [fontSize]);

  return { fontSize, setFontSize, fontSizeOptions: studioFontSizeOptions };
}
