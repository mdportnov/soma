/**
 * QA: assert every seeded biomarker has a complete EN + RU reference explanation.
 *
 * Run with: pnpm tsx scripts/check-biomarker-info.ts
 *
 * Parses the canonical names out of the seed dictionary (the single source of
 * truth for which markers exist) and checks both language maps for full,
 * non-empty coverage of all four fields. Also flags orphan entries that no
 * longer match any seeded marker. Exits non-zero on any gap.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { biomarkerInfoEn } from "../src/content/biomarker-info.en";
import { biomarkerInfoRu } from "../src/content/biomarker-info.ru";
import type { BiomarkerInfo, BiomarkerInfoMap } from "../src/content/biomarker-info";

const here = dirname(fileURLToPath(import.meta.url));
const seedSrc = readFileSync(resolve(here, "../src/db/seed-biomarkers.ts"), "utf8");

const seededNames: string[] = [];
const nameRe = /name:\s*"([^"]+)",\s*\n\s*category:\s*"[^"]+"/g;
for (let m = nameRe.exec(seedSrc); m; m = nameRe.exec(seedSrc)) seededNames.push(m[1]);

if (seededNames.length === 0) {
  console.error("✗ Could not parse any biomarker names from the seed file.");
  process.exit(1);
}

const FIELDS: (keyof BiomarkerInfo)[] = ["summary", "high", "low", "affects"];
const errors: string[] = [];

function checkMap(label: string, map: BiomarkerInfoMap) {
  for (const name of seededNames) {
    const entry = map[name];
    if (!entry) {
      errors.push(`[${label}] missing entry: "${name}"`);
      continue;
    }
    for (const f of FIELDS) {
      const v = entry[f];
      if (typeof v !== "string" || v.trim().length < 10) {
        errors.push(`[${label}] "${name}".${f} is empty or too short`);
      }
    }
  }
  const seededSet = new Set(seededNames);
  for (const key of Object.keys(map)) {
    if (!seededSet.has(key)) errors.push(`[${label}] orphan entry not in seed: "${key}"`);
  }
}

checkMap("en", biomarkerInfoEn);
checkMap("ru", biomarkerInfoRu);

if (errors.length > 0) {
  console.error(`✗ Biomarker info coverage check failed (${errors.length} issue(s)):`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(
  `✓ Biomarker info coverage OK: ${seededNames.length} markers × 4 fields × {en, ru}, no gaps or orphans.`,
);
