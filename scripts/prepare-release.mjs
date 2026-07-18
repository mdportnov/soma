import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = join(import.meta.dirname, "..");
const version = process.argv[2];
const semver = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

if (!version || !semver.test(version)) {
  throw new Error("usage: pnpm release:prepare <major.minor.patch[-prerelease]>");
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
