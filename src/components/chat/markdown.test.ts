import { describe, expect, it } from "vitest";
import { parseBlocks } from "./Markdown";

describe("parseBlocks", () => {
  it("splits the shapes models write into blocks", () => {
    const blocks = parseBlocks(
      "## Итог\nСтрока один\nстрока два\n\n- **A** [record:vaccine:1]\n- B\n  продолжение\n\n1. one\n2. two\n\n> note\n\n```\ncode\n```\n---",
    );
    expect(blocks).toEqual([
      { type: "h", level: 2, text: "Итог" },
      { type: "p", text: "Строка один\nстрока два" },
      { type: "ul", items: ["**A** [record:vaccine:1]", "B\nпродолжение"] },
      { type: "ol", items: ["one", "two"], start: 1 },
      { type: "quote", text: "note" },
      { type: "code", text: "code" },
      { type: "hr" },
    ]);
  });
});
