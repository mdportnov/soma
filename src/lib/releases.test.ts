import { describe, expect, it, vi } from "vitest";
import {
  GITHUB_LATEST_RELEASE_API,
  GITHUB_RELEASES_URL,
  checkLatestRelease,
  compareVersions,
} from "./releases";

describe("compareVersions", () => {
  it.each([
    ["0.2.0", "0.1.9", 1],
    ["0.10.0", "0.9.0", 1],
    ["v1.0.0", "1.0.0", 0],
    ["1.0.0-beta.2", "1.0.0-beta.10", -1],
    ["1.0.0-beta", "1.0.0", -1],
    ["1.0.0+build.2", "1.0.0+build.1", 0],
  ])("compares %s with %s", (left, right, expected) => {
    expect(compareVersions(left, right)).toBe(expected);
  });

  it("rejects non-semantic versions", () => {
    expect(() => compareVersions("latest", "1.0.0")).toThrow("Invalid semantic version");
  });
});

describe("checkLatestRelease", () => {
  it("reports a newer release and builds a fixed-origin URL", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ tag_name: "v0.2.0", html_url: "https://example.com/unsafe" }),
    );

    await expect(checkLatestRelease("0.1.0", fetcher)).resolves.toEqual({
      status: "available",
      latestVersion: "0.2.0",
      releaseUrl: `${GITHUB_RELEASES_URL}/tag/v0.2.0`,
    });
    expect(fetcher).toHaveBeenCalledWith(
      GITHUB_LATEST_RELEASE_API,
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: "application/vnd.github+json" }),
      }),
    );
  });

  it("reports the installed version as current", async () => {
    const fetcher = vi.fn(async () => Response.json({ tag_name: "v0.1.0" }));

    await expect(checkLatestRelease("0.1.0", fetcher)).resolves.toMatchObject({
      status: "current",
      latestVersion: "0.1.0",
    });
  });

  it("handles a repository without published releases", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));

    await expect(checkLatestRelease("0.1.0", fetcher)).resolves.toEqual({
      status: "no_releases",
    });
  });

  it("rejects GitHub errors and malformed responses", async () => {
    const failedFetcher = vi.fn(async () => new Response(null, { status: 503 }));
    const malformedFetcher = vi.fn(async () => Response.json({ name: "missing tag" }));

    await expect(checkLatestRelease("0.1.0", failedFetcher)).rejects.toThrow(
      "GitHub Releases request failed: 503",
    );
    await expect(checkLatestRelease("0.1.0", malformedFetcher)).rejects.toThrow(
      "GitHub Releases returned an invalid response",
    );
  });
});
