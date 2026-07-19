/* Debt Payoff Plan — Conservative/Base/Aggressive strategies side by side,
   per debt and household-wide, plus a snowball/avalanche order hint and a
   rolling payoff simulation comparing the two head-to-head. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  let rollupExtra = 0; // shared extra $/mo tried across the snowball/avalanche comparison

  Views.debt = function (root) {
    const S = Store;
    const debts = S.data.accounts.filter(a => a.kind === 'debt');
    const owed = debts.filter(a => (S.latestBalance(a.id) || 0) > 0);
    const summary = S.debtStrategiesSummary();
    const order = S.debtPayoffOrder();
    const comparison = S.debtPayoffOrderComparison(rollupExtra);
    const totalBalance = owed.reduce((s, a) => s + (S.latestBalance(a.id) || 0), 0);
    const totalMin = owed.reduce((s, a) => s + (+a.payment || 0), 0);

    root.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>Debt Payoff Plan</h1></div>
        <p class="page-sub">Every debt with a balance, modeled at three payment levels. Balances and minimum payments come from the <a href="#/networth">Net Worth</a> accounts registry — update them there.</p>

        <section class="card card-navy stat-band">
          ${stat('Total owed', S.fmt$(totalBalance, 0))}
          ${stat('Minimum / mo (all debts)', S.fmt$(totalMin, 0))}
          ${stat('Debts tracked', String(owed.length))}
          ${stat('Interest saved, Aggressive vs. Conservative',
            summary[0].interest != null && summary[2].interest != null
              ? S.fmt$(Math.max(0, summary[0].interest - summary[2].interest), 0) : '—')}
        </section>

        ${owed.length === 0 ? '<section class="card"><p class="empty">No debt balances yet. Add a snapshot on <a href="#/networth">Net Worth</a> and strategies appear here.</p></section>' : `

        <div class="scenario-grid">
          ${summary.map(strategyCard).join('')}
        </div>

        <section class="card">
          <div class="card-head"><h2>By debt</h2><span class="card-note">months to payoff · interest remaining, per strategy</span></div>
          <div class="table-scroll">
            <table class="table">
              <thead><tr>
                <th>Debt</th><th class="num">Balance</th><th class="num">Min/mo</th>
                ${summary.map(s => `<th class="num">${s.label}</th>`).join('')}
              </tr></thead>
              <tbody>
                ${owed.map(a => debtRow(a)).join('')}
              </tbody>
            </table>
          </div>
          <p class="help">Each column assumes that debt alone is bumped to the strategy's multiplier — other debts stay at their own minimums unless you apply the same strategy to all of them.</p>
        </section>

        ${owed.length > 1 ? `
        <section class="card">
          <div class="card-head"><h2>Which to attack first?</h2><span class="card-note">a hint, not a scheduler</span></div>
          <div class="two-col">
            <div>
              <b>Snowball</b> — smallest balance first, for momentum
              <ol class="steps">${order.snowball.map((a, i) => `<li>${App.esc(a.name)} — ${S.fmt$(S.latestBalance(a.id) || 0, 0)}</li>`).join('')}</ol>
            </div>
            <div>
              <b>Avalanche</b> — highest rate first, cheapest overall
              <ol class="steps">${order.avalanche.map(a => `<li>${App.esc(a.name)} — ${a.rate ? a.rate + '%' : 'no rate set'}</li>`).join('')}</ol>
            </div>
          </div>
          <p class="help">Once a debt is paid off, roll its full payment into the next one on your chosen list — that's the "snowball"/"avalanche" effect. This app doesn't auto-roll payments; revisit this page as balances change.</p>
        </section>
        <section class="card">
          <div class="card-head"><h2>Snowball vs. avalanche, head to head</h2>
            <span class="card-note">rolling payments simulated — not just independent per-debt math</span></div>
          <label class="payoff-slider">Extra <b>${S.fmt$(rollupExtra, 0)}</b>/mo, on top of every minimum
            <input type="range" min="0" max="500" step="25" value="${rollupExtra}" id="rollup-extra">
          </label>
          ${comparison ? `
          <div class="two-col" style="margin-top:12px">
            ${rollupCard('Snowball', comparison.snowball, comparison.avalanche)}
            ${rollupCard('Avalanche', comparison.avalanche, comparison.snowball)}
          </div>` : ''}
          <p class="help">Same total dollars, different order — this is what actually changes once a debt hits zero and its payment rolls into the next one.</p>
        </section>` : ''}
        `}
      </div>`;

    const rollupSlider = root.querySelector('#rollup-extra');
    if (rollupSlider) rollupSlider.addEventListener('change', () => {
      rollupExtra = +rollupSlider.value;
      App.render({ resetScroll: false });
    });
  };

  const stat = (label, value) =>
    `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

  function rollupCard(label, plan, other) {
    const S = Store;
    const monthsDelta = other.months - plan.months;
    const interestDelta = other.interest - plan.interest;
    return `<section class="card sc-card">
      <div class="card-head"><h2>${label}</h2></div>
      <div class="sc-piti">${plan.months} mo<span>to debt-free</span></div>
      ${row('Finish date', S.fmtDate(plan.date), 'strong')}
      ${row('Total interest', S.fmt$(plan.interest, 0))}
      ${row('vs. the other order', (monthsDelta === 0 ? 'same finish' : monthsDelta > 0 ? monthsDelta + ' mo sooner' : Math.abs(monthsDelta) + ' mo slower')
        + (interestDelta !== 0 ? ' · ' + (interestDelta > 0 ? 'saves ' : 'costs ') + S.fmt$(Math.abs(interestDelta), 0) : ''))}
    </section>`;
  }

  function strategyCard(s) {
    const S = Store;
    const extraNote = s.extraTotal > 0 ? `${S.fmt$(s.extraTotal, 0)}/mo extra across every debt` : 'minimum payments only';
    return `<section class="card sc-card">
      <div class="card-head"><h2>${s.label}</h2>
        ${s.extraTotal > 0 ? `<span class="pill ${s.affordable ? 'good' : 'bad'}">${s.affordable ? 'Fits surplus' : 'Over surplus'}</span>` : ''}</div>
      <div class="sc-piti">${s.months != null ? s.months + ' mo' : '—'}<span>to debt-free</span></div>
      ${row('Extra payment', extraNote)}
      ${row('Interest remaining', s.interest != null ? S.fmt$(s.interest, 0) : '—')}
      ${row('Payoff date', s.date ? S.fmtDate(s.date) : 'payment doesn\'t cover interest', 'strong')}
    </section>`;
  }

  function row(label, value, cls) {
    return `<div class="sc-row${cls ? ' ' + cls : ''}"><span>${label}</span><b>${value}</b></div>`;
  }

  function debtRow(a) {
    const S = Store;
    const strategies = S.debtStrategies(a);
    return `<tr>
      <td>${App.esc(a.name)}<div class="acct-meta">${App.esc(a.type)}${a.rate ? ' · ' + a.rate + '%' : ''}</div></td>
      <td class="num">${S.fmt$(S.latestBalance(a.id) || 0, 0)}</td>
      <td class="num">${S.fmt$(a.payment || 0, 0)}</td>
      ${strategies.map(s => `<td class="num">${s.months != null ? s.months + ' mo' : '—'}${s.interest != null ? '<div class="acct-meta">' + S.fmt$(s.interest, 0) + ' int.</div>' : ''}</td>`).join('')}
    </tr>`;
  }
})();
