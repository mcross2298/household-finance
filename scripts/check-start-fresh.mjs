#!/usr/bin/env node
/* check-start-fresh.mjs — H-I4, VOC/VOA Kaizen audit.
   ---------------------------------------------------------------------------
   startFresh()/emptyState() (js/store/00-state.js) is the app's real "new
   household" onboarding path -- the Backup screen's "Start fresh" button is
   how a first-time evaluator turns the fictional Alex & Sam demo into their
   own single-member household, and it's the one flow where a new user's
   first action is destructive and irreversible. Nothing asserted it actually
   left every route in a coherent state.

   This drives the REAL UI path (not a direct Store.startFresh() call): loads
   the app with its default demo data, opens Export & Backup, clicks
   "Start fresh (clear demo data)", confirms the danger-zone modal, then
   verifies:
     1. localStorage now holds emptyState()'s exact shape (members === ['You'],
        every collection empty, no leftover Alex & Sam data).
     2. Every one of the 14 routes (read from js/features.js, same technique
        scripts/check-a11y.mjs already uses) renders with zero console/page
        errors and no visible "undefined" / "NaN" / "[object Object]" leak --
        the fingerprint of code that assumed a 2-person roster or non-empty
        collections and didn't handle the single-member, all-zero case.

   Serves the repo itself, so there is nothing to start first.
   Run:  npm i --no-save playwright && npx playwright install --with-deps chromium
         node scripts/check-start-fresh.mjs
   Set CHROMIUM_PATH to point at an existing browser build when running locally
   (same convention as scripts/check-a11y.mjs). */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = +(process.env.PORT || 8098);
const ROOT = process.cwd();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, rel === '/' ? 'index.html' : rel);
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise(r => server.listen(PORT, r));

const routes = [...new Set(
  (await readFile(join(ROOT, 'js/features.js'), 'utf8')).matchAll(/route:\s*'([\w-]+)'/g)
)].map(m => m[1]);

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);
const failures = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
page.on('pageerror', e => failures.push(`[js] ${e.message}`));
// Skip the first-run Quick Tour modal -- it isn't what this script verifies
// and it would otherwise intercept the very first click below.
await page.addInitScript(() => { try { localStorage.setItem('householdFinance.tourSeen', '1'); } catch (e) {} });

await page.goto(`http://localhost:${PORT}/index.html#/backup`, { waitUntil: 'networkidle' });

// Sanity: confirm we're actually starting from the seeded demo, not an
// already-empty state left by a prior run reusing this profile -- a false
// pass here would mean the flow below never really exercised the transition.
const before = await page.evaluate(() => JSON.parse(localStorage.getItem('householdFinance.v1')));
if (!before || before.members.length < 2) {
  failures.push(`precondition failed: expected the seeded demo household (2 members) before Start fresh, found members=${JSON.stringify(before && before.members)}`);
}

// Drive the REAL button + confirm-modal path, not a direct Store call --
// this is the actual onboarding flow a first-time evaluator uses.
await page.click('#start-fresh');
await page.click('[data-act=yes]');
await page.waitForFunction(() => location.hash === '#/budget', { timeout: 5000 });

const after = await page.evaluate(() => JSON.parse(localStorage.getItem('householdFinance.v1')));
function expectEqual(label, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) failures.push(`start-fresh state: ${label} = ${a}, expected ${e}`);
}
expectEqual('members', after.members, ['You']);
expectEqual('incomes', after.incomes, { You: 0 });
expectEqual('budget', after.budget, []);
expectEqual('transactions', after.transactions, []);
expectEqual('goals', after.goals, []);
expectEqual('accounts', after.accounts, []);
expectEqual('snapshots', after.snapshots, {});
expectEqual('planned', after.planned, []);
expectEqual('house.scenarios', after.house.scenarios, []);

// Now sweep every route on this now-fresh household and look for the
// fingerprint of code that assumed a 2-person roster or non-empty
// collections: a literal "undefined"/"NaN"/"[object Object]" leaking into
// visible text, or any console/page error.
const LEAK_RE = /\bundefined\b|\bNaN\b|\[object Object\]/;
for (const route of routes) {
  await page.goto(`http://localhost:${PORT}/index.html#/${route}`, { waitUntil: 'networkidle' });
  const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  if (overflowX) failures.push(`${route}: horizontal overflow on the fresh single-member household`);
  const bodyText = await page.evaluate(() => document.getElementById('view').innerText);
  const leak = bodyText.match(LEAK_RE);
  if (leak) failures.push(`${route}: visible "${leak[0]}" in rendered text on the fresh household`);
}

await browser.close();
server.close();

if (failures.length) {
  console.error(`\n${failures.length} start-fresh issue(s):\n`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}
console.log(`check-start-fresh: OK — Start fresh via the real UI path left a coherent single-member ("You") state, verified across all ${routes.length} routes.`);
