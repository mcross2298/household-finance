/* Investments — Roth IRA tracker + HYSA projection. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.invest = function (root) {
    const S = Store;
    const inv = S.data.invest;
    const roster = S.members();
    const rothMetas = roster.map(n => ({ name: n, meta: S.rothMeta(n) }));
    const hysa = inv.hysa;

    const rothCard = (name, i, m) => `
      <section class="card">
        <div class="card-head"><h2>Roth IRA — ${App.esc(name)}</h2>
          <span class="pill ${m.remaining === 0 ? 'good' : ''}">${m.remaining === 0 ? 'maxed 🎉' : S.fmt$(m.remaining, 0) + ' to go'}</span></div>
        <div class="goal-top">
          <div class="goal-ring" id="ring-roth-${i}"></div>
          <div class="goal-info">
            <div class="goal-nums">${S.fmt$(m.ytd, 0)} <span class="muted">of</span> ${S.fmt$(m.limit, 0)}</div>
            <div class="goal-sub">${inv.rothYear} limit · deadline Apr 15, ${inv.rothYear + 1}</div>
            ${m.remaining > 0 ? `<div class="goal-sub"><b>${S.fmt$(m.monthlyToMax, 0)}/mo</b> maxes it by December (${m.monthsLeft} month${m.monthsLeft === 1 ? '' : 's'} left) —
              ~${S.fmt$(m.perPaycheckToMax, 0)} per paycheck</div>` : ''}
          </div>
        </div>
        <div class="form-grid">
          <label>Contributed YTD ($)<input class="input" type="number" step="50" id="roth-idx-${i}" value="${m.ytd}"></label>
        </div>
      </section>`;

    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Investments</h1>
          <label style="display:flex;flex-direction:row;align-items:center;gap:8px">Pay frequency
            <select class="select slim" id="pay-freq">
              <option value="weekly"${inv.payFrequency === 'weekly' ? ' selected' : ''}>Weekly</option>
              <option value="biweekly"${inv.payFrequency === 'biweekly' ? ' selected' : ''}>Biweekly</option>
              <option value="semimonthly"${inv.payFrequency === 'semimonthly' ? ' selected' : ''}>Semi-monthly</option>
              <option value="monthly"${inv.payFrequency === 'monthly' ? ' selected' : ''}>Monthly</option>
            </select>
          </label>
        </div>
        <div class="${roster.length === 1 ? '' : 'two-col'}">
          ${rothMetas.length ? rothMetas.map((r, i) => rothCard(r.name, i, r.meta)).join('')
            : '<section class="card"><p class="empty">Add a household member on the Budget screen to track Roth contributions.</p></section>'}
        </div>

        <section class="card">
          <div class="card-head"><h2>HYSA projection</h2><span class="card-note">high-yield savings growth</span></div>
          <div class="form-grid">
            <label>Current balance ($)<input class="input" type="number" step="100" id="hysa-bal" value="${hysa.balance}"></label>
            <label>Monthly deposit ($)<input class="input" type="number" step="50" id="hysa-dep" value="${hysa.deposit}"></label>
          </div>
          <div class="table-scroll">
            <table class="table">
              <thead><tr><th>Scenario</th><th class="num">APY</th><th class="num">In 12 months</th><th class="num">In 24 months</th></tr></thead>
              <tbody>
                ${['Conservative', 'Base', 'Optimistic'].map((name, i) => {
                  const apy = hysa.apys[i];
                  return `<tr>
                    <td>${name}</td>
                    <td class="num"><input class="input slim num" type="number" step="0.1" data-apy="${i}" value="${apy}">%</td>
                    <td class="num">${S.fmt$(S.hysaProjection(apy, 12), 0)}</td>
                    <td class="num">${S.fmt$(S.hysaProjection(apy, 24), 0)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <p class="help">Deposits compound monthly, end-of-month.</p>
        </section>
      </div>`;

    rothMetas.forEach((r, i) =>
      Charts.ring(root.querySelector('#ring-roth-' + i), r.meta.limit ? r.meta.ytd / r.meta.limit : 0));

    const bindNum = (sel, fn) => {
      const el = root.querySelector(sel);
      if (el) el.addEventListener('change', e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 0) { fn(v); Store.save(); App.render(); }
      });
    };
    rothMetas.forEach((r, i) => bindNum('#roth-idx-' + i, v => { inv.roth[r.name] = v; }));
    bindNum('#hysa-bal', v => inv.hysa.balance = v);
    bindNum('#hysa-dep', v => inv.hysa.deposit = v);
    root.querySelectorAll('[data-apy]').forEach(inp => inp.addEventListener('change', () => {
      const v = parseFloat(inp.value);
      if (!isNaN(v) && v >= 0) { inv.hysa.apys[+inp.dataset.apy] = v; Store.save(); App.render(); }
    }));
    root.querySelector('#pay-freq').addEventListener('change', e => {
      inv.payFrequency = e.target.value;
      Store.save(); App.render();
    });
  };
})();
