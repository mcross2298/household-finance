/* Doc-drift gate for the CSV/category contract. js/store/00-state.js is the
   single source of truth (CATEGORIES, CSV_HEADER) — this script never edits
   docs, it only fails CI when a doc has quietly gone stale against it. No
   build step for the app itself; this is CI-only tooling, same pattern as
   scripts/run-tests.mjs.

   Checks:
   - Every fenced CSV header line in the docs matches Store.CSV_HEADER exactly.
   - Every prose enumeration of the category list matches CATEGORIES exactly
     (same 19 names, same order).
   - Every "N-category" claim (e.g. "19-category") matches CATEGORIES.length.  */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

function extractArray(src, constName) {
  const m = src.match(new RegExp(`const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) throw new Error(`Could not find "${constName}" in js/store/00-state.js`);
  return [...m[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
}

const storeSrc = await readFile(resolve(ROOT, 'js/store/00-state.js'), 'utf8');
const CATEGORIES = extractArray(storeSrc, 'CATEGORIES');
const CSV_HEADER = extractArray(storeSrc, 'CSV_HEADER');

const DOCS = ['CLAUDE.md', 'README.md'];

for (const relPath of DOCS) {
  let text;
  try { text = await readFile(resolve(ROOT, relPath), 'utf8'); }
  catch { continue; }

  // Fenced CSV header lines, e.g. "Date,Category,Description,Amount,Who,Account,Notes"
  const headerLine = CSV_HEADER.join(',');
  for (const m of text.matchAll(/^([A-Z][A-Za-z]*(?:,[A-Za-z]+)+)$/gm)) {
    if (!m[1].startsWith('Date,')) continue;
    if (m[1] !== headerLine) {
      errors.push(`${relPath}: CSV header line "${m[1]}" does not match Store.CSV_HEADER "${headerLine}"`);
    }
  }

  // "N-category" claims, e.g. "19-category"
  for (const m of text.matchAll(/(\d+)-category/g)) {
    if (+m[1] !== CATEGORIES.length) {
      errors.push(`${relPath}: says "${m[1]}-category" but CATEGORIES has ${CATEGORIES.length} entries`);
    }
  }

  // Prose enumeration: a comma-separated run containing >= 10 known category
  // names in a row is treated as "the list" and checked for an exact match.
  // Whitespace (including line wraps inside markdown paragraphs) is collapsed
  // first so a list that wraps across lines still reads as one run.
  const flat = text.replace(/\s+/g, ' ');
  const catSet = new Set(CATEGORIES);
  const runRe = /(?:[A-Za-z][A-Za-z &]*(?:, )){9,}[A-Za-z][A-Za-z &]*/g;
  for (const m of flat.matchAll(runRe)) {
    const names = m[0].split(', ').map(s => s.trim());
    const hitCount = names.filter(n => catSet.has(n)).length;
    if (hitCount < names.length * 0.8) continue; // not actually the category list
    const same = names.length === CATEGORIES.length && names.every((n, i) => n === CATEGORIES[i]);
    if (!same) {
      errors.push(`${relPath}: category enumeration doesn't match CATEGORIES\n    doc: ${names.join(', ')}\n    code: ${CATEGORIES.join(', ')}`);
    }
  }
}

if (errors.length) {
  console.error(`Doc drift found (${errors.length}):\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`Docs match js/store/00-state.js — ${CATEGORIES.length} categories, CSV header "${CSV_HEADER.join(',')}".`);
