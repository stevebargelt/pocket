import { DEFAULT_SESSION_SECONDS } from "../shared/constants";

export type Theme = "dark" | "light";

export interface Settings {
  sessionSeconds: number;
  theme: Theme;
}

const KEY = "pocket.settings";

const DEFAULTS: Settings = {
  sessionSeconds: DEFAULT_SESSION_SECONDS,
  theme: "dark",
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
