export const SETTINGS_SECTIONS = [
  "appearance",
  "updates",
  "sections",
  "dashboard",
  "reset",
  "profile",
  "emergency",
  "ai",
  "mcp",
  "backup",
  "encryption",
  "export",
  "logs",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SETTINGS_TABS = ["general", "ai", "profile", "data"] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

export const SECTION_TAB: Record<SettingsSection, SettingsTab> = {
  appearance: "general",
  updates: "general",
  sections: "general",
  dashboard: "general",
  ai: "ai",
  mcp: "ai",
  profile: "profile",
  emergency: "profile",
  backup: "data",
  encryption: "data",
  export: "data",
  logs: "data",
  reset: "data",
};

export function settingsPath(section: SettingsSection): string {
  return `/settings?section=${section}`;
}

export function settingsSectionFromSearch(search: string): SettingsSection | null {
  const section = new URLSearchParams(search).get("section");
  return SETTINGS_SECTIONS.find((candidate) => candidate === section) ?? null;
}
