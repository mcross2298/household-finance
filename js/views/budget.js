/* Budget — system of record for recurring monthly expenses + take-home income. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.budget = function (root) {
    const S = Store;
    const total = S.budgetTotal();
    const p = S.budgetByPerson();
    const income = S.incomeTotal();
    const byType = { Fixed: 0, Discretionary: 0 };
    for (const b of S.data.budget) byType[b.type] = (byType[b.type] || 0) + (+b.monthly || 0);

    /* Which recurring bills have posted this month (from imported/entered
       transactions), and month-to-date actuals for discretionary lines. */
    const status = S.budgetLineStatus(S.thisMonth());
    const lineStatus = b => {
      const st = status[b.id];
      if (!st) return '';
      if (b.type === 'Fixed') {
        return st.posted
          ? `<span class="line-status posted">✓ posted ${S.fmtDate(st.tx.date).replace(/, \d{4}$/, '')}</span>`
          : '<span class="line-status pending">not yet this month</span>';
      }
      const spent = st.spent || 0;
      const over = b.monthly > 0 && spent > +b.monthly;
      return spent > 0
        ? `<span class="line-status${over ? ' over' : ''}">${S.fmt$(spent, 0)} of ${S.fmt$(b.monthly, 0)} this month</span>`
        : '';
    };

    const section = sec => S.data.budget.filter(b => b.section === sec);
    const secBlock = sec => `
      <div class="budget-sec" id="budget-sec-${sec}">
        <div class="budget-sec-head">
          <h3><span class="swatch" style="background:${Charts.whoColor(sec)}"></span>${App.esc(sec)}</h3>
          <span>${S.fmt$(section(sec).reduce((s, b) => s + (+b.monthly || 0), 0), 0)}/mo</span>
        </div>
        <ul class="budget-list">
          ${section(sec).map(b => `
            <li class="budget-row" data-id="${b.id}" role="button" tabindex="0">
              <div class="budget-main">
                <span class="budget-name">${App.esc(b.name)}</span>
                <span class="budget-meta">${App.esc(b.category)} · ${b.type}${b.dueDay ? ' · due day ' + b.dueDay : ''}${b.notes ? ' · ' + App.esc(b.notes) : ''}</span>
                ${lineStatus(b)}
              </div>
              <b>${S.fmt$(b.monthly, 0)}</b>
            </li>`).join('')}
        </ul>
      </div>`;

    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Budget</h1>
          <button class="btn gold" id="b-add">＋ Add line</button>
        </div>

        <section class="card card-navy stat-band">
          ${stat('Monthly budget', S.fmt$(total, 0))}
          ${stat('Annual', S.fmt$(total * 12, 0))}
          ${stat('Fixed', S.fmt$(byType.Fixed, 0) + ' · ' + S.fmtPct(total ? byType.Fixed / total : 0, 0))}
          ${stat('Discretionary', S.fmt$(byType.Discretionary, 0) + ' · ' + S.fmtPct(total ? byType.Discretionary / total : 0, 0))}
        </section>

        <section class="card">
          <div class="card-head"><h2>Household &amp; income</h2>
            <button class="btn ghost slim" id="m-add">＋ Add member</button></div>
          <div class="member-list">
            ${S.members().map((n, i) => `
              <div class="member-row" data-idx="${i}">
                <input class="input member-name" data-idx="${i}" value="${App.esc(n)}" aria-label="Member name">
                <label class="member-inc"><span>$</span><input class="input" type="number" min="0" step="1" data-inc-idx="${i}" value="${+S.data.incomes[n] || 0}" aria-label="${App.esc(n)} monthly take-home"></label>
                <button class="btn danger ghost slim" data-remove-idx="${i}"${S.members().length <= 1 ? ' disabled' : ''} title="Remove ${App.esc(n)}" aria-label="Remove ${App.esc(n)}">✕</button>
              </div>`).join('')}
          </div>
          <p class="help">Combined take-home ${S.fmt$(income, 0)}/mo → surplus after budget <b class="${S.surplus() < 0 ? 'neg' : 'pos'}">${S.fmt$(S.surplus(), 0)}</b> (${S.fmtPct(S.savingsRate())} savings rate). Each member's monthly take-home feeds the surplus, forecast, and per-person split.</p>
        </section>

        <section class="card">
          <div class="card-head"><h2>Recurring expenses</h2>
            ${p.section.Shared > 0 && S.members().length
              ? `<span class="card-note">Shared lines split evenly → ${S.members().map(n => `${App.esc(n)} ${S.fmt$(p.attributed[n], 0)}`).join(' · ')}</span>` : ''}</div>
          ${secBlock('Shared')}${S.members().map(secBlock).join('')}
        </section>
      </div>`;

    root.querySelectorAll('input[data-inc-idx]').forEach(inp =>
      inp.addEventListener('change', e => {
        const n = S.members()[+inp.dataset.incIdx];
        if (n == null) return;
        S.data.incomes[n] = Math.max(0, parseFloat(e.target.value) || 0);
        S.save(); App.render();
      }));
    root.querySelectorAll('input.member-name').forEach(inp =>
      inp.addEventListener('change', e => {
        const old = S.members()[+inp.dataset.idx];
        const next = e.target.value.trim();
        if (old == null || next === old) return App.render();
        if (!S.renameMember(old, next)) {
          App.toast(next ? `“${App.esc(next)}” is already taken` : 'Name can’t be blank', 'warn');
        }
        App.render();
      }));
    root.querySelectorAll('button[data-remove-idx]').forEach(btn =>
      btn.addEventListener('click', () => {
        const n = S.members()[+btn.dataset.removeIdx];
        if (n == null) return;
        App.confirmDialog('Remove member', `Remove <b>${App.esc(n)}</b> from the household? Their budget lines, transactions, and accounts stay but become <b>Shared</b>.`, 'Remove', () => {
          S.removeMember(n); App.render(); App.toast(`Removed ${n}`);
        });
      }));
    root.querySelector('#m-add').addEventListener('click', addMemberModal);
    root.querySelector('#b-add').addEventListener('click', () => editModal(null));
    root.querySelectorAll('.budget-row').forEach(li =>
      li.addEventListener('click', () => {
        const b = S.data.budget.find(x => x.id === li.dataset.id);
        if (b) editModal(b);
      }));

    const incoming = App.routeParams();
    if (incoming.section) {
      const target = root.querySelector('#budget-sec-' + CSS.escape(incoming.section));
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      App.clearRouteParams();
    }
  };

  const stat = (label, value) =>
    `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

  function addMemberModal() {
    const m = App.modal('Add household member', `
      <div class="form-grid">
        <label class="span2">Name<input class="input" id="m-name" placeholder="e.g. Alex" autocomplete="off"></label>
        <label class="span2">Monthly take-home ($)<input class="input" type="number" min="0" step="1" id="m-inc" value="0"></label>
      </div>
      <p class="help">You can attribute budget lines and transactions to this person, and “Shared” costs split evenly across everyone.</p>
      <div class="btn-row"><button class="btn gold" id="m-save">Add</button></div>`);
    const g = id => m.el.querySelector(id);
    g('#m-name').focus();
    g('#m-save').addEventListener('click', () => {
      const name = g('#m-name').value.trim();
      if (!name) return App.toast('Give the member a name', 'warn');
      const added = Store.addMember(name);
      if (!added) return App.toast('That name is taken (or reserved)', 'warn');
      Store.data.incomes[added] = Math.max(0, parseFloat(g('#m-inc').value) || 0);
      Store.save(); m.close(); App.render(); App.toast(`Added ${added}`);
    });
  }

  function editModal(b) {
    const isNew = !b;
    const v = b || { name: '', section: 'Shared', category: 'Other', type: 'Fixed', monthly: '', notes: '' };
    const m = App.modal(isNew ? 'Add budget line' : 'Edit budget line', `
      <div class="form-grid">
        <label class="span2">Expense<input class="input" id="b-name" value="${App.esc(v.name)}" placeholder="e.g. Rent"></label>
        <label>Section<select class="select" id="b-sec">${App.options(Store.WHO, v.section)}</select></label>
        <label>Category<select class="select" id="b-cat">${App.options(Store.CATEGORIES, v.category)}</select></label>
        <label>Type<select class="select" id="b-type">${App.options(Store.TYPES, v.type)}</select></label>
        <label>Monthly ($)<input class="input" type="number" step="0.01" id="b-monthly" value="${v.monthly}"></label>
        <label>Due day<select class="select" id="b-due">
          <option value="">— none —</option>
          ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${+v.dueDay === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}
        </select></label>
        <label class="span2">Notes<input class="input" id="b-notes" value="${App.esc(v.notes)}"></label>
      </div>
      <div class="btn-row">
        <button class="btn gold" id="b-save">${isNew ? 'Add' : 'Save'}</button>
        ${isNew ? '' : '<button class="btn danger ghost" id="b-del">Delete</button>'}
      </div>`);
    const g = id => m.el.querySelector(id);
    g('#b-save').addEventListener('click', () => {
      const name = g('#b-name').value.trim();
      const monthly = parseFloat(g('#b-monthly').value);
      if (!name) return App.toast('Name the expense', 'warn');
      if (isNaN(monthly) || monthly < 0) return App.toast('Enter a monthly amount', 'warn');
      const next = {
        id: isNew ? Store.uid() : b.id, name,
        section: g('#b-sec').value, category: g('#b-cat').value,
        type: g('#b-type').value, monthly: Math.round(monthly * 100) / 100,
        dueDay: g('#b-due').value ? +g('#b-due').value : null,
        notes: g('#b-notes').value.trim()
      };
      if (isNew) Store.data.budget.push(next); else Object.assign(b, next);
      Store.save(); m.close(); App.render(); App.toast('Saved');
    });
    if (!isNew) g('#b-del').addEventListener('click', () => {
      App.confirmDialog('Delete budget line', `Remove “${App.esc(b.name)}” (${Store.fmt$(b.monthly, 0)}/mo)?`, 'Delete', () => {
        Store.data.budget = Store.data.budget.filter(x => x.id !== b.id);
        Store.save(); m.close(); App.render(); App.toast('Deleted');
      });
    });
  }
})();
