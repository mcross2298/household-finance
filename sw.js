/* Household Finance — service worker: offline app shell.
   Precache only the canonical './' URL, not './index.html' — static-asset hosts
   often redirect the latter to the former, and caching (then replaying) a
   redirected Response for a navigation is what Chrome's install check flags as
   "Response served by service worker has redirections". */
const CACHE = 'household-finance-v12';
// Runtime hits (e.g. the PDF engine, fetched from cdnjs) live in their own
// cache, not versioned with CACHE above — so they survive a deploy instead
// of being wiped and re-downloaded on every version bump, and so iOS's
// whole-cache eviction under storage pressure can't take the app shell down
// alongside whatever scratch content happened to be sitting next to it.
const RUNTIME_CACHE = 'household-finance-runtime';
// The one file a share-target POST hands off to the client, in its own
// unversioned cache for the same reason RUNTIME_CACHE is — a deploy landing
// mid-share shouldn't drop the file the OS share sheet just handed us.
const SHARE_CACHE = 'household-finance-share-target';
const SHARE_KEY = './shared-import';
const SHELL = [
  './',
  './manifest.json',
  './css/styles.css',
  './js/store/00-state.js',
  './js/store/01-format.js',
  './js/store/02-members.js',
  './js/store/03-budget.js',
  './js/store/04-paycycles.js',
  './js/store/05-transactions.js',
  './js/store/06-calendar.js',
  './js/store/07-networth.js',
  './js/store/99-export.js',
  './js/lock.js',
  './js/icons.js',
  './js/theme.js',
  './js/motion.js',
  './js/charts.js',
  './js/ui.js',
  './js/features.js',
  './js/views/dashboard.js',
  './js/views/summary.js',
  './js/views/transactions.js',
  './js/views/import.js',
  './js/views/assistant.js',
  './js/views/budget.js',
  './js/views/calendar.js',
  './js/views/networth.js',
  './js/views/debt.js',
  './js/views/forecast.js',
  './js/views/goals.js',
  './js/views/house.js',
  './js/views/invest.js',
  './js/views/wedding.js',
  './js/views/backup.js',
  './js/tour.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

/* Everything except the home-screen icons must precache successfully for the
   install to complete — a fetch failure here used to be swallowed silently,
   so a phone with a flaky connection on first visit would "install" the
   offline app while missing pieces of its own shell, then serve the
   browser's own network-error page (not the app) the next time it actually
   went offline, with no way to tell from the outside that install had ever
   gone wrong. Icons are cosmetic; a slow or broken icon fetch shouldn't
   block getting the rest of the app installed. */
const REQUIRED_SHELL = SHELL.filter(url => !url.startsWith('./icons/'));
const OPTIONAL_SHELL = SHELL.filter(url => url.startsWith('./icons/'));

async function precache(c, url) {
  // cache: 'reload' bypasses the browser's ordinary HTTP cache — without it,
  // a host that doesn't send Cache-Control on every path can let a stale
  // byte-for-byte copy of an old deploy get read here and baked into this
  // brand-new named cache, so a version bump installs a half-updated shell
  // instead of the new one.
  const res = await fetch(url, { cache: 'reload' });
  // Skip anything that redirected — see the top-of-file note — without
  // treating it as a failure; there's nothing more to do for this URL.
  if (res.ok && !res.redirected) await c.put(url, res);
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      // Left unwrapped: a rejection here fails the whole install, so the
      // browser discards this worker instead of activating one with a
      // silently incomplete shell — the next registration attempt (next
      // load, or the browser's own update check) tries again from scratch.
      await Promise.all(REQUIRED_SHELL.map(url => precache(c, url)));
      await Promise.all(OPTIONAL_SHELL.map(url =>
        precache(c, url).catch(() => { /* icon fetch failed — cosmetic, not fatal */ })
      ));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== RUNTIME_CACHE && k !== SHARE_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* Web Share Target: the OS share sheet (bank app → Export statement → Share
   → Household Finance) POSTs the file here as multipart/form-data. Stash it
   in its own cache — Cache API stores Response objects and a File is already
   a Blob — then redirect to Import, which reads it back on mount and clears
   the entry either way, so a share never survives to double-import itself. */
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('statement');
    if (file && typeof file.size === 'number') {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put(SHARE_KEY, new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-Shared-Filename': encodeURIComponent(file.name || 'shared-statement')
        }
      }));
    }
  } catch (e) { /* malformed share — Import just opens empty, same as launching it directly */ }
  return Response.redirect('./#/import?shared=1', 303);
}

/* Tapping a bill reminder focuses the app on the Bill Calendar; an insight
   nudge instead carries its own data.href (e.g. Forecast, or a filtered
   Transactions search) since "worth a look" doesn't have one fixed home.
   Tapping the bill notification's "Mark paid" action (only offered when
   exactly one bill was due) routes to a drill-down URL calendar.js reads on
   mount and acts on — the same one-shot query-param pattern already used for
   month-end close links. */
self.addEventListener('notificationclick', e => {
  const action = e.action;
  const data = e.notification.data || {};
  e.notification.close();
  const url = action === 'paid' && data.billId
    ? './#/calendar?markpaid=' + encodeURIComponent(data.billId) + '&due=' + encodeURIComponent(data.due || '')
    : './' + (data.href || '#/calendar');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { c.navigate(url); return c.focus(); }
      return self.clients.openWindow(url);
    })
  );
});

/* Cache-first for the shell; runtime-cache successful GETs (e.g. the PDF engine)
   so a second import works offline too. */
self.addEventListener('fetch', e => {
  if (e.request.method === 'POST' && new URL(e.request.url).pathname.endsWith('/share-target')) {
    e.respondWith(handleShareTarget(e.request));
    return;
  }
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit ||
      fetch(e.request).then(res => {
        if (res.ok && !res.redirected && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('cdnjs.cloudflare.com'))) {
          const copy = res.clone();
          // Uncaught: a QuotaExceededError here was an unhandled rejection
          // inside the service worker, with nothing to surface it or retry.
          caches.open(RUNTIME_CACHE).then(c => c.put(e.request, copy)).catch(() => { /* full — this fetch already succeeded, only the cache write failed */ });
        }
        return res;
      }).catch(() =>
        e.request.mode === 'navigate'
          // .then(r => r || Response.error()): never hand `respondWith` an
          // undefined resolution — a navigation while offline before './'
          // ever made it into this cache would otherwise surface as the
          // browser's own connection-error page instead of a clean failure.
          ? caches.match('./').then(r => r || Response.error())
          : Response.error()
      )
    )
  );
});
