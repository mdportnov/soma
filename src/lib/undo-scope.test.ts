import { describe, expect, it } from "vitest";
import { undoCaveatLines, undoToastCaveat } from "./undo-scope";

const t = (key: string) => key;

describe("undoCaveatLines", () => {
  it("maps each caveat to its dialog line, deduplicated, in order", () => {
    expect(undoCaveatLines(t, ["file", "log", "file"])).toEqual([
      "confirm.undoCaveat.file",
      "confirm.undoCaveat.log",
    ]);
  });
});

describe("undoToastCaveat", () => {
  it("is absent when Undo is complete", () => {
    expect(undoToastCaveat(t, [])).toBeUndefined();
    expect(undoToastCaveat(t, undefined)).toBeUndefined();
  });

  it("joins several caveats into one line", () => {
    expect(undoToastCaveat(t, ["file", "links"])).toBe(
      "toasts.undoCaveat.file toasts.undoCaveat.links",
    );
  });
});
