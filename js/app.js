/* Household Finance — app shell: router, nav state, modals, toasts, downloads. */
(function () {
  'use strict';

  const TITLES = {
    home: 'Dashboard', transactions: 'Transactions', import: 'Import',
    plan: 'Plan', budget: 'Budget', calendar: 'Bill Calendar', goals: 'Savings Goals',
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

  function render(opts) {
    const resetScroll = !opts || opts.resetScroll !== false;
    const r = route();
    const view = document.getElementById('view');
    document.getElementById('topbar-title').textContent = TITLES[r];
    document.title = TITLES[r] + " — Household Finance";
    document.querySelectorAll('[data-route]').forEach(a => {
      const active = a.dataset.route === r ||
        (a.dataset.route === 'plan' && ['budget', 'calendar', 'goals', 'house', 'invest', 'wedding', 'networth', 'debt', 'forecast'].includes(r));
      a.classList.toggle('active', active);
    });
    if (resetScroll) { view.scrollTop = 0; window.scrollTo(0, 0); }
    Views[r](view);
    const expBtn = document.getElementById('export-banner-btn');
    if (expBtn) expBtn.addEventListener('click', () => { exportTransactionsCSV(); render({ resetScroll: false }); });
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
            <button class="icon-btn modal-x" aria-label="Close">✕</button>
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
    if (!Store.needsExport()) return '';
    return `<div class="callout warn export-banner">
      <span>📤 You've made changes since your last CSV export.</span>
      <button class="btn ghost sm" id="export-banner-btn">Export CSV</button>
    </div>`;
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /* ---------- global search ---------- */
  /* One box that finds transactions, budget lines, goals, and wedding vendors
     from any screen — "when did we last pay the vet?" without setting filters. */
  function openSearch() {
    const m = modal('Search', `
      <input class="input" id="gs-q" type="search" placeholder="Merchant, bill, goal, vendor…"
        autocomplete="off" aria-label="Search everything">
      <div class="gs-results" id="gs-results"><p class="help">Search everything — transactions, budget lines, goals, wedding vendors.</p></div>`);
    const input = m.el.querySelector('#gs-q');
    const box = m.el.querySelector('#gs-results');
    const hit = (title, meta, amount, go) =>
      ({ title, meta, amount, go });
    const run = q => {
      q = q.trim().toLowerCase();
      if (q.length < 2) { box.innerHTML = '<p class="help">Type at least 2 characters.</p>'; return; }
      const has = s => String(s || '').toLowerCase().includes(q);
      const groups = [];
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
      if (!groups.length) { box.innerHTML = '<p class="help">No matches for “' + esc(q) + '”.</p>'; return; }
      box.innerHTML = groups.map(([label, hits]) => `
        <div class="gs-group-label">${label}</div>
        ${hits.map((h, i) => `<button class="gs-hit" data-g="${esc(label)}" data-i="${i}">
          <span class="gs-hit-main"><span class="gs-hit-title">${esc(h.title)}</span>
          ${h.meta ? `<span class="gs-hit-meta">${esc(h.meta)}</span>` : ''}</span>
          ${h.amount ? `<span class="gs-hit-amt">${esc(h.amount)}</span>` : ''}
        </button>`).join('')}`).join('');
      const byGroup = Object.fromEntries(groups.map(([label, hits]) => [label, hits]));
      box.querySelectorAll('.gs-hit').forEach(btn =>
        btn.addEventListener('click', () => { m.close(); byGroup[btn.dataset.g][+btn.dataset.i].go(); }));
    };
    let t;
    input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => run(input.value), 200); });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { const first = box.querySelector('.gs-hit'); if (first) first.click(); }
    });
    input.focus();
  }

  const options = (list, sel) =>
    list.map(v => `<option value="${esc(v)}"${v === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');

  /* ---------- bill reminders ---------- */
  /* Fires when the app opens or returns to the foreground — a local-only PWA
     has no server to push from, so this is the honest maximum: a notification
     where the platform allows it, and the Dashboard insights either way. */
  function checkReminders() {
    const due = Store.dueForReminder();
    if (!due.length) return;
    const title = due.length === 1 ? 'Bill due: ' + due[0].name : due.length + ' bills due soon';
    const body = due.map(d =>
      d.name + ' — ' + Store.fmt$(d.amount, 0) + ' due ' + Store.fmtDate(d.due)).join('\n');
    const done = () => Store.markReminded(due);
    if ('Notification' in window && Notification.permission === 'granted') {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready
          .then(reg => reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'cf-bills' }))
          .then(done)
          .catch(() => { try { new Notification(title, { body }); done(); } catch (e) { /* leave unlogged; retry next open */ } });
      } else {
        try { new Notification(title, { body }); done(); } catch (e) { /* leave unlogged; retry next open */ }
      }
    }
    // No permission → the insight feed carries it; don't mark as reminded so a
    // later grant still notifies.
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkReminders();
  });

  window.App = {
    render, toast, modal, confirmDialog, download, esc, options, routeParams, clearRouteParams, go,
    exportTransactionsCSV, exportBanner, openSearch, checkReminders
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

  // Static nav icons only need to be stamped in once — the sidebar/bottom-nav
  // shell isn't re-rendered by the router.
  document.querySelectorAll('[data-icon]').forEach(span => {
    if (window.Icons && Icons[span.dataset.icon]) span.innerHTML = Icons[span.dataset.icon];
  });

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
          render({ resetScroll: false });
        }
      }, 200);
    };
  })());
  function boot() {
    render();
    checkReminders();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline install is best-effort */ });
    }
  }
  if (window.Lock) Lock.guard(boot); else boot();
})();
