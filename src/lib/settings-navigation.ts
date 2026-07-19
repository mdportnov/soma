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

export function settingsPath(section: SettingsSection): string {
  return `/settings?section=${section}`;
}

export function settingsSectionFromSearch(search: string): SettingsSection | null {
  const section = new URLSearchParams(search).get("section");
  return SETTINGS_SECTIONS.find((candidate) => candidate === section) ?? null;
}
