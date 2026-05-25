import { DEFAULT_CONTEXT, DEFAULT_SESSION_SECONDS, type Context } from "../shared/constants";

export type Theme = "dark" | "light";

export interface Settings {
  sessionSeconds: number;
  theme: Theme;
  /** Last-used practice context, so the picker reopens where Steve left off (D4). */
  context: Context;
}

const KEY = "pocket.settings";

const DEFAULTS: Settings = {
  sessionSeconds: DEFAULT_SESSION_SECONDS,
  theme: "dark",
  context: DEFAULT_CONTEXT,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
  applyTheme(s.theme);
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
