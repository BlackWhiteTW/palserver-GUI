import { useState } from "react";
import { FiMonitor, FiMoon, FiSun } from "react-icons/fi";

/**
 * 深淺色模式:三段式 —— 跟隨系統(預設)/ 淺色 / 深色。
 * 手動選擇時在 <html> 上掛 data-theme,styles.css 據此覆蓋色票;
 * 「跟隨系統」則拿掉 data-theme,交回 prefers-color-scheme。
 * 選擇存 localStorage,main.tsx 在 React 掛載前先套用,避免閃色。
 */

export type ThemeMode = "auto" | "light" | "dark";

const KEY = "palserver.theme";
const ORDER: ThemeMode[] = ["auto", "light", "dark"];
const LABELS: Record<ThemeMode, string> = {
  auto: "跟隨系統",
  light: "淺色模式",
  dark: "深色模式",
};

export function loadThemeMode(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  if (mode === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = mode;
}

/** header 上的圓形切換鈕,點一下循環:跟隨系統 → 淺色 → 深色。 */
export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(loadThemeMode);
  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(next);
    applyThemeMode(next);
    try {
      if (next === "auto") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {
      /* 無痕模式等存不進去就只作用這一次 */
    }
  };
  const Icon = mode === "light" ? FiSun : mode === "dark" ? FiMoon : FiMonitor;
  return (
    <button
      className="rounded-full border-2 border-line bg-card-soft p-2 text-ink transition hover:-translate-y-px hover:border-pal active:translate-y-0 active:scale-95"
      onClick={cycle}
      title={`外觀:${LABELS[mode]}(點擊切換)`}
      aria-label={`外觀:${LABELS[mode]}`}
    >
      <Icon className="size-4" />
    </button>
  );
}
