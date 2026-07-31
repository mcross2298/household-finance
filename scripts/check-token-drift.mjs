#!/usr/bin/env node
/* Design-token gate — the same idea as check-doc-drift.mjs, pointed at the
   stylesheet instead of the docs.

   Two rules, both of which were broken before this existed:

   1. Any token used to paint something on a surface that flips with the theme
      must be redefined in BOTH dark blocks. --navy-soft wasn't, so every link
      in the app sat at 1.8:1 in dark mode; --gold-ink wasn't, so did the
      payday chip and the report kicker.

   2. No raw hex outside the token blocks. The exceptions are the navy chrome
      (sidebar, topbar, bottom nav, toasts, tooltips, the lock gate) which
      deliberately never flips, plus print, which is always on white paper.
      Those get named --on-navy-* / --on-gold tokens instead, so a raw hex
      anywhere else is a real finding rather than noise.

   Exits non-zero with the offending lines. Run: node scripts/check-token-drift.mjs */

import { readFileSync } from 'node:fs';

const CSS = 'css/styles.css';
const src = readFileSync(CSS, 'utf8');
const lines = src.split('\n');

/* Tokens allowed to exist only in :root: they're either theme-independent by
   design or they're the light half of a pair whose dark half is a *different*
   token (--link / --brand-ink carry the flipping half). */
const THEME_INDEPENDENT = new Set([
  '--gold', '--gold-hover', '--navy', '--navy-soft', '--radius', '--sat', '--sab',
  '--on-navy', '--on-navy-2', '--on-navy-nav', '--on-navy-dim',
  '--on-navy-line', '--on-navy-fill', '--on-navy-fill-hi',
  '--on-navy-bad', '--on-navy-bad-edge', '--on-gold', '--on-solid'
]);

/* Selectors whose surface is the fixed navy chrome or printed paper. */
const FIXED_SURFACE = /^\s*(@media print|\.topbar|\.bottom-nav|\.sidebar|\.side-|\.brand|\.nav-|\.theme-toggle|\.toast|\.chart-tip|\.tip-|\.lock-gate|\.card-navy|\.hero|\.kpi|\.stat|\.sts|\.due-soon|\.ring-on-navy|\.modal-backdrop)/;

const blockOf = source => {
  const out = new Map();
  const re = /:root[^{]*\{([\s\S]*?)\n\}/g;
  let m, i = 0;
  while ((m = re.exec(source))) {
    const decls = new Set();
    for (const d of m[1].matchAll(/(--[\w-]+)\s*:/g)) decls.add(d[1]);
    out.set(i++, decls);
  }
  return out;
};

const errors = [];

// --- rule 1: every token defined in :root and not theme-independent must
//     appear in both dark blocks ---
const blocks = blockOf(src);
if (blocks.size !== 3) {
  errors.push(`expected 3 :root blocks (light, media-dark, attr-dark), found ${blocks.size}`);
} else {
  const [light, mediaDark, attrDark] = [blocks.get(0), blocks.get(1), blocks.get(2)];
  for (const t of light) {
    if (THEME_INDEPENDENT.has(t)) continue;
    if (!mediaDark.has(t)) errors.push(`${t} is defined for light but missing from the @media dark block`);
    if (!attrDark.has(t)) errors.push(`${t} is defined for light but missing from the [data-theme="dark"] block`);
  }
  for (const t of mediaDark) {
    if (!attrDark.has(t)) errors.push(`${t} is in the @media dark block but not the [data-theme="dark"] block`);
  }
  for (const t of attrDark) {
    if (!mediaDark.has(t)) errors.push(`${t} is in the [data-theme="dark"] block but not the @media dark block`);
  }
}

// --- rule 2: no raw hex outside the token blocks, except on fixed surfaces ---
const tokenBlockEnd = src.indexOf('* { box-sizing');
const startLine = src.slice(0, tokenBlockEnd).split('\n').length;
let selector = '';
let depth = 0;
let printDepth = -1;   // brace depth at which @media print opened, -1 = not inside one
for (let i = startLine; i < lines.length; i++) {
  const line = lines[i];
  if (/@media\s+print/.test(line)) printDepth = depth;
  if (/^\s*[.@:#a-zA-Z]/.test(line) && line.includes('{')) selector = line;
  depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
  if (printDepth >= 0 && depth <= printDepth) printDepth = -1;
  const hex = line.match(/#[0-9A-Fa-f]{3,8}\b/g);
  if (!hex) continue;
  // print is always ink on white paper, never a themed surface
  if (printDepth >= 0) continue;
  if (FIXED_SURFACE.test(selector) || FIXED_SURFACE.test(line)) continue;
  errors.push(`${CSS}:${i + 1} raw hex ${hex.join(', ')} on a theme-flipping surface — use a token\n      ${line.trim()}`);
}

if (errors.length) {
  console.error(`\ncheck-token-drift: ${errors.length} problem(s)\n`);
  for (const e of errors) console.error('  • ' + e);
  console.error('\nSee the comment at the top of scripts/check-token-drift.mjs for why these two rules exist.\n');
  process.exit(1);
}
console.log('check-token-drift: tokens are themed and no raw hex escaped the token blocks.');
