import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The module pulls in repos → the Tauri SQL client; stub it so these stay pure
// node tests. Only the localStorage round-trip (collect ↔ apply) is exercised.
vi.mock("@/db/repos", () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}));

import { applyPersonalization, collectPersonalization } from "./personalization";
import { loadInterests, saveInterests, SECTION_GROUPS } from "./interests";
import { loadDashboardWidgets, saveDashboardWidgets, DASHBOARD_WIDGETS } from "./dashboard-prefs";
import { loadNotificationPrefs, saveNotificationPrefs } from "./notifications";

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) ?? null) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemStorage());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collectPersonalization", () => {
  it("captures hidden complements and notification mutes", () => {
    saveInterests(new Set(SECTION_GROUPS.filter((g) => g !== "ai")));
    saveDashboardWidgets(new Set(DASHBOARD_WIDGETS.filter((w) => w !== "safetyBanner")));
    saveNotificationPrefs({ medication: false, retest: true, retestUpcoming: true });

    const bundle = collectPersonalization();
    expect(bundle.sectionsHidden).toEqual(["ai"]);
    expect(bundle.dashboardHidden).toEqual(["safetyBanner"]);
    expect(bundle.notifications).toMatchObject({ medication: false });
  });

  it("is empty when nothing is hidden", () => {
    const bundle = collectPersonalization();
    expect(bundle.sectionsHidden).toEqual([]);
    expect(bundle.dashboardHidden).toEqual([]);
  });
});

describe("applyPersonalization", () => {
  it("round-trips a collected bundle onto a fresh store", () => {
    saveInterests(new Set(SECTION_GROUPS.filter((g) => g !== "vaccines")));
    saveDashboardWidgets(new Set(DASHBOARD_WIDGETS.filter((w) => w !== "activity")));
    saveNotificationPrefs({ medication: true, retest: false, retestUpcoming: false });
    const bundle = collectPersonalization();

    // Simulate a fresh device.
    vi.stubGlobal("localStorage", new MemStorage());
    applyPersonalization(bundle);

    expect(loadInterests().has("vaccines")).toBe(false);
    expect(loadDashboardWidgets().has("activity")).toBe(false);
    expect(loadNotificationPrefs()).toMatchObject({ retest: false, retestUpcoming: false });
  });

  it("leaves a section visible by default when the bundle predates it", () => {
    // A bundle that only knows about an older, smaller section list must not hide
    // sections it never heard of.
    applyPersonalization({ sectionsHidden: ["meds"] });
    const enabled = loadInterests();
    expect(enabled.has("meds")).toBe(false);
    expect(enabled.has("ai")).toBe(true);
  });
});
