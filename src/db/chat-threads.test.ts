import { describe, expect, it } from "vitest";
import {
  THREAD_PREVIEW_MAX,
  THREAD_TITLE_MAX,
  deriveThreadTitle,
  escapeLike,
  messagePreview,
  parseRecordRefs,
  truncateAtWord,
} from "./chat-threads";

describe("deriveThreadTitle", () => {
  it("uses a short question verbatim, capitalized", () => {
    expect(deriveThreadTitle("what changed since June?")).toBe("What changed since June?");
  });

  it("collapses whitespace and newlines", () => {
    expect(deriveThreadTitle("  Ферритин\n\n  и   витамин D ")).toBe("Ферритин и витамин D");
  });

  it("drops a greeting prefix when something follows it", () => {
    expect(deriveThreadTitle("Привет! Подскажи, что по прививкам?")).toBe("Что по прививкам?");
    expect(deriveThreadTitle("hi, please check my labs")).toBe("Check my labs");
  });

  it("keeps a message that is only a greeting", () => {
    expect(deriveThreadTitle("Привет")).toBe("Привет");
  });

  it("cuts long messages at a word boundary with an ellipsis", () => {
    const long =
      "На что мне обратить внимание по моим последним анализам, учитывая лекарства и диагнозы?";
    const title = deriveThreadTitle(long)!;
    expect(title.length).toBeLessThanOrEqual(THREAD_TITLE_MAX + 1);
    expect(title.endsWith("…")).toBe(true);
    expect(title).not.toMatch(/\s…$/);
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });

  it("returns null when nothing title-worthy remains", () => {
    expect(deriveThreadTitle("   ")).toBeNull();
    expect(deriveThreadTitle("👍👍")).toBeNull();
    expect(deriveThreadTitle("???")).toBeNull();
  });

  it("strips leading quotes and dashes", () => {
    expect(deriveThreadTitle("— «ферритин 12»")).toBe("Ферритин 12");
  });
});

describe("truncateAtWord", () => {
  it("returns short text unchanged", () => {
    expect(truncateAtWord("short", 10)).toBe("short");
  });

  it("hard-cuts a single overlong word", () => {
    expect(truncateAtWord("a".repeat(30), 10)).toBe(`${"a".repeat(10)}…`);
  });

  it("does not leave dangling punctuation before the ellipsis", () => {
    expect(truncateAtWord("one two, three four", 9)).toBe("one two…");
  });
});

describe("messagePreview", () => {
  it("caps at the preview length", () => {
    const preview = messagePreview("word ".repeat(60));
    expect(preview.length).toBeLessThanOrEqual(THREAD_PREVIEW_MAX + 1);
  });
});

describe("parseRecordRefs", () => {
  it("extracts unique refs in order of first appearance", () => {
    const content =
      "Ferritin fell [record:biomarker:12] on the June panel [record:lab_panel:7]; " +
      "see also [record:biomarker:12] and [record:medication:3].";
    expect(parseRecordRefs(content)).toEqual([
      { entityType: "biomarker", entityId: 12 },
      { entityType: "lab_panel", entityId: 7 },
      { entityType: "medication", entityId: 3 },
    ]);
  });

  it("ignores malformed tokens", () => {
    expect(parseRecordRefs("[record:biomarker:0] [record:Biomarker:1] [record:x]")).toEqual([]);
  });

  it("returns an empty list for plain text", () => {
    expect(parseRecordRefs("no refs here")).toEqual([]);
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and the escape character", () => {
    expect(escapeLike("50%_x\\y")).toBe("50\\%\\_x\\\\y");
  });
});
