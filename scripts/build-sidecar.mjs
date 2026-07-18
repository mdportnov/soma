// Builds the Soma MCP stdio server into a single executable that Tauri bundles
// as an `externalBin`. Tauri resolves `externalBin` by appending the *target*
// triple being built (and `.exe` on Windows), so the output must be named
// `soma-mcp-<triple>[.exe]`.
//
// Cross-platform replacement for the old shell one-liner
// (`bun build … --outfile soma-mcp-$(rustc -Vv | sed -n 's/host: //p')`),
// which relied on POSIX command substitution + `sed` and broke on Windows.
//
// Target selection:
//   • $SOMA_SIDECAR_TARGET — explicit Rust triple (used by the release matrix
//     for the macOS Intel slice cross-compiled on an Apple-Silicon runner);
//   • otherwise the host triple from `rustc -Vv`.

import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpDir = join(repoRoot, "mcp");
const outDir = join(repoRoot, "src-tauri", "binaries");
const bunCacheDir = join(repoRoot, "src-tauri", "target", "bun-cache");

/** Rust target triple → Bun `--target` (for standalone cross-compilation). */
const BUN_TARGETS = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64-baseline",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64-baseline",
  "aarch64-pc-windows-msvc": "bun-windows-arm64",
};

function hostTriple() {
  const out = execFileSync("rustc", ["-Vv"], { encoding: "utf8" });
  const m = out.match(/^host:\s*(.+)$/m);
  if (!m) throw new Error("could not parse host triple from `rustc -Vv`");
  return m[1].trim();
}

const triple = process.env.SOMA_SIDECAR_TARGET?.trim() || hostTriple();
mkdirSync(outDir, { recursive: true });

function build(target, outFile) {
  const bunTarget = BUN_TARGETS[target];
  const args = ["build", "src/index.ts", "--compile", "--outfile", outFile];
  if (bunTarget) {
    args.push(`--target=${bunTarget}`);
  } else {
    console.warn(`[build-sidecar] unknown triple "${target}"; compiling for host arch`);
  }

  console.log(`[build-sidecar] target=${target} (bun ${bunTarget ?? "host"}) → ${outFile}`);

  const bun = process.platform === "win32" ? "bun.exe" : "bun";
  const env = { ...process.env };
  if (process.platform === "win32") {
    mkdirSync(bunCacheDir, { recursive: true });
    env.BUN_INSTALL_CACHE_DIR = bunCacheDir;
  }
  try {
    execFileSync(bun, args, { cwd: mcpDir, env, stdio: "inherit" });
  } catch (err) {
    if (err?.code === "ENOENT") {
      throw new Error(
        "`bun` was not found on PATH. Install it from https://bun.sh (the MCP sidecar is compiled with Bun).",
        { cause: err },
      );
    }
    throw err;
  }

  if (!existsSync(outFile)) {
    throw new Error(`[build-sidecar] expected output not found: ${outFile}`);
  }
}

if (triple === "universal-apple-darwin") {
  if (process.platform !== "darwin") {
    throw new Error("universal-apple-darwin sidecars can only be built on macOS");
  }

  const armFile = join(outDir, "soma-mcp-aarch64-apple-darwin");
  const intelFile = join(outDir, "soma-mcp-x86_64-apple-darwin");
  const outFile = join(outDir, "soma-mcp-universal-apple-darwin");
  build("aarch64-apple-darwin", armFile);
  build("x86_64-apple-darwin", intelFile);
  execFileSync("lipo", ["-create", armFile, intelFile, "-output", outFile], { stdio: "inherit" });
  chmodSync(outFile, 0o755);
  execFileSync("lipo", ["-archs", outFile], { stdio: "inherit" });
} else {
  const extension = triple.includes("windows") ? ".exe" : "";
  build(triple, join(outDir, `soma-mcp-${triple}${extension}`));
}

console.log(`[build-sidecar] ok`);
