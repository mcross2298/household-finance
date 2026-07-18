/* Wedding Payoff — vendor payoff tracker through the wedding date. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.wedding = function (root) {
    const S = Store;
    const w = S.data.wedding;
    const remaining = S.weddingRemaining();
    const total = w.vendors.reduce((s, v) => s + (+v.amount || 0), 0);
    const paid = total - remaining;
    const vendors = [...w.vendors].sort((a, b) => (a.due || '') < (b.due || '') ? -1 : 1);

    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Wedding Payoff</h1>
          <button class="btn gold" id="w-add">＋ Add vendor</button>
        </div>

        <section class="card card-navy stat-band">
          ${stat('Wedding date', S.fmtDate(w.date))}
          ${stat('Total due', S.fmt$(total, 0))}
          ${stat('Paid', S.fmt$(paid, 0))}
          ${stat('Remaining', S.fmt$(remaining, 0), remaining > 0 ? 'gold' : '')}
        </section>
        ${remaining === 0 ? `<div class="callout good">All vendors are settled 🎉 — the cash this was absorbing now flows to the <a href="#/house">House Plan</a>.</div>`
          : `<div class="callout">Every dollar here clears by ${S.fmtDate(w.date)} — after that, this money frees up for the House Plan.</div>`}

        <section class="card">
          <div class="card-head"><h2>Vendors</h2></div>
          ${vendors.length ? `
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Paid</th><th>Vendor</th><th>Due</th><th class="num">Amount</th><th></th></tr></thead>
              <tbody>
                ${vendors.map(v => `
                  <tr class="${v.paid ? 'row-done' : ''}">
                    <td><input type="checkbox" data-paid="${v.id}" ${v.paid ? 'checked' : ''} aria-label="Mark ${App.esc(v.vendor)} paid"></td>
                    <td>${App.esc(v.vendor)}</td>
                    <td>${v.due ? S.fmtDate(v.due) : '—'}</td>
                    <td class="num">${S.fmt$(v.amount, 2)}</td>
                    <td><button class="btn slim ghost" data-edit="${v.id}">Edit</button></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>` : '<p class="empty">No vendors yet — add the balances from the Pre-Wedding Financial Roadmap.</p>'}
        </section>
      </div>`;

    root.querySelector('#w-add').addEventListener('click', () => editModal(null));
    root.querySelectorAll('[data-paid]').forEach(cb => cb.addEventListener('change', () => {
      const v = w.vendors.find(x => x.id === cb.dataset.paid);
      if (v) { v.paid = cb.checked; S.save(); App.render(); }
    }));
    root.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      const v = w.vendors.find(x => x.id === btn.dataset.edit);
      if (v) editModal(v);
    }));
  };

  const stat = (label, value, tone) =>
    `<div class="stat${tone ? ' ' + tone : ''}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

  function editModal(v) {
    const isNew = !v;
    const d = v || { vendor: '', due: '', amount: '', paid: false };
    const m = App.modal(isNew ? 'Add vendor' : 'Edit vendor', `
      <div class="form-grid">
        <label class="span2">Vendor<input class="input" id="w-vendor" value="${App.esc(d.vendor)}" placeholder="e.g. Venue (final payment)"></label>
        <label>Due date<input class="input" type="date" id="w-due" value="${d.due}"></label>
        <label>Amount due ($)<input class="input" type="number" step="0.01" id="w-amt" value="${d.amount}"></label>
      </div>
      <div class="btn-row">
        <button class="btn gold" id="w-save">${isNew ? 'Add' : 'Save'}</button>
        ${isNew ? '' : '<button class="btn danger ghost" id="w-del">Delete</button>'}
      </div>`);
    const g = id => m.el.querySelector(id);
    g('#w-save').addEventListener('click', () => {
      const name = g('#w-vendor').value.trim();
      if (!name) return App.toast('Name the vendor', 'warn');
      const next = {
        id: isNew ? Store.uid() : v.id, vendor: name,
        due: g('#w-due').value || '',
        amount: Math.max(0, parseFloat(g('#w-amt').value) || 0),
        paid: isNew ? false : v.paid
      };
      if (isNew) Store.data.wedding.vendors.push(next); else Object.assign(v, next);
      Store.save(); m.close(); App.render(); App.toast('Saved');
    });
    if (!isNew) g('#w-del').addEventListener('click', () => {
      App.confirmDialog('Delete vendor', `Remove “${App.esc(v.vendor)}”?`, 'Delete', () => {
        Store.data.wedding.vendors = Store.data.wedding.vendors.filter(x => x.id !== v.id);
        Store.save(); m.close(); App.render(); App.toast('Deleted');
      });
    });
  }
})();
