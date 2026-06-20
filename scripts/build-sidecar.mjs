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
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mcpDir = join(repoRoot, "mcp");
const outDir = join(repoRoot, "src-tauri", "binaries");

/** Rust target triple → Bun `--target` (for standalone cross-compilation). */
const BUN_TARGETS = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-unknown-linux-gnu": "bun-linux-x64",
  "aarch64-unknown-linux-gnu": "bun-linux-arm64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "aarch64-pc-windows-msvc": "bun-windows-x64",
};

function hostTriple() {
  const out = execFileSync("rustc", ["-Vv"], { encoding: "utf8" });
  const m = out.match(/^host:\s*(.+)$/m);
  if (!m) throw new Error("could not parse host triple from `rustc -Vv`");
  return m[1].trim();
}

const triple = process.env.SOMA_SIDECAR_TARGET?.trim() || hostTriple();
const bunTarget = BUN_TARGETS[triple];
const isWindows = triple.includes("windows");
const outFile = join(outDir, `soma-mcp-${triple}${isWindows ? ".exe" : ""}`);

mkdirSync(outDir, { recursive: true });

const args = ["build", "src/index.ts", "--compile", "--outfile", outFile];
if (bunTarget) {
  args.push(`--target=${bunTarget}`);
} else {
  console.warn(`[build-sidecar] unknown triple "${triple}"; compiling for host arch`);
}

console.log(`[build-sidecar] target=${triple} (bun ${bunTarget ?? "host"}) → ${outFile}`);

const bun = process.platform === "win32" ? "bun.exe" : "bun";
try {
  execFileSync(bun, args, { cwd: mcpDir, stdio: "inherit" });
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
console.log(`[build-sidecar] ok`);
