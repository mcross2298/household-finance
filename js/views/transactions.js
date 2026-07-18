/* Transactions — filterable list, add / edit / delete. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const filters = { month: 'all', category: 'all', who: 'all', q: '' };

  Views.transactions = function (root) {
    const S = Store;
    const incoming = App.routeParams();
    if (Object.keys(incoming).length) {
      // A drill-down link defines the whole filter state — anything it doesn't
      // specify resets, so stale filters from a previous visit can't hide rows.
      filters.month = incoming.month || 'all';
      filters.category = incoming.category || 'all';
      filters.who = incoming.who || 'all';
      filters.q = incoming.q || '';
      App.clearRouteParams();
    }
    const months = S.monthsWithData().slice().reverse();
    let list = [...S.data.transactions].sort((a, b) => b.date < a.date ? -1 : 1);
    if (filters.month !== 'all') list = list.filter(t => t.date.startsWith(filters.month));
    if (filters.category !== 'all') list = list.filter(t => t.category === filters.category);
    if (filters.who !== 'all') list = list.filter(t => t.who === filters.who);
    if (filters.q) {
      const q = filters.q.toLowerCase();
      list = list.filter(t => (t.description + ' ' + t.account + ' ' + t.notes).toLowerCase().includes(q));
    }
    const total = list.reduce((s, t) => s + (+t.amount || 0), 0);

    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Transactions</h1>
          <button class="btn gold" id="tx-add">＋ Add</button>
        </div>
        ${App.exportBanner()}
        <div class="filter-row">
          <select class="select" id="f-month" aria-label="Filter by month">
            <option value="all">All months</option>
            ${months.map(m => `<option value="${m}"${filters.month === m ? ' selected' : ''}>${S.fmtMonth(m)}</option>`).join('')}
          </select>
          <select class="select" id="f-cat" aria-label="Filter by category">
            <option value="all">All categories</option>${App.options(S.CATEGORIES, filters.category)}
          </select>
          <select class="select" id="f-who" aria-label="Filter by person">
            <option value="all">Everyone</option>${App.options(S.WHO, filters.who)}
          </select>
          <input class="input search" id="f-q" type="search" placeholder="Search…" value="${App.esc(filters.q)}" aria-label="Search transactions">
        </div>
        <div class="card">
          <div class="card-head">
            <h2>${list.length} transaction${list.length === 1 ? '' : 's'}</h2>
            <span class="card-note">Total ${S.fmt$(total)}</span>
          </div>
          ${list.length ? `<ul class="tx-list">${list.map(row).join('')}</ul>`
            : '<p class="empty">Nothing matches. Import a statement or add a transaction.</p>'}
        </div>
      </div>`;

    root.querySelector('#f-month').addEventListener('change', e => { filters.month = e.target.value; App.render(); });
    root.querySelector('#f-cat').addEventListener('change', e => { filters.category = e.target.value; App.render(); });
    root.querySelector('#f-who').addEventListener('change', e => { filters.who = e.target.value; App.render(); });
    root.querySelector('#f-q').addEventListener('input', e => {
      filters.q = e.target.value;
      clearTimeout(root._qT); root._qT = setTimeout(App.render, 250);
    });
    root.querySelector('#tx-add').addEventListener('click', () => editModal(null));
    root.querySelectorAll('[data-tx]').forEach(li =>
      li.addEventListener('click', () => {
        const t = S.data.transactions.find(x => x.id === li.dataset.tx);
        if (t) editModal(t);
      }));
  };

  function row(t) {
    const color = Charts.whoColor(t.who);
    return `<li class="tx-row" data-tx="${t.id}" role="button" tabindex="0">
      <div class="tx-date">${Store.fmtDate(t.date)}</div>
      <div class="tx-main">
        <div class="tx-desc">${App.esc(t.description) || '<i>(no description)</i>'}</div>
        <div class="tx-meta">
          <span class="chip">${App.esc(t.category)}</span>
          <span class="chip" style="border-color:${color};color:${color}">${App.esc(t.who)}</span>
          ${t.account ? `<span class="tx-account">${App.esc(t.account)}</span>` : ''}
        </div>
      </div>
      <div class="tx-amt">${Store.fmt$(t.amount, 2)}</div>
    </li>`;
  }

  function editModal(t) {
    const isNew = !t;
    const v = t || { date: new Date().toISOString().slice(0, 10), category: 'Groceries', description: '', amount: '', who: 'Shared', account: '', notes: '' };
    const m = App.modal(isNew ? 'Add Transaction' : 'Edit Transaction', `
      <div class="form-grid">
        <label>Date<input class="input" type="date" id="tx-date" value="${v.date}"></label>
        <label>Amount<input class="input" type="number" step="0.01" inputmode="decimal" id="tx-amount" value="${v.amount}" placeholder="0.00"></label>
        <label class="span2">Description<input class="input" id="tx-desc" value="${App.esc(v.description)}" placeholder="e.g. Fresh Market"></label>
        <label>Category<select class="select" id="tx-cat">${App.options(Store.CATEGORIES, v.category)}</select></label>
        <label>Who<select class="select" id="tx-who">${App.options(Store.WHO, v.who)}</select></label>
        <label>Account<input class="input" id="tx-account" value="${App.esc(v.account)}" placeholder="e.g. Everyday Card"></label>
        <label>Notes<input class="input" id="tx-notes" value="${App.esc(v.notes)}"></label>
      </div>
      <label class="learn-toggle"><input type="checkbox" id="tx-learn">
        Remember this merchant → category for future imports</label>
      <div class="btn-row">
        <button class="btn gold" id="tx-save">${isNew ? 'Add' : 'Save'}</button>
        ${isNew ? '' : '<button class="btn danger ghost" id="tx-del">Delete</button>'}
      </div>`);
    const g = id => m.el.querySelector(id);
    g('#tx-save').addEventListener('click', () => {
      const amount = parseFloat(g('#tx-amount').value);
      const date = g('#tx-date').value;
      if (!date) return App.toast('Pick a date', 'warn');
      if (isNaN(amount)) return App.toast('Enter an amount', 'warn');
      const next = {
        id: isNew ? Store.uid() : t.id,
        date, amount: Math.round(amount * 100) / 100,
        category: g('#tx-cat').value, who: g('#tx-who').value,
        description: g('#tx-desc').value.trim(),
        account: g('#tx-account').value.trim(),
        notes: g('#tx-notes').value.trim()
      };
      if (isNew) Store.data.transactions.push(next);
      else Object.assign(t, next);
      const learned = g('#tx-learn').checked && next.description
        && Store.learnRule(next.description, next.category, next.who);
      Store.touchTransactions(); Store.save(); m.close(); App.render();
      App.toast((isNew ? 'Transaction added' : 'Saved') + (learned ? ' · rule remembered' : ''));
    });
    if (!isNew) g('#tx-del').addEventListener('click', () => {
      App.confirmDialog('Delete transaction',
        `Delete “${App.esc(t.description || t.category)}” for ${Store.fmt$(t.amount, 2)}?`, 'Delete', () => {
          Store.data.transactions = Store.data.transactions.filter(x => x.id !== t.id);
          Store.touchTransactions(); Store.save(); m.close(); App.render(); App.toast('Deleted');
        });
    });
  }

  // Exposed so the app-wide quick-add FAB can open this same form from any screen.
  Views.transactions.openAdd = function () { editModal(null); };
})();
