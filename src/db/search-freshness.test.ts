import { beforeEach, describe, expect, it } from "vitest";
import {
  currentDataRevision,
  isSearchIndexStale,
  markSearchIndexBuilt,
  markSearchIndexStale,
  resetSearchFreshness,
} from "./search-freshness";

describe("search index freshness", () => {
  beforeEach(() => resetSearchFreshness());

  it("treats a never-built profile as stale", () => {
    // The renderer cannot see what the previous session — or the MCP sidecar
    // writing the same file from another process — changed while it was gone.
    expect(isSearchIndexStale(1)).toBe(true);
  });

  it("is fresh after a rebuild and stale again after any write", () => {
    markSearchIndexBuilt(1, currentDataRevision());
    expect(isSearchIndexStale(1)).toBe(false);

    markSearchIndexStale();
    expect(isSearchIndexStale(1)).toBe(true);
  });

  it("stays stale when a write lands in the middle of a rebuild", () => {
    // The regression: a rebuild that stamps "fresh" with the revision it read
    // AFTER collecting rows would swallow the delete that happened meanwhile,
    // and the deleted record would keep answering searches.
    const revision = currentDataRevision();
    markSearchIndexStale(); // a delete, while the rebuild is reading
    markSearchIndexBuilt(1, revision);
    expect(isSearchIndexStale(1)).toBe(true);
  });

  it("tracks profiles independently", () => {
    markSearchIndexBuilt(1, currentDataRevision());
    expect(isSearchIndexStale(1)).toBe(false);
    expect(isSearchIndexStale(2)).toBe(true);
  });

  it("invalidates every profile on a write, since writers know only record ids", () => {
    markSearchIndexBuilt(1, currentDataRevision());
    markSearchIndexBuilt(2, currentDataRevision());
    markSearchIndexStale();
    expect(isSearchIndexStale(1)).toBe(true);
    expect(isSearchIndexStale(2)).toBe(true);
  });

  it("never throws — a mark must not be able to fail the write it accompanies", () => {
    expect(() => {
      for (let i = 0; i < 1000; i++) markSearchIndexStale();
    }).not.toThrow();
    expect(currentDataRevision()).toBe(1000);
  });
});
