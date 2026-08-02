/* Net Worth — the accounts registry, monthly balance snapshots, the net-worth
   trend line, and debt payoff projections with an extra-payment what-if. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  let extraPay = {}; // accountId -> extra monthly payment being tried (not saved)
  let refiRate = {};  // accountId -> trial APR being tried (not saved) — a refinance what-if

  Views.networth = function (root) {
    const S = Store;
    const series = S.netWorthSeries();
    const latest = series.length ? series[series.length - 1] : null;
    const month = S.thisMonth();
    const hasThisMonth = !!S.data.snapshots[month];
    const assets = S.data.accounts.filter(a => a.kind === 'asset');
    const debts = S.data.accounts.filter(a => a.kind === 'debt');

    /* An account with no snapshot yet this month, and something rollable to
       estimate from, gets its estimate shown in place of a stale confirmed
       figure — with a one-tap confirm that writes it straight into this
       month's snapshot. Tapping the row itself (for the name/type/edit
       modal) still works; the confirm button is a separate, smaller target
       inside it, same pattern as the reminder feed's "Mark reviewed".
       estimatedBalance() already checks THIS account's own snapshot history
       (not whether the household happened to snapshot some other account
       this month), so it's called directly rather than gated on the
       page-level hasThisMonth, which answers a different question. */
    const acctRow = a => {
      const b = S.latestBalance(a.id);
      const est = S.estimatedBalance(a.id);
      const value = est ? est.balance : b;
      const figure = value == null ? '—' : (est ? '~' : '') + S.fmt$(value, 0);
      return `<li class="acct-row${est ? ' acct-estimated' : ''}" data-acct="${a.id}" role="button" tabindex="0">
        <div class="acct-main">
          <span class="acct-name">${App.esc(a.name)}${est ? ' <span class="pill plain acct-est-pill">est.</span>' : ''}</span>
          <span class="acct-meta">${App.esc(a.type)} · ${a.owner}${a.kind === 'debt' && a.payment ? ' · ' + S.fmt$(a.payment, 0) + '/mo' : ''}${a.rate ? ' · ' + a.rate + '%' : ''}</span>
        </div>
        ${est ? `<button class="btn ghost sm acct-confirm" data-confirm="${a.id}" data-confirm-amt="${est.balance}">Confirm</button>` : ''}
        <b class="${est ? 'acct-est-value' : (a.kind === 'debt' && value > 0 ? 'neg' : '')}">${figure}</b>
      </li>`;
    };

    const payoffCard = a => {
      const extra = +extraPay[a.id] || 0;
      const rate = refiRate[a.id] != null ? +refiRate[a.id] : (+a.rate || 0);
      const now = S.debtPayoff(a, 0);
      const w = S.debtPayoff(a, extra, rate);
      if (now.balance == null) return '';
      if (now.balance <= 0) return `<div class="payoff"><b>${App.esc(a.name)}</b><span class="pill good">paid off 🎉</span></div>`;
      const line = now.months == null
        ? '<span class="neg">payment doesn\'t cover interest — check rate/payment</span>'
        : `${now.months} mo → <b>${S.fmtDate(now.date)}</b>${a.rate ? ' · ' + S.fmt$(now.interest, 0) + ' interest left' : ''}`;
      const rateChanged = Math.abs(rate - (+a.rate || 0)) >= 0.01;
      const changed = extra > 0 || rateChanged;
      const whatIfLabel = [extra > 0 ? '+' + S.fmt$(extra, 0) + '/mo' : '', rateChanged ? 'refi to ' + rate + '%' : ''].filter(Boolean).join(' · ');
      const whatIf = changed && w.months != null && now.months != null
        ? `<div class="payoff-whatif">${whatIfLabel} → ${w.months} mo (<b class="pos">${now.months - w.months} sooner</b>, saves ${S.fmt$(now.interest - w.interest, 0)})</div>` : '';
      return `<div class="payoff">
        <div class="payoff-head"><b>${App.esc(a.name)}</b><span>${S.fmt$(now.balance, 0)}</span></div>
        <div class="payoff-line">${line}</div>
        <label class="payoff-slider">Extra <b>${S.fmt$(extra, 0)}</b>/mo
          <input type="range" min="0" max="500" step="25" value="${extra}" data-extra="${a.id}">
        </label>
        <label class="payoff-slider">Refi rate <b>${rate}%</b> <span class="muted">(now ${a.rate}%)</span>
          <input type="range" min="0" max="15" step="0.25" value="${rate}" data-refi="${a.id}">
        </label>
        ${whatIf}
      </div>`;
    };

    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Net Worth</h1>
          <button class="btn gold" id="nw-snapshot">${hasThisMonth ? 'Edit' : 'Update'} balances</button>
        </div>

        <section class="card card-navy stat-band">
          ${UI.stat('Net worth', latest ? S.fmt$(latest.net, 0) : '—')}
          ${UI.stat('Assets', latest ? S.fmt$(latest.assets, 0) : '—')}
          ${UI.stat('Debts', latest ? S.fmt$(latest.debts, 0) : '—')}
          ${UI.stat('Updated', latest ? S.fmtMonth(latest.ym) : 'never')}
        </section>

        <section class="card">
          <div class="card-head"><h2>Trend</h2><span class="card-note">one snapshot a month is plenty</span></div>
          <div id="nw-chart"></div>
          ${series.length < 2 ? '<p class="help">The line appears after your second monthly snapshot — the first one starts the clock.</p>' : ''}
        </section>

        <div class="two-col">
          <section class="card">
            <div class="card-head"><h2>Assets</h2><span class="card-note">tap to edit</span></div>
            <ul class="acct-list">${assets.map(acctRow).join('')}</ul>
            <div class="btn-row"><button class="btn gold" id="acct-add-asset">${UI.icon("plus")}Add asset</button></div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Debts</h2><span class="card-note">tap to edit</span></div>
            <ul class="acct-list">${debts.map(acctRow).join('')}</ul>
            <div class="btn-row"><button class="btn gold" id="acct-add-debt">${UI.icon("plus")}Add debt</button></div>
          </section>
        </div>

        <section class="card">
          <div class="card-head"><h2>Debt payoff</h2><a class="card-link" href="#/debt">Full payoff plan →</a></div>
          ${debts.some(d => (S.latestBalance(d.id) || 0) > 0)
            ? debts.map(payoffCard).join('')
            : '<p class="empty">Add debt balances in a snapshot and payoff dates appear here.</p>'}
          <p class="help">Sliders are what-ifs — nothing changes until you actually raise the payment with your lender/bank. For side-by-side Conservative/Base/Aggressive strategies across every debt, see the <a href="#/debt">Debt Payoff Plan</a>.</p>
        </section>
      </div>`;

    if (series.length) {
      Charts.line(root.querySelector('#nw-chart'),
        series.map(p => ({ ym: p.ym, value: p.net, tip: 'assets ' + S.fmt$(p.assets, 0) + ' · debts ' + S.fmt$(p.debts, 0) })),
        { empty: 'No snapshots yet.' });
    } else {
      root.querySelector('#nw-chart').innerHTML = '<p class="empty">No snapshots yet — tap “Update balances” to start the trend.</p>';
    }

    root.querySelector('#nw-snapshot').addEventListener('click', snapshotModal);
    root.querySelector('#acct-add-asset').addEventListener('click', () => acctModal(null, 'asset'));
    root.querySelector('#acct-add-debt').addEventListener('click', () => acctModal(null, 'debt'));
    root.querySelectorAll('[data-acct]').forEach(li =>
      li.addEventListener('click', e => {
        if (e.target.closest('[data-confirm]')) return; // handled below, not the row's edit-modal tap
        const a = S.data.accounts.find(x => x.id === li.dataset.acct);
        if (a) acctModal(a, a.kind);
      }));
    root.querySelectorAll('[data-confirm]').forEach(btn =>
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const a = S.data.accounts.find(x => x.id === btn.dataset.confirm);
        S.saveSnapshot(S.thisMonth(), { [btn.dataset.confirm]: +btn.dataset.confirmAmt });
        App.render();
        App.toast((a ? a.name : 'Balance') + ' confirmed — ' + S.fmt$(+btn.dataset.confirmAmt, 0));
      }));
    root.querySelectorAll('[data-extra]').forEach(sl => {
      sl.addEventListener('change', () => {
        extraPay[sl.dataset.extra] = +sl.value;
        App.render();
      });
    });
    root.querySelectorAll('[data-refi]').forEach(sl => {
      sl.addEventListener('change', () => {
        refiRate[sl.dataset.refi] = +sl.value;
        App.render();
      });
    });
  };

  /* One modal, every balance — the whole monthly ritual in under two minutes. */
  function snapshotModal() {
    const S = Store;
    const month = S.thisMonth();
    const m = App.modal('Balances — ' + S.fmtMonth(month), `
      <p class="help">Enter what each account shows right now. Blank keeps the previous value.</p>
      <div class="close-goals">
        ${S.data.accounts.map(a => {
          const est = S.estimatedBalance(a.id);
          const b = est ? est.balance : S.latestBalance(a.id);
          return `<label class="close-goal"><span>${App.esc(a.name)}${a.kind === 'debt' ? ' <small>(owed)</small>' : ''}${est ? ' <small>(est. below)</small>' : ''}</span>
            <input class="input slim num" type="number" step="1" min="0" data-snap="${a.id}"
              value="${(S.data.snapshots[month] || {})[a.id] != null ? S.data.snapshots[month][a.id] : ''}"
              placeholder="${b == null ? '0' : b}"></label>`;
        }).join('')}
      </div>
      <div class="btn-row"><button class="btn gold" id="snap-save">Save snapshot</button></div>`);
    m.el.querySelector('#snap-save').addEventListener('click', () => {
      const balances = {};
      m.el.querySelectorAll('[data-snap]').forEach(inp => {
        if (inp.value !== '') balances[inp.dataset.snap] = Math.max(0, parseFloat(inp.value) || 0);
      });
      if (!Object.keys(balances).length) return App.toast('Enter at least one balance', 'warn');
      S.saveSnapshot(month, balances);
      m.close(); App.render(); App.toast('Snapshot saved — net worth updated');
    });
  }

  function acctModal(a, kind) {
    const isNew = !a;
    const v = a || { name: '', kind, type: kind === 'debt' ? 'Loan' : 'Checking', owner: 'Shared', payment: '', rate: '' };
    const types = kind === 'debt' ? Store.DEBT_TYPES : ['Checking', 'Savings', 'Investment', 'Other'];
    const m = App.modal((isNew ? 'Add ' : 'Edit ') + (kind === 'debt' ? 'debt' : 'asset'), `
      <div class="form-grid">
        <label class="span2">Name<input class="input" id="ac-name" value="${App.esc(v.name)}" placeholder="${kind === 'debt' ? 'e.g. Car Loan' : 'e.g. HYSA'}"></label>
        <label>Type<select class="select" id="ac-type">${App.options(types, v.type)}</select></label>
        <label>Owner<select class="select" id="ac-owner">${App.options(Store.WHO, v.owner)}</select></label>
        ${kind === 'debt' ? `
        <label>Monthly payment ($)<input class="input" type="number" step="1" id="ac-payment" value="${v.payment}"></label>
        <label>APR (%)<input class="input" type="number" step="0.01" id="ac-rate" value="${v.rate}"></label>` : ''}
      </div>
      <div class="btn-row">
        <button class="btn gold" id="ac-save">${isNew ? 'Add' : 'Save'}</button>
        ${isNew ? '' : '<button class="btn danger ghost" id="ac-del">Delete</button>'}
      </div>`);
    const g = id => m.el.querySelector(id);
    g('#ac-save').addEventListener('click', () => {
      const name = g('#ac-name').value.trim();
      if (!name) return App.toast('Name the account', 'warn');
      const next = {
        id: isNew ? Store.uid() : a.id, name, kind,
        type: g('#ac-type').value, owner: g('#ac-owner').value,
        payment: kind === 'debt' ? Math.max(0, parseFloat(g('#ac-payment').value) || 0) : 0,
        rate: kind === 'debt' ? Math.max(0, parseFloat(g('#ac-rate').value) || 0) : 0
      };
      if (isNew) Store.data.accounts.push(next); else Object.assign(a, next);
      Store.save(); m.close(); App.render(); App.toast('Saved');
    });
    if (!isNew) g('#ac-del').addEventListener('click', () => {
      App.confirmDialog('Delete account', `Remove “${App.esc(a.name)}” from the registry? Its past snapshots stay in your data.`, 'Delete', () => {
        Store.data.accounts = Store.data.accounts.filter(x => x.id !== a.id);
        Store.save(); m.close(); App.render(); App.toast('Deleted');
      });
    });
  }
})();
