import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = join(import.meta.dirname, "..");
const version = process.argv[2];
const identifier = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const semver = new RegExp(
  String.raw`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(${identifier}(?:\.${identifier})*))?$`,
);

if (!version || !semver.test(version)) {
  throw new Error("usage: pnpm release:prepare <major.minor.patch[-prerelease]>");
}

const parseVersion = (value) => {
  const match = semver.exec(value);
  if (!match) throw new Error(`invalid SemVer: ${value}`);
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split(".") ?? [],
  };
};

const compareVersions = (left, right) => {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index] !== b.core[index]) return a.core[index] > b.core[index] ? 1 : -1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length === b.prerelease.length ? 0 : a.prerelease.length ? -1 : 1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined || rightPart === undefined) return leftPart === undefined ? -1 : 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart > rightPart ? 1 : -1;
  }
  return 0;
};

const currentVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
if (compareVersions(version, currentVersion) <= 0) {
  throw new Error(`release version ${version} must be newer than ${currentVersion}`);
}

const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
if (status.trim()) {
  throw new Error("release preparation requires a clean working tree");
}

const updateJson = (relativePath) => {
  const path = join(root, relativePath);
  const value = JSON.parse(readFileSync(path, "utf8"));
  value.version = version;
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
};

updateJson("package.json");
updateJson("mcp/package.json");

const cargoTomlPath = join(root, "src-tauri/Cargo.toml");
const cargoToml = readFileSync(cargoTomlPath, "utf8").replace(
  /^(\[package\]\nname = "soma"\nversion = ")[^"]+("$)/m,
  `$1${version}$2`,
);
writeFileSync(cargoTomlPath, cargoToml);

const cargoLockPath = join(root, "src-tauri/Cargo.lock");
const cargoLock = readFileSync(cargoLockPath, "utf8").replace(
  /(\[\[package\]\]\nname = "soma"\nversion = ")[^"]+("\n)/,
  `$1${version}$2`,
);
writeFileSync(cargoLockPath, cargoLock);

const changelogPath = join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8");
const marker = "## [Unreleased]\n";
if (!changelog.includes(marker)) {
  throw new Error("CHANGELOG.md is missing the Unreleased section");
}
if (changelog.includes(`## [${version}]`)) {
  throw new Error(`CHANGELOG.md already contains ${version}`);
}
const date = new Date().toISOString().slice(0, 10);
writeFileSync(changelogPath, changelog.replace(marker, `${marker}\n## [${version}] — ${date}\n`));

execFileSync(
  "pnpm",
  ["exec", "prettier", "--write", "package.json", "mcp/package.json", "CHANGELOG.md"],
  {
    cwd: root,
    stdio: "inherit",
  },
);
execFileSync("node", ["scripts/version.mjs", "check"], { cwd: root, stdio: "inherit" });

console.log(`Prepared v${version}. Review CHANGELOG.md, commit, and push tag v${version}.`);
