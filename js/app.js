/* Household Finance — app shell: router, nav state, modals, toasts, downloads. */
(function () {
  'use strict';

  const TITLES = {
    home: 'Dashboard', summary: 'Executive Summary', transactions: 'Transactions', import: 'Import',
    assistant: 'Ask',
    budget: 'Budget', calendar: 'Bill Calendar', goals: 'Savings Goals',
    house: 'House Plan', invest: 'Investments', wedding: 'Wedding Payoff',
    networth: 'Net Worth', debt: 'Debt Payoff Plan', forecast: 'Forecast', backup: 'Export & Backup'
  };

  function route() {
    const hash = location.hash.replace(/^#\//, '').split('?')[0] || 'home';
    return TITLES[hash] ? hash : 'home';
  }

  /* Query params on the hash (e.g. #/transactions?month=2026-07&category=Groceries),
     used for one-shot drill-down links from the Dashboard. A view should read these
     once on mount and then call App.clearRouteParams() so a later back/resize
     re-render doesn't stomp on filters the user has since changed by hand. */
  function routeParams() {
    const q = location.hash.split('?')[1];
    return q ? Object.fromEntries(new URLSearchParams(q)) : {};
  }
  function clearRouteParams() {
    history.replaceState(null, '', location.pathname + location.search + '#/' + route());
  }
  function go(routeName, params) {
    const qs = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    location.hash = '/' + routeName + qs;
  }

  /* render() replaces the whole view, so anything the browser was holding onto
     — scroll position, the focused field, the caret inside it — is destroyed
     unless we put it back. Views call render() for in-place edits far more
     often than for navigation (a filter, a month step, one cell of an import
     review), so "reset" is the wrong default: scroll resets only when the
     route actually changed, and an explicit opts.resetScroll still wins. */
  let lastRoute = null;

  function render(opts) {
    const r = route();
    const resetScroll = opts && opts.resetScroll != null ? opts.resetScroll : r !== lastRoute;
    lastRoute = r;
    const view = document.getElementById('view');
    document.getElementById('topbar-title').textContent = TITLES[r];
    document.title = TITLES[r] + " — Household Finance";
    document.querySelectorAll('[data-route]').forEach(a => {
      const active = a.dataset.route === r ||
        (a.dataset.route === 'plan' && ['summary', 'budget', 'calendar', 'goals', 'house', 'invest', 'wedding', 'networth', 'debt', 'forecast'].includes(r));
      a.classList.toggle('active', active);
    });
    if (resetScroll) { view.scrollTop = 0; window.scrollTo(0, 0); }
    // Replacing innerHTML empties the document for an instant, and the browser
    // clamps scroll to 0 before the new content is measured. Not resetting
    // isn't enough — the position has to be captured and put back.
    const keepY = resetScroll ? 0 : window.scrollY;

    const active = document.activeElement;
    const keepId = active && active.id && view.contains(active) ? active.id : null;
    // Only text-ish inputs expose a caret; number/date/checkbox throw on read.
    let caret = null;
    if (keepId) { try { caret = [active.selectionStart, active.selectionEnd]; } catch (e) { caret = null; } }

    if (window.Motion && resetScroll) Motion.arm();
    Views[r](view);
    if (window.Motion) requestAnimationFrame(() => Motion.runEntrance(view));

    if (!resetScroll && keepY) {
      // The first attempt runs before the browser has re-laid-out the new
      // content, so it clamps against the emptied document; the rAF pass lands
      // after layout and before paint, so the correction is never visible.
      const restoreY = () => { if (window.scrollY !== keepY) window.scrollTo(0, keepY); };
      restoreY();
      requestAnimationFrame(restoreY);
    }

    if (keepId) {
      const restored = document.getElementById(keepId);
      if (restored) {
        restored.focus({ preventScroll: true });
        if (caret) { try { restored.setSelectionRange(caret[0], caret[1]); } catch (e) { /* type has no caret */ } }
      }
    }
    const expBtn = document.getElementById('export-banner-btn');
    if (expBtn) expBtn.addEventListener('click', () => { exportTransactionsCSV(); render(); });
    const fab = document.getElementById('fab-add');
    if (fab) fab.classList.toggle('hidden', ['transactions', 'import', 'backup'].includes(r));
    const foot = document.getElementById('side-foot');
    if (foot) {
      const d = new Date(Store.data.lastUpdated);
      foot.textContent = 'Updated ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }

  /* ---------- shared UI helpers ---------- */
  function toast(msg, kind) {
    const root = document.getElementById('toast-root');
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' ' + kind : '');
    t.textContent = msg;
    root.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  function modal(title, bodyHTML, opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
          <div class="modal-head">
            <h3>${title}</h3>
            <button class="icon-btn modal-x" aria-label="Close">${(window.UI && UI.icon('close')) || ''}</button>
          </div>
          <div class="modal-body">${bodyHTML}</div>
        </div>
      </div>`;
    const close = () => { root.innerHTML = ''; if (opts.onClose) opts.onClose(); };
    root.querySelector('.modal-x').addEventListener('click', close);
    root.querySelector('.modal-backdrop').addEventListener('click', e => {
      if (e.target.classList.contains('modal-backdrop')) close();
    });
    return { el: root.querySelector('.modal'), close };
  }

  function confirmDialog(title, text, confirmLabel, onConfirm) {
    const m = modal(title, `
      <p>${text}</p>
      <div class="btn-row">
        <button class="btn danger" data-act="yes">${confirmLabel}</button>
        <button class="btn ghost" data-act="no">Cancel</button>
      </div>`);
    m.el.querySelector('[data-act=yes]').addEventListener('click', () => { m.close(); onConfirm(); });
    m.el.querySelector('[data-act=no]').addEventListener('click', m.close);
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* Shared by the Backup screen's export button and the "export is behind" banner
     nudge shown on other screens after edits/imports. */
  function exportTransactionsCSV() {
    download('household-finance-transactions-' + new Date().toISOString().slice(0, 10) + '.csv',
      Store.exportCSV(), 'text/csv');
    Store.markExported();
    toast('CSV exported');
  }

  function exportBanner() {
    const storageBanner = storageFull
      ? `<div class="callout warn storage-banner">
          <span>Not saving to this device. Export a backup now.</span>
        </div>`
      : '';
    if (!Store.needsExport()) return storageBanner;
    return storageBanner + `<div class="callout warn export-banner">
      <span>You've made changes since your last CSV export.</span>
      <button class="btn ghost sm" id="export-banner-btn">Export CSV</button>
    </div>`;
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- global search + command palette ---------- */
  /* One box that finds transactions, budget lines, goals, and wedding vendors
     from any screen — "when did we last pay the vet?" without setting filters
     — and, pinned above those results, runs quick actions (add a transaction,
     jump to a screen) so the same box that finds things can also do things. */
  const PALETTE_RECENTS_KEY = 'cf.paletteRecents';
  const PALETTE_RECENTS_MAX = 6;
  function paletteRecents() {
    try { return JSON.parse(localStorage.getItem(PALETTE_RECENTS_KEY) || '[]'); } catch (e) { return []; }
  }
  function paletteRemember(id) {
    const recents = [id].concat(paletteRecents().filter(x => x !== id)).slice(0, PALETTE_RECENTS_MAX);
    // A device-local UI convenience, not household data — kept out of Store
    // the same way js/lock.js keeps its own config out of Store.
    try { localStorage.setItem(PALETTE_RECENTS_KEY, JSON.stringify(recents)); } catch (e) { /* private mode */ }
  }
  function paletteActions() {
    const jumps = Object.keys(TITLES)
      .filter(r => r !== route())
      .map(r => ({ id: 'go-' + r, label: 'Jump to ' + TITLES[r], meta: 'Go to screen', run: () => go(r) }));
    return [
      { id: 'add-tx', label: 'Add transaction', meta: 'Quick action',
        run: () => { if (window.Views && Views.transactions && Views.transactions.openAdd) Views.transactions.openAdd(); } },
      { id: 'add-budget-line', label: 'Add budget line', meta: 'Quick action',
        run: () => { if (window.Views && Views.budget && Views.budget.openAdd) Views.budget.openAdd(); } }
    ].concat(jumps);
  }
  function openSearch() {
    // The keydown listener that triggers this is bound at script load, before
    // Lock.guard(boot) ever runs, so a stray "/"/⌘K or a click on the search
    // button while the PIN gate is up would otherwise open this modal behind
    // it (z-index only, no visible leak) and steal focus off the PIN field —
    // mirroring the same check the hashchange handler already makes below.
    if (window.Lock && Lock.isLocked()) return;
    const m = modal('Search', `
      <input class="input" id="gs-q" type="search" placeholder="Search, or run a command…"
        autocomplete="off" aria-label="Search everything, or run a command">
      <div class="gs-results" id="gs-results"></div>`);
    const input = m.el.querySelector('#gs-q');
    const box = m.el.querySelector('#gs-results');
    const hit = (title, meta, amount, go) =>
      ({ title, meta, amount, go });
    const actions = paletteActions();
    const byId = Object.fromEntries(actions.map(a => [a.id, a]));
    let selIndex = 0;
    let hits = [];
    const applySelection = () => {
      hits.forEach((el, i) => el.classList.toggle('selected', i === selIndex));
      if (hits[selIndex]) hits[selIndex].scrollIntoView({ block: 'nearest' });
    };
    const runAction = a => { paletteRemember(a.id); m.close(); a.run(); };
    const run = q => {
      q = q.trim().toLowerCase();
      const groups = [];
      const matchedActions = q
        ? actions.filter(a => a.label.toLowerCase().includes(q))
        : (paletteRecents().map(id => byId[id]).filter(Boolean).length
            ? paletteRecents().map(id => byId[id]).filter(Boolean)
            : actions.slice(0, 4));
      if (matchedActions.length) groups.push(['Actions', matchedActions.slice(0, 8).map(a =>
        hit(a.label, a.meta, '', () => runAction(a)))]);
      if (q.length >= 2) {
        const has = s => String(s || '').toLowerCase().includes(q);
        const txs = Store.data.transactions
          .filter(t => has(t.description) || has(t.account) || has(t.notes) || has(t.category))
          .sort((a, b) => a.date < b.date ? 1 : -1);
        if (txs.length) {
          groups.push(['Transactions', txs.slice(0, 8).map(t =>
            hit(t.description || '(no description)', Store.fmtDate(t.date) + ' · ' + t.category + ' · ' + t.who,
              Store.fmt$(t.amount, 2), () => go('transactions', { q: input.value.trim() })))]);
          if (txs.length > 8) groups[groups.length - 1][1].push(
            hit('See all ' + txs.length + ' matches →', '', '', () => go('transactions', { q: input.value.trim() })));
        }
        const lines = Store.data.budget.filter(b => has(b.name) || has(b.category) || has(b.notes));
        if (lines.length) groups.push(['Budget lines', lines.slice(0, 5).map(b =>
          hit(b.name, b.section + ' · ' + b.category, Store.fmt$(b.monthly, 0) + '/mo', () => go('budget', { section: b.section })))]);
        const goals = Store.data.goals.filter(g => has(g.name));
        if (goals.length) groups.push(['Goals', goals.slice(0, 5).map(g =>
          hit(g.name, Store.fmt$(g.saved, 0) + ' of ' + Store.fmt$(g.target, 0), '', () => { location.hash = '#/goals'; }))]);
        const vendors = Store.data.wedding.vendors.filter(v => has(v.vendor));
        if (vendors.length) groups.push(['Wedding vendors', vendors.slice(0, 5).map(v =>
          hit(v.vendor, (v.paid ? 'paid' : 'due ' + Store.fmtDate(v.due)), Store.fmt$(v.amount, 0), () => { location.hash = '#/wedding'; }))]);
      }
      if (!groups.length) {
        box.innerHTML = q.length < 2
          ? '<p class="help">Keep typing to search transactions, budget lines, goals, and vendors.</p>'
          : '<p class="help">No matches for “' + esc(q) + '”.</p>';
        hits = [];
        return;
      }
      box.innerHTML = groups.map(([label, groupHits]) => `
        <div class="gs-group-label">${label}</div>
        ${groupHits.map((h, i) => `<button class="gs-hit" data-g="${esc(label)}" data-i="${i}">
          <span class="gs-hit-main"><span class="gs-hit-title">${esc(h.title)}</span>
          ${h.meta ? `<span class="gs-hit-meta">${esc(h.meta)}</span>` : ''}</span>
          ${h.amount ? `<span class="gs-hit-amt">${esc(h.amount)}</span>` : ''}
        </button>`).join('')}`).join('');
      const byGroup = Object.fromEntries(groups.map(([label, groupHits]) => [label, groupHits]));
      hits = Array.prototype.slice.call(box.querySelectorAll('.gs-hit'));
      hits.forEach(btn =>
        btn.addEventListener('click', () => { m.close(); byGroup[btn.dataset.g][+btn.dataset.i].go(); }));
      selIndex = 0;
      applySelection();
    };
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(input.value), 200); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (hits.length) { selIndex = Math.min(selIndex + 1, hits.length - 1); applySelection(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (hits.length) { selIndex = Math.max(selIndex - 1, 0); applySelection(); } }
      else if (e.key === 'Enter') { if (hits[selIndex]) hits[selIndex].click(); }
    });
    input.focus();
    run('');
  }

  const options = (list, sel) =>
    list.map(v => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

  /* ---------- bill & insight reminders ---------- */
  /* Shared by both reminder types below: a notification where the platform
     allows it, via the service worker when one's controlling the page so
     actions/data work, falling back to the plain Notification API otherwise.
     `done` only runs once the notification actually shows, so a later
     permission grant still fires it instead of it being silently skipped. */
  function notifyLocal(title, opts, done) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // The plain Notification API doesn't support actions/data at all — a
    // plain heads-up is the honest maximum whenever no service worker can
    // show this instead.
    const plainFallback = () => {
      try { new Notification(title, { body: opts.body }); done(); } catch (e) { /* leave unlogged; retry next open */ }
    };
    if (!navigator.serviceWorker) return plainFallback();
    // getRegistration() resolves either way (with or without a registration)
    // instead of hanging, unlike checking .controller synchronously — which
    // used to miss the exact race on the very first boot: this can fire
    // before register()'s own promise has resolved, so .controller was still
    // null even though a registration already existed (installing) by the
    // time boot() calls this. .ready then waits for that same registration
    // to finish activating before showing the notification.
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return plainFallback();
      return navigator.serviceWorker.ready
        .then(r => r.showNotification(title, opts))
        .then(done);
    }).catch(plainFallback);
  }

  /* Fires when the app opens or returns to the foreground — a local-only PWA
     has no server to push from, so this is the honest maximum: a notification
     where the platform allows it, and the Dashboard insights either way. */
  /* Store.dueForReminder() is already recomputed here on every visibility
     change; the count was used for one toast and then discarded. Badging
     the icon with it turns the app from something you remember to open into
     something that tells you it needs opening. cf:change re-syncs the badge
     the moment a bill gets marked paid, without waiting for the next
     foreground. No server/push infra — setAppBadge/clearAppBadge are local
     calls the installed PWA makes about itself. */
  function updateBadge(due) {
    if (!navigator.setAppBadge || !navigator.clearAppBadge) return;
    const count = due ? due.length : Store.dueForReminder().length;
    (count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge()).catch(() => {});
  }
  document.addEventListener('cf:change', () => updateBadge());

  function checkReminders() {
    const due = Store.dueForReminder();
    updateBadge(due);
    if (!due.length) return;
    const title = due.length === 1 ? 'Bill due: ' + due[0].name : due.length + ' bills due soon';
    const body = due.map(d =>
      d.name + ' — ' + Store.fmt$(d.amount, 0) + ' due ' + Store.fmtDate(d.due)).join('\n');
    const opts = { body, icon: 'icons/icon-192.png', tag: 'cf-bills' };
    // A single due bill is unambiguous enough to offer a one-tap "Mark paid"
    // action right on the notification; with more than one due, which bill it
    // meant would be a guess, so only the default "open the calendar" applies.
    if (due.length === 1) {
      opts.data = { billId: due[0].id, due: due[0].due };
      opts.actions = [{ action: 'paid', title: 'Mark paid' }];
    }
    // No permission → the insight feed carries it; don't mark as reminded so a
    // later grant still notifies.
    notifyLocal(title, opts, () => Store.markReminded(due));
  }

  /* Opt-in separately from bill reminders — a price jump or a tight forecast
     month is worth surfacing, but it's a softer, more discretionary heads-up
     than a bill coming due, so it gets its own toggle rather than riding
     along with "remind me before bills are due". */
  function checkInsightNudges() {
    const items = Store.dueInsightNudges();
    if (!items.length) return;
    const title = items.length === 1 ? 'Worth a look' : items.length + ' things worth a look';
    const body = items.map(i => i.text).join('\n');
    const opts = { body, icon: 'icons/icon-192.png', tag: 'cf-insights', data: { href: items[0].href } };
    notifyLocal(title, opts, () => Store.markInsightsNudged(items));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { checkReminders(); checkInsightNudges(); }
  });

  /* Storage quota exceeded: the app keeps working from memory, but the user
     must know their changes aren't persisting — a toast alone disappears
     after 2.6s while the condition itself can last the rest of the session,
     so this also latches a persistent banner (rendered by exportBanner()
     above) until a save goes through cleanly.

     00-state.js's save() dispatches cf:save-error and then unconditionally
     dispatches cf:change right after, whether or not the save itself threw —
     so a naive "clear the latch on cf:change" listener would immediately
     undo the very save-error that just set it. saveErroredThisTick marks
     that the next cf:change belongs to a failed save, so only a cf:change
     that arrives *without* a preceding save-error in the same tick means
     storage actually recovered. */
  let storageFull = false;
  let saveErroredThisTick = false;
  document.addEventListener('cf:save-error', () => {
    saveErroredThisTick = true;
    toast('Storage is full — changes may not persist. Export a backup now.', 'warn');
    if (!storageFull) { storageFull = true; render(); }
  });
  document.addEventListener('cf:change', () => {
    if (saveErroredThisTick) { saveErroredThisTick = false; return; }
    if (storageFull) { storageFull = false; render(); }
  });

  /* ---------- install prompt (re-offered, not one-shot) ---------- */
  /* Chrome/Edge fire beforeinstallprompt again on later visits as long as the
     app isn't installed — capturing it every time (instead of only once) is
     what makes re-offering possible at all. Dismissing just snoozes the
     banner; it comes back after INSTALL_SNOOZE_DAYS instead of never again. */
  let deferredInstallPrompt = null;
  const INSTALL_DISMISS_KEY = 'householdFinance.installDismissedAt';
  const INSTALL_SNOOZE_DAYS = 14;
  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  function showInstallBanner() {
    const root = document.getElementById('install-banner-root');
    if (!root || !deferredInstallPrompt || isStandalone()) return;
    let dismissedAt = 0;
    try { dismissedAt = +localStorage.getItem(INSTALL_DISMISS_KEY) || 0; } catch (e) { /* private mode */ }
    if (dismissedAt && (Date.now() - dismissedAt) / 86400000 < INSTALL_SNOOZE_DAYS) return;
    root.innerHTML = `
      <div class="install-banner-inner">
        <div class="callout install-banner">
          <span>Install Household Finance for one-tap access and offline use.</span>
          <div class="btn-row" style="margin:0">
            <button class="btn gold sm" id="install-go">Install</button>
            <button class="btn ghost sm" id="install-dismiss">Not now</button>
          </div>
        </div>
      </div>`;
    root.querySelector('#install-go').addEventListener('click', async () => {
      root.innerHTML = '';
      if (!deferredInstallPrompt) return;
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      prompt.prompt();
      await prompt.userChoice;
    });
    root.querySelector('#install-dismiss').addEventListener('click', () => {
      try { localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now())); } catch (e) { /* private mode */ }
      root.innerHTML = '';
    });
  }
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallBanner();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const root = document.getElementById('install-banner-root');
    if (root) root.innerHTML = '';
    toast('Installed — find it on your home screen');
  });

  window.App = {
    render, toast, modal, confirmDialog, download, esc, options, routeParams, clearRouteParams, go,
    exportTransactionsCSV, exportBanner, openSearch, checkReminders, checkInsightNudges
  };

  ['search-btn-mobile', 'search-btn-desktop'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', openSearch);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    e.preventDefault();
    openSearch();
  });
  // ⌘K/Ctrl+K opens the same box — unlike "/", it works from inside a text
  // field too (a form's own inputs don't treat it as a printable character),
  // which is the point: it should work while you're mid-edit somewhere else.
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    e.preventDefault();
    openSearch();
  });
  // ⌘J/Ctrl+J jumps straight to the Ask screen from anywhere, same reach as
  // ⌘K for search — the assistant is meant to be a keystroke away, not a
  // menu dig.
  document.addEventListener('keydown', e => {
    if (e.key.toLowerCase() !== 'j' || !(e.metaKey || e.ctrlKey) || e.altKey) return;
    e.preventDefault();
    location.hash = '#/assistant';
  });

  // Static nav icons only need to be stamped in once — the sidebar/bottom-nav
  // shell isn't re-rendered by the router.
  document.querySelectorAll('[data-icon]').forEach(span => {
    if (window.Icons && Icons[span.dataset.icon]) span.innerHTML = Icons[span.dataset.icon];
  });
  const paletteHint = document.getElementById('palette-hint');
  if (paletteHint && !/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)) {
    paletteHint.textContent = 'Ctrl K';
  }

  const fabBtn = document.getElementById('fab-add');
  if (fabBtn) fabBtn.addEventListener('click', () => {
    if (window.Views && Views.transactions && Views.transactions.openAdd) Views.transactions.openAdd();
  });

  window.addEventListener('hashchange', () => { if (!(window.Lock && Lock.isLocked())) render(); });
  // Mobile Safari fires `resize` constantly while scrolling (the address bar
  // collapsing/expanding changes viewport height), so a full re-render tied
  // to every resize event made scrolling feel like the page kept restarting.
  // Only re-render for an actual width change (the thing our breakpoints care
  // about), and never yank scroll position when that happens.
  window.addEventListener('resize', (() => {
    let lastWidth = window.innerWidth;
    let t;
    return () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (window.innerWidth !== lastWidth) {
          lastWidth = window.innerWidth;
          render();
        }
      }, 200);
    };
  })());
  function boot() {
    const autoPosted = Store.autoPostDueBills();
    render();
    // Registered before checkReminders()/checkInsightNudges() below, not
    // after — those can fire a notification synchronously on this very call,
    // and notifyLocal() needs a registration to already exist (even mid
    // install) for its getRegistration() check to find one instead of
    // falling back to a plain notification with no action buttons.
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      // updateViaCache: 'none' forces a real network fetch of sw.js on every check —
      // without it, a host that doesn't send Cache-Control on sw.js can let the
      // browser's ordinary HTTP cache mask a new deploy indefinitely, since the
      // update algorithm's byte-comparison fetch would just hit that stale cache.
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        .catch(() => { /* offline install is best-effort */ });
    }
    checkReminders();
    checkInsightNudges();
    if (window.Tour) Tour.maybeAutoStart();
    if (autoPosted) toast(autoPosted + ' cash-pay bill' + (autoPosted === 1 ? '' : 's') + ' auto-posted for this month');
  }
  if (window.Lock) Lock.guard(boot); else boot();
})();
