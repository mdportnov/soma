const THEME_KEY = "soma.theme";

export type ThemePreference = "light" | "dark" | "system";

export function loadThemePreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") return stored;
  return "system";
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemePreference(pref: ThemePreference): void {
  const dark = pref === "system" ? systemPrefersDark() : pref === "dark";
  document.documentElement.classList.toggle("dark", dark);
  localStorage.setItem(THEME_KEY, pref);
}

/** Re-applies the theme when the OS appearance changes (while pref = system). */
export function watchSystemTheme(): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (loadThemePreference() === "system") applyThemePreference("system");
  };
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
