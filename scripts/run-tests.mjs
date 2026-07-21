/* Headless runner for tests.html — the automated gate the app never had.
   Serves the repo over a throwaway local HTTP server (localStorage needs a
   real origin, not file://), opens tests.html in headless Chromium, waits for
   the assertions to finish, and exits non-zero if any failed or the run
   crashed. No build step for the app itself — this is CI-only tooling.

   Run:  npm i -D playwright && npx playwright install --with-deps chromium
         node scripts/run-tests.mjs                                          */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, normalize } from 'node:path';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json'
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

const port = await new Promise(r => server.listen(0, () => r(server.address().port)));
const base = `http://127.0.0.1:${port}`;

let code = 1;
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e)));
  await page.goto(`${base}/tests.html`, { waitUntil: 'load' });
  // The suite is synchronous but wait for the summary to leave "running…".
  await page.waitForFunction(
    () => { const el = document.getElementById('summary'); return el && !/running/i.test(el.textContent); },
    { timeout: 30000 }
  );
  const summary = (await page.textContent('#summary'))?.trim() || '';
  const failed = await page.$$eval('#out li.fail', els => els.map(e => e.textContent.trim()));
  const passed = await page.$$eval('#out li.pass', els => els.length);

  console.log(`\n${summary}\n(${passed} passed, ${failed.length} failed)`);
  if (failed.length) { console.log('\nFailures:'); failed.forEach(f => console.log('  ' + f)); }
  if (consoleErrors.length) { console.log('\nPage errors:'); consoleErrors.forEach(e => console.log('  ' + e)); }

  code = (!failed.length && !consoleErrors.length && /passed/i.test(summary)) ? 0 : 1;
} catch (err) {
  console.error('Test runner error:', err.message);
  code = 1;
} finally {
  await browser.close();
  server.close();
}
process.exit(code);
