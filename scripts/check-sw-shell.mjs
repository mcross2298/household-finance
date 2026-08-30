/* Service-worker precache gate (roadmap X-I1 / H-I1). sw.js's SHELL array is
   hand-maintained and drifts silently — it once precached a deleted
   `js/store.js` and a nonexistent `js/views/plan.js` while omitting every
   real js/store/*.js file, ui.js, features.js, tour.js and summary.js.
   Offline then "works" only by runtime-cache luck, or fails outright as a
   blank screen with no error (the install handler's fetch failures are
   swallowed). This must be a static check, not a runtime one — the bug is
   invisible until a user goes offline before the runtime cache has a chance
   to backfill it.

   Checks:
   - every same-origin <script src> / stylesheet / manifest / icon link in
     index.html is precached by sw.js's SHELL array.
   - every SHELL entry (besides the './' shell root) resolves to a real file
     on disk. */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];

const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
const swSrc = await readFile(resolve(ROOT, 'sw.js'), 'utf8');

const required = new Set();
for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) required.add(m[1]);
for (const m of html.matchAll(/<link[^>]+rel="(?:stylesheet|manifest|icon|apple-touch-icon)"[^>]+href="([^"]+)"/g)) {
  required.add(m[1]);
}
for (const m of html.matchAll(/<link[^>]+href="([^"]+)"[^>]+rel="(?:stylesheet|manifest|icon|apple-touch-icon)"/g)) {
  required.add(m[1]);
}

const shellMatch = swSrc.match(/const SHELL\s*=\s*\[([\s\S]*?)\];/);
if (!shellMatch) {
  console.error('Could not find "const SHELL = [...]" in sw.js');
  process.exit(1);
}
const shell = [...shellMatch[1].matchAll(/'([^']*)'/g)].map(x => x[1]);
const shellNormalized = new Set(shell.map(s => s.replace(/^\.\//, '')));

for (const req of required) {
  if (!shellNormalized.has(req)) {
    errors.push(`index.html references "${req}" but sw.js's SHELL does not precache it`);
  }
}

for (const entry of shell) {
  if (entry === './') continue;
  const rel = entry.replace(/^\.\//, '');
  if (!existsSync(resolve(ROOT, rel))) {
    errors.push(`sw.js's SHELL precaches "${entry}" but that file does not exist on disk`);
  }
}

if (errors.length) {
  console.error(`Service-worker shell drift found (${errors.length}):\n`);
  errors.forEach(e => console.error('  - ' + e));
  process.exit(1);
}
console.log(`sw.js SHELL matches index.html — ${shell.length} entries, all resolve.`);
