import { fetch as tauriFetch, type ClientOptions } from "@tauri-apps/plugin-http";

export const GITHUB_RELEASES_URL = "https://github.com/mdportnov/soma/releases";
export const GITHUB_LATEST_RELEASE_API =
  "https://api.github.com/repos/mdportnov/soma/releases/latest";

export type UpdateCheckResult =
  | { status: "available"; latestVersion: string; releaseUrl: string }
  | { status: "current"; latestVersion: string; releaseUrl: string }
  | { status: "no_releases" };

type ParsedVersion = {
  core: [number, number, number];
  prerelease: string[];
  normalized: string;
};

type Fetcher = (input: string, init?: RequestInit & ClientOptions) => Promise<Response>;

const VERSION_PATTERN =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function parseVersion(version: string): ParsedVersion {
  const match = version.trim().match(VERSION_PATTERN);
  if (!match) throw new Error(`Invalid semantic version: ${version}`);

  const core = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  if (core.some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`Semantic version is too large: ${version}`);
  }

  const prerelease = match[4]?.split(".") ?? [];
  return {
    core: [...core],
    prerelease,
    normalized: `${core.join(".")}${prerelease.length ? `-${prerelease.join(".")}` : ""}`,
  };
}

function comparePrerelease(left: string[], right: string[]): number {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      const leftNumber = Number(leftPart);
      const rightNumber = Number(rightPart);
      if (!Number.isSafeInteger(leftNumber) || !Number.isSafeInteger(rightNumber)) {
        return leftPart.length === rightPart.length
          ? leftPart.localeCompare(rightPart)
          : leftPart.length > rightPart.length
            ? 1
            : -1;
      }
      return leftNumber > rightNumber ? 1 : -1;
    }
    if (leftNumeric) return -1;
    if (rightNumeric) return 1;
    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

export function compareVersions(leftVersion: string, rightVersion: string): number {
  const left = parseVersion(leftVersion);
  const right = parseVersion(rightVersion);

  for (let index = 0; index < left.core.length; index += 1) {
    if (left.core[index] === right.core[index]) continue;
    return left.core[index] > right.core[index] ? 1 : -1;
  }

  return comparePrerelease(left.prerelease, right.prerelease);
}

export async function checkLatestRelease(
  currentVersion: string,
  fetcher: Fetcher = tauriFetch,
): Promise<UpdateCheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetcher(GITHUB_LATEST_RELEASE_API, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
      },
      signal: controller.signal,
      connectTimeout: 10_000,
    });

    if (response.status === 404) return { status: "no_releases" };
    if (!response.ok) throw new Error(`GitHub Releases request failed: ${response.status}`);

    const payload: unknown = await response.json();
    if (
      typeof payload !== "object" ||
      payload === null ||
      !("tag_name" in payload) ||
      typeof payload.tag_name !== "string"
    ) {
      throw new Error("GitHub Releases returned an invalid response");
    }

    const latest = parseVersion(payload.tag_name);
    const releaseUrl = `${GITHUB_RELEASES_URL}/tag/${encodeURIComponent(payload.tag_name)}`;
    return {
      status: compareVersions(latest.normalized, currentVersion) > 0 ? "available" : "current",
      latestVersion: latest.normalized,
      releaseUrl,
    };
  } finally {
    clearTimeout(timer);
  }
}
