/* Household Finance — service worker: offline app shell.
   Precache only the canonical './' URL, not './index.html' — static-asset hosts
   often redirect the latter to the former, and caching (then replaying) a
   redirected Response for a navigation is what Chrome's install check flags as
   "Response served by service worker has redirections". */
const CACHE = 'household-finance-v6';
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

/* Tapping a bill reminder focuses the app on the Bill Calendar. */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) { c.navigate('./#/calendar'); return c.focus(); }
      return self.clients.openWindow('./#/calendar');
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
