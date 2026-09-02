import { describe, expect, it } from "vitest";
import type { ChatThreadSummary } from "@/db/chat-repos";
import { groupThreads, relativeActivity, threadGroupKey } from "./thread-groups";

const now = new Date(2026, 8, 2, 15, 0, 0);

function thread(id: number, updatedAt: string): ChatThreadSummary {
  return {
    id,
    profileId: 1,
    title: null,
    titleSource: "auto",
    status: "active",
    createdAt: updatedAt,
    updatedAt,
    archivedAt: null,
    displayTitle: null,
    messageCount: 0,
    lastMessageAt: null,
    lastMessageRole: null,
    lastMessagePreview: null,
    lastProviderId: null,
    lastModelId: null,
    committedChangeSets: 0,
    pendingChangeSets: 0,
    citedRecords: 0,
    changedRecords: 0,
  };
}

describe("threadGroupKey", () => {
  it("buckets by local calendar day", () => {
    expect(threadGroupKey(new Date(2026, 8, 2, 0, 5).toISOString(), now)).toBe("today");
    expect(threadGroupKey(new Date(2026, 8, 1, 23, 55).toISOString(), now)).toBe("yesterday");
    expect(threadGroupKey(new Date(2026, 7, 27, 12, 0).toISOString(), now)).toBe("lastWeek");
    expect(threadGroupKey(new Date(2026, 7, 25, 12, 0).toISOString(), now)).toBe("earlier");
  });

  it("treats a clock-skewed future stamp as today", () => {
    expect(threadGroupKey(new Date(2026, 8, 3, 1, 0).toISOString(), now)).toBe("today");
  });
});

describe("groupThreads", () => {
  it("keeps display order and drops empty buckets", () => {
    const groups = groupThreads(
      [
        thread(1, new Date(2026, 7, 1).toISOString()),
        thread(2, new Date(2026, 8, 2, 9).toISOString()),
        thread(3, new Date(2026, 8, 2, 8).toISOString()),
      ],
      now,
    );
    expect(groups.map((g) => g.key)).toEqual(["today", "earlier"]);
    expect(groups[0].threads.map((t) => t.id)).toEqual([2, 3]);
  });
});

describe("relativeActivity", () => {
  it("is relative within a week and a date beyond it", () => {
    const format = (iso: string) => `D:${iso.slice(0, 10)}`;
    expect(relativeActivity(new Date(2026, 8, 2, 14, 30).toISOString(), "en", now, format)).toBe(
      "30 minutes ago",
    );
    expect(relativeActivity(new Date(2026, 8, 2, 12, 0).toISOString(), "en", now, format)).toBe(
      "3 hours ago",
    );
    expect(relativeActivity(new Date(2026, 8, 1, 12, 0).toISOString(), "en", now, format)).toBe(
      "yesterday",
    );
    expect(relativeActivity(new Date(2026, 7, 20, 12, 0).toISOString(), "en", now, format)).toBe(
      "D:2026-08-20",
    );
  });

  it("returns an empty string for garbage", () => {
    expect(relativeActivity("nope", "en", now)).toBe("");
  });
});
