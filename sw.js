/* Household Finance — service worker: offline app shell.
   Precache only the canonical './' URL, not './index.html' — static-asset hosts
   often redirect the latter to the former, and caching (then replaying) a
   redirected Response for a navigation is what Chrome's install check flags as
   "Response served by service worker has redirections". */
const CACHE = 'household-finance-v7';
const SHELL = [
  './',
  './manifest.json',
  './css/styles.css',
  './js/store.js',
  './js/lock.js',
  './js/icons.js',
  './js/theme.js',
  './js/charts.js',
  './js/app.js',
  './js/views/dashboard.js',
  './js/views/transactions.js',
  './js/views/import.js',
  './js/views/budget.js',
  './js/views/calendar.js',
  './js/views/networth.js',
  './js/views/debt.js',
  './js/views/forecast.js',
  './js/views/goals.js',
  './js/views/house.js',
  './js/views/invest.js',
  './js/views/wedding.js',
  './js/views/plan.js',
  './js/views/backup.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => Promise.all(SHELL.map(url =>
      fetch(url).then(res => {
        // Skip anything that redirected — see the note above.
        if (res.ok && !res.redirected) return c.put(url, res);
      }).catch(() => { /* offline install — best effort, network fetch will retry later */ })
    ))).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

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
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit ||
      fetch(e.request).then(res => {
        if (res.ok && !res.redirected && (e.request.url.startsWith(self.location.origin) || e.request.url.includes('cdnjs.cloudflare.com'))) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() =>
        e.request.mode === 'navigate' ? caches.match('./') : Response.error()
      )
    )
  );
});
