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
          <button class="btn gold" id="tx-add">${UI.icon("plus")}Add transaction</button>
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
    const split = t.splits && t.splits.length;
    return `<li class="tx-row" data-tx="${t.id}" role="button" tabindex="0">
      <div class="tx-date">${Store.fmtDate(t.date)}</div>
      <div class="tx-main">
        <div class="tx-desc">${App.esc(t.description) || '<i>(no description)</i>'}</div>
        <div class="tx-meta">
          <span class="chip">${App.esc(t.category)}</span>
          ${split ? `<span class="chip" title="${split} categories: ${t.splits.map(s => App.esc(s.category) + ' ' + Store.fmt$(s.amount, 2)).join(', ')}">split ×${split}</span>` : ''}
          <span class="chip who"><i class="swatch" style="background:${color}"></i>${App.esc(t.who)}</span>
          ${t.account ? `<span class="tx-account">${App.esc(t.account)}</span>` : ''}
        </div>
      </div>
      <div class="tx-amt">${Store.fmt$(t.amount, 2)}</div>
    </li>`;
  }

  /* Split-row template: one category + amount per part, shared by both the
     initial render (existing splits, or two starter rows) and #tx-split-add. */
  function splitRowHtml(split) {
    const s = split || { category: '', amount: '' };
    return `<div class="split-rule-row" data-split-row>
      <select class="select slim" data-role="split-cat">${App.options(Store.CATEGORIES, s.category)}</select>
      <input class="input slim num" type="number" step="0.01" min="0" data-role="split-amt" value="${s.amount === '' ? '' : s.amount}" placeholder="0.00">
      <button class="btn slim ghost danger" data-role="split-rm" aria-label="Remove split" type="button">${UI.icon("close")}</button>
    </div>`;
  }

  /* Up to N most-recently-used distinct merchants, most recent first — a
     one-tap prefill so a repeat purchase (coffee, gas, groceries) doesn't
     need the full form typed out one-handed. */
  function recentMerchants(limit) {
    const seen = new Set();
    const out = [];
    const sorted = [...Store.data.transactions].sort((a, b) => a.date < b.date ? 1 : -1);
    for (const t of sorted) {
      const key = Store.merchantKey(t.description);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(t);
      if (out.length >= limit) break;
    }
    return out;
  }

  function editModal(t) {
    const isNew = !t;
    const v = t || { date: new Date().toISOString().slice(0, 10), category: 'Groceries', description: '', amount: '', who: 'Shared', account: '', notes: '' };
    const recents = isNew ? recentMerchants(6) : [];
    const splitActive = !isNew && !!(t.splits && t.splits.length);
    const m = App.modal(isNew ? 'Add Transaction' : 'Edit Transaction', `
      ${recents.length ? `
      <div class="qf-chips">
        ${recents.map((r, i) => `<button type="button" class="qf-chip" data-qf="${i}">${App.esc(Store.prettyMerchant(r.description))} · ${Store.fmt$(r.amount, 2)}</button>`).join('')}
      </div>` : ''}
      <div class="form-grid">
        <label>Date<input class="input" type="date" id="tx-date" value="${v.date}"></label>
        <label>Amount<input class="input" type="number" step="0.01" inputmode="decimal" id="tx-amount" value="${v.amount}" placeholder="0.00"${splitActive ? ' disabled' : ''}></label>
        <label class="span2">Description<input class="input" id="tx-desc" value="${App.esc(v.description)}" placeholder="e.g. Giant Foods"></label>
        <label>Category<select class="select" id="tx-cat"${splitActive ? ' disabled' : ''}>${App.options(Store.CATEGORIES, v.category)}</select></label>
        <label>Who<select class="select" id="tx-who">${App.options(Store.WHO, v.who)}</select></label>
        <label>Account<input class="input" id="tx-account" value="${App.esc(v.account)}" placeholder="e.g. Everyday Card"></label>
        <label>Notes<input class="input" id="tx-notes" value="${App.esc(v.notes)}"></label>
      </div>
      ${!isNew ? `
      <div class="split-block">
        <button type="button" class="btn ghost sm" id="tx-split-toggle" style="margin-top:6px">${splitActive ? 'Edit split' : 'Split into categories'}</button>
        <div id="tx-split-panel"${splitActive ? '' : ' hidden'}>
          <p class="help">Break this transaction across more than one category — the total stays ${Store.fmt$(t.amount, 2)}.</p>
          <div id="tx-split-rows">${(splitActive ? t.splits : [{ category: v.category, amount: t.amount }, { category: '', amount: '' }]).map(splitRowHtml).join('')}</div>
          <button type="button" class="btn slim ghost" id="tx-split-add">${UI.icon("plus")}Add split</button>
          <div class="split-remaining"><span>Remaining to assign</span><b id="tx-split-remaining"></b></div>
          <p class="help" id="tx-split-hint" hidden>Give every row a category and an amount above $0 — at least two are needed to split.</p>
          <button type="button" class="btn ghost sm danger" id="tx-split-remove">Remove split</button>
        </div>
      </div>` : ''}
      <label class="learn-toggle"><input type="checkbox" id="tx-learn">
        <span id="tx-learn-text">Remember this merchant → category for future imports</span></label>
      <div class="btn-row">
        <button class="btn gold" id="tx-save">${isNew ? 'Add' : 'Save'}</button>
        ${isNew ? '' : '<button class="btn danger ghost" id="tx-del">Delete</button>'}
      </div>`);
    const g = id => m.el.querySelector(id);
    let splitCleared = false;
    if (!isNew) {
      const splitToggle = g('#tx-split-toggle');
      const splitPanel = g('#tx-split-panel');
      const splitRowsEl = g('#tx-split-rows');
      const splitRemaining = g('#tx-split-remaining');
      const amountInput = g('#tx-amount');
      const catSelect = g('#tx-cat');
      const target = () => Math.round((+t.amount || 0) * 100);
      const updateRemaining = () => {
        const rows = [...splitRowsEl.querySelectorAll('[data-split-row]')];
        const cents = rows.map(row => Math.round((parseFloat(row.querySelector('[data-role=split-amt]').value) || 0) * 100));
        const sum = cents.reduce((a, b) => a + b, 0);
        const remainingCents = target() - sum;
        // A lone full-amount row plus an untouched $0 row already nets to
        // zero remaining — that's not a real split yet, so Save stays gated
        // on at least two categories actually carrying money, not just the
        // total balancing out.
        const realParts = cents.filter(c => c > 0).length;
        const ok = remainingCents === 0 && realParts >= 2;
        splitRemaining.textContent = Store.fmt$(remainingCents / 100, 2);
        splitRemaining.classList.toggle('bad', !ok);
        splitRemaining.classList.toggle('good', ok);
        g('#tx-split-hint').hidden = !(remainingCents === 0 && realParts < 2);
        g('#tx-save').disabled = !ok;
      };
      const bindSplitRow = row => {
        row.querySelector('[data-role=split-amt]').addEventListener('input', updateRemaining);
        row.querySelector('[data-role=split-rm]').addEventListener('click', () => {
          if (splitRowsEl.querySelectorAll('[data-split-row]').length <= 2) return App.toast('A split needs at least two categories', 'warn');
          row.remove();
          updateRemaining();
        });
      };
      splitRowsEl.querySelectorAll('[data-split-row]').forEach(bindSplitRow);
      if (splitActive) updateRemaining();
      splitToggle.addEventListener('click', () => {
        const opening = splitPanel.hidden;
        splitPanel.hidden = !opening;
        amountInput.disabled = opening;
        catSelect.disabled = opening;
        splitToggle.textContent = opening ? 'Edit split' : 'Split into categories';
        splitCleared = false;
        if (opening) updateRemaining(); else g('#tx-save').disabled = false;
      });
      g('#tx-split-add').addEventListener('click', () => {
        const div = document.createElement('div');
        div.innerHTML = splitRowHtml(null);
        const row = div.firstElementChild;
        splitRowsEl.appendChild(row);
        bindSplitRow(row);
        updateRemaining();
      });
      g('#tx-split-remove').addEventListener('click', () => {
        splitCleared = true;
        splitPanel.hidden = true;
        amountInput.disabled = false;
        catSelect.disabled = false;
        splitToggle.textContent = 'Split into categories';
        g('#tx-save').disabled = false;
      });
    }
    /* This box used to default off while the identical control on the import
       review defaults on — so the single most informative thing a person does,
       correcting a wrong category, taught the rules engine nothing. It arms
       itself once the edit actually changes an existing row's category. */
    let learnTouched = false;
    const syncLearnDefault = () => {
      if (isNew || learnTouched) return;
      const changed = g('#tx-cat').value !== v.category;
      g('#tx-learn').checked = changed;
      g('#tx-learn-text').textContent = changed
        ? 'Remember ' + Store.prettyMerchant(g('#tx-desc').value || v.description) + ' → ' + g('#tx-cat').value + ' for future imports'
        : 'Remember this merchant → category for future imports';
    };
    if (!isNew) {
      g('#tx-learn').addEventListener('change', () => { learnTouched = true; });
      g('#tx-cat').addEventListener('change', syncLearnDefault);
      g('#tx-desc').addEventListener('input', syncLearnDefault);
    }
    m.el.querySelectorAll('[data-qf]').forEach(btn => btn.addEventListener('click', () => {
      const r = recents[+btn.dataset.qf];
      g('#tx-amount').value = r.amount;
      g('#tx-desc').value = r.description;
      g('#tx-cat').value = r.category;
      g('#tx-who').value = r.who;
      g('#tx-account').value = r.account;
      g('#tx-amount').focus();
    }));
    g('#tx-save').addEventListener('click', () => {
      const amount = parseFloat(g('#tx-amount').value);
      const date = g('#tx-date').value;
      if (!date) return App.toast('Pick a date', 'warn');
      if (isNaN(amount)) return App.toast('Enter an amount', 'warn');
      let splitParts = null;
      const splitPanel = !isNew && g('#tx-split-panel');
      if (splitPanel && !splitPanel.hidden) {
        splitParts = [...g('#tx-split-rows').querySelectorAll('[data-split-row]')]
          .map(row => ({
            category: row.querySelector('[data-role=split-cat]').value,
            amount: parseFloat(row.querySelector('[data-role=split-amt]').value) || 0
          }))
          .filter(p => p.category && p.amount > 0);
        if (splitParts.length < 2) return App.toast('Add at least two categories to split this transaction', 'warn');
        const sumCents = splitParts.reduce((s, p) => s + Math.round(p.amount * 100), 0);
        if (sumCents !== Math.round((+t.amount || 0) * 100)) return App.toast('Splits must add up to the full amount before saving', 'warn');
      }
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
      if (splitParts) Store.applySplit(next.id, splitParts);
      else if (splitCleared) Store.clearSplit(next.id);
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
