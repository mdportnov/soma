import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const root = join(import.meta.dirname, "..");
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));
const rootPackage = readJson("package.json");
const mcpPackage = readJson("mcp/package.json");
const cargoToml = readFileSync(join(root, "src-tauri/Cargo.toml"), "utf8");
const cargoLock = readFileSync(join(root, "src-tauri/Cargo.lock"), "utf8");
const identifier = String.raw`(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)`;
const semver = new RegExp(
  String.raw`^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-${identifier}(?:\.${identifier})*)?$`,
);

const cargoVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];
const lockedVersion = cargoLock.match(/\[\[package\]\]\nname = "soma"\nversion = "([^"]+)"/)?.[1];
const versions = new Map([
  ["package.json", rootPackage.version],
  ["mcp/package.json", mcpPackage.version],
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/Cargo.lock", lockedVersion],
]);

for (const [file, version] of versions) {
  if (!version || !semver.test(version)) {
    throw new Error(`${file} does not contain a valid SemVer version`);
  }
  if (version !== rootPackage.version) {
    throw new Error(`${file} has ${version}; expected ${rootPackage.version}`);
  }
}

const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : undefined;
if (tag && tag !== `v${rootPackage.version}`) {
  throw new Error(`tag ${tag} does not match app version v${rootPackage.version}`);
}

console.log(`Soma version ${rootPackage.version} is consistent`);
