#!/usr/bin/env node
/* Accessibility gate — renders every route in both themes and fails on
   contrast or touch-target regressions.

   This exists because the whole Wave 1/3 class of defects was invisible to the
   existing checks: tests.html proves the money math, check-doc-drift proves the
   CSV contract, check-token-drift proves the tokens are themed — but none of
   them can see that --ink-3 was 3.06:1 on white, or that .btn.sm rendered a
   34px hit area on a phone-first PWA. Only a real render can.

   Contrast is measured with the alpha and gradient layers actually composited.
   A computed-style lookup reports false failures on translucent surfaces (white
   text on rgba(255,255,255,.07) over a navy gradient reads as 1:1 unless you
   flatten the stack first), which is why this walks the ancestor chain.

   Serves the repo itself, so there is nothing to start first.
   Run:  npm i --no-save playwright && npx playwright install --with-deps chromium
         node scripts/check-a11y.mjs
   Set CHROMIUM_PATH to point at an existing browser build when running locally. */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORT = +(process.env.PORT || 8099);
const ROOT = process.cwd();

/* Known-good exemptions, each with a reason. Anything not listed here that
   comes in under 44px fails the build.
   The 'tag' field matches el.tagName (SVG tagName is case-preserved, e.g.
   'path'/'rect'), not the className fallback — an SVG element's className
   is an SVGAnimatedString, whose .toString() is always the literal string
   "[object SVGAnimatedString]" rather than the class list, so a naive
   className-based match exempted every classed SVG shape (roadmap X-I4):
   charts.js's full-row/full-column hit-rects included, which are large by
   construction and should stay covered by the real check rather than ride
   an exemption meant only for whoDonut's data-sized <path> arc segments. */
const TARGET_EXEMPT = [
  { field: 'cls', match: /(^|\s)A$/, why: 'inline link inside a sentence — exempt under WCAG 2.5.8 (Inline)' },
  { field: 'cls', match: /INPUT/, why: 'checkbox whose .checkline label is itself a 44px target' },
  { field: 'tag', match: /^path$/, why: 'donut chart segment sized by the data it encodes; the 44px legend button (button.legend-item, min-height:44px) is the equivalent target and always co-renders when the arc is clickable' }
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  try {
    const rel = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[/\\])+/, '');
    const file = join(ROOT, rel === '/' ? 'index.html' : rel);
    const body = await readFile(file);   // read first — writing headers before this
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);                       // makes a miss unrecoverable
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

// 320 is the narrowest phone width still in real use (SE-class); 390 is the
// baseline. Both were verified clean before this second width was added
// (roadmap X-I2/H-I3) — this locks that state in, it isn't chasing a defect.
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 320, height: 690 }];

for (const vp of VIEWPORTS) {
for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: theme });
  const page = await ctx.newPage();
  page.on('pageerror', e => failures.push(`[js] ${vp.width}px ${theme}: ${e.message}`));

  for (const route of routes) {
    await page.goto(`http://localhost:${PORT}/index.html#/${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(150);
    const skip = await page.$('[data-act=skip]');
    if (skip) { await skip.click(); await page.waitForTimeout(100); }

    const found = await page.evaluate(() => {
      const px = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
        const q = m[1].split(',').map(parseFloat); return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; };
      const over = (f, bg) => [0, 1, 2].map(i => f[3] * f[i] + (1 - f[3]) * bg[i]);
      const flatten = el => {
        const layers = []; let n = el;
        while (n && n !== document.documentElement) {
          const cs = getComputedStyle(n);
          if (cs.backgroundImage && cs.backgroundImage !== 'none') {
            const g = cs.backgroundImage.match(/rgba?\([^)]+\)/); const c = g && px(g[0]); if (c) layers.push(c);
          }
          const c = px(cs.backgroundColor); if (c && c[3] > 0) layers.push(c);
          n = n.parentElement;
        }
        layers.push(px(getComputedStyle(document.documentElement).backgroundColor) || [255, 255, 255, 1]);
        layers.push([255, 255, 255, 1]);
        let base = layers[layers.length - 1].slice(0, 3);
        for (let i = layers.length - 2; i >= 0; i--) base = over(layers[i], base);
        return base;
      };
      const lum = c => { const s = c.map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
        return .2126 * s[0] + .7152 * s[1] + .0722 * s[2]; };

      const contrast = [], targets = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') return;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;

        const text = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim())
          .map(n => n.textContent.trim()).join(' ');
        // SVG paints via fill/stroke, not color — measuring `color` there is meaningless
        if (text && !(el instanceof SVGElement)) {
          const fg = px(cs.color);
          if (fg) {
            const bg = flatten(el);
            const f = fg[3] < 1 ? over(fg, bg) : fg.slice(0, 3);
            const L1 = lum(f), L2 = lum(bg);
            const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
            const size = parseFloat(cs.fontSize);
            const need = (size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700)) ? 3 : 4.5;
            if (ratio < need) contrast.push({
              ratio: +ratio.toFixed(2), need, size: Math.round(size),
              cls: (el.className.toString() || el.tagName).slice(0, 40), text: text.slice(0, 40)
            });
          }
        }
        if (el.matches('button,a[href],input,select,[role=button]') && (r.height < 44 || r.width < 44)) {
          targets.push({ cls: (el.className.toString() || el.tagName).slice(0, 40), tag: el.tagName,
            h: Math.round(r.height), w: Math.round(r.width),
            label: (el.textContent || el.getAttribute('aria-label') || el.id || '').trim().slice(0, 30) });
        }
      });
      return { contrast, targets };
    });

    for (const c of found.contrast) {
      failures.push(`[contrast] ${vp.width}px ${theme} #/${route} .${c.cls} — ${c.ratio}:1, needs ${c.need} (${c.size}px "${c.text}")`);
    }
    for (const t of found.targets) {
      if (TARGET_EXEMPT.some(e => e.match.test(e.field === 'tag' ? t.tag : t.cls))) continue;
      failures.push(`[target] ${vp.width}px ${theme} #/${route} .${t.cls} — ${t.h}x${t.w}px, needs 44 ("${t.label}")`);
    }
  }
  await ctx.close();
}
}

await browser.close();
server.close();

const unique = [...new Set(failures)];
if (unique.length) {
  console.error(`\ncheck-a11y: ${unique.length} problem(s) across ${routes.length} routes x ${VIEWPORTS.length} viewports x 2 themes\n`);
  for (const f of unique.slice(0, 40)) console.error('  • ' + f);
  if (unique.length > 40) console.error(`  … and ${unique.length - 40} more`);
  console.error('');
  process.exit(1);
}
console.log(`check-a11y: ${routes.length} routes x ${VIEWPORTS.length} viewports x 2 themes — contrast and touch targets clean, no JS errors.`);
