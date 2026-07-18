/* Forecast — 12-month liquid-cash projection with planned one-off expenses,
   plus live what-if sliders for goal contributions (nothing saved until Apply). */
(function () {
  'use strict';
  window.Views = window.Views || {};

  let whatIfGoal = null;   // goal id being played with
  let whatIfMonthly = null; // trial monthly contribution (not saved)

  Views.forecast = function (root) {
    const S = Store;
    const fc = S.forecast(12);
    const hasSnapshots = Object.keys(S.data.snapshots).length > 0;
    const firstBad = fc.months.find(m => m.tone === 'bad');
    const firstWarn = fc.months.find(m => m.tone === 'warn');
    const goalCommitted = S.data.goals.reduce((s, g) => s + (+g.monthly || 0), 0);

    const goal = S.data.goals.find(g => g.id === whatIfGoal) || S.data.goals.find(g => g.isHouse) || S.data.goals[0];
    const trial = whatIfMonthly != null ? whatIfMonthly : (goal ? +goal.monthly || 0 : 0);
    let whatIfBlock = '';
    if (goal) {
      const meta = S.goalMeta(goal);
      const trialGoal = Object.assign({}, goal, { monthly: trial });
      const trialMeta = S.goalMeta(trialGoal);
      const houseLine = goal.isHouse && S.data.house.scenarios[0] ? (() => {
        // houseScenario reads the live goal — trial it without saving
        const saved = goal.monthly;
        goal.monthly = trial;
        const hs = S.houseScenario(S.data.house.scenarios[0]);
        goal.monthly = saved;
        return `<div class="whatif-line">House plan (${App.esc(S.data.house.scenarios[0].label)}): ready ${hs.readyBy ? S.fmtDate(hs.readyBy) : '—'}
          <span class="pill ${hs.vsTarget === 'ON TRACK' ? 'good' : 'warn'}">${hs.vsTarget || ''}</span></div>`;
      })() : '';
      whatIfBlock = `
        <section class="card">
          <div class="card-head"><h2>What if…</h2>
            <select class="select" id="wi-goal" aria-label="Goal to test">
              ${S.data.goals.map(g => `<option value="${g.id}"${g.id === goal.id ? ' selected' : ''}>${App.esc(g.name)}</option>`).join('')}
            </select>
          </div>
          <label class="payoff-slider">Contribution <b>${S.fmt$(trial, 0)}</b>/mo <span class="muted">(now ${S.fmt$(goal.monthly, 0)})</span>
            <input type="range" min="0" max="${Math.max(100, Math.ceil((+goal.monthly || 100) * 2 / 25) * 25)}" step="25" value="${trial}" id="wi-slider">
          </label>
          <div class="whatif-line">Projected date:
            <b>${trialMeta.projected ? S.fmtDate(trialMeta.projected) : (trialMeta.remaining === 0 ? 'funded 🎉' : 'never at $0/mo')}</b>
            ${meta.projected && trialMeta.projected && trialMeta.projected !== meta.projected
              ? `<span class="muted">(was ${S.fmtDate(meta.projected)})</span>` : ''}</div>
          ${houseLine}
          <div class="whatif-line">Monthly earmarked across all goals:
            <b>${S.fmt$(goalCommitted - (+goal.monthly || 0) + trial, 0)}</b> of ${S.fmt$(S.surplus(), 0)} surplus</div>
          <div class="btn-row">
            <button class="btn gold" id="wi-apply"${trial === +goal.monthly ? ' disabled' : ''}>Apply ${S.fmt$(trial, 0)}/mo</button>
            <button class="btn ghost" id="wi-reset"${trial === +goal.monthly ? ' disabled' : ''}>Reset</button>
          </div>
          <p class="help">Nothing changes until you tap Apply — slide freely.</p>
        </section>`;
    }

    root.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>Forecast</h1></div>

        <section class="card card-navy stat-band">
          ${stat('Liquid today', hasSnapshots ? S.fmt$(fc.start, 0) : '—')}
          ${stat('Monthly net', S.fmt$(fc.income - fc.budget - fc.rothMonthly, 0))}
          ${stat('In 12 months', hasSnapshots ? S.fmt$(fc.months[fc.months.length - 1].balance, 0) : '—')}
          ${stat('Watch out', firstBad ? S.fmtMonth(firstBad.ym) : firstWarn ? S.fmtMonth(firstWarn.ym) : 'all clear')}
        </section>

        ${hasSnapshots ? '' : `<div class="callout warn">📈 The forecast needs a starting point — take your first
          <a href="#/networth">balance snapshot</a> and it lights up.</div>`}

        <section class="card">
          <div class="card-head"><h2>Projected liquid balance</h2><span class="card-note">checking + savings, 12 months out</span></div>
          <div id="fc-chart"></div>
          <p class="help">Each month: + take-home ${S.fmt$(fc.income, 0)} − budget ${S.fmt$(fc.budget, 0)}
            − Roth contributions ${S.fmt$(fc.rothMonthly, 0)} − wedding payments − planned one-offs.
            Moving money into savings goals stays liquid, so the ${S.fmt$(goalCommitted, 0)}/mo earmarked for goals is context, not an outflow.
            Amber months dip under one month of budget; red is below zero.</p>
        </section>

        <section class="card">
          <div class="card-head"><h2>Planned one-offs</h2><button class="btn sm" id="pl-add">＋ Add</button></div>
          ${S.data.planned.length ? `<ul class="acct-list">
            ${S.data.planned.slice().sort((a, b) => a.month < b.month ? -1 : 1).map(p => `
              <li class="acct-row" data-planned="${p.id}" role="button" tabindex="0">
                <div class="acct-main">
                  <span class="acct-name">${App.esc(p.name)}</span>
                  <span class="acct-meta">${S.fmtMonth(p.month)}</span>
                </div>
                <b>${S.fmt$(p.amount, 0)}</b>
              </li>`).join('')}
          </ul>` : '<p class="empty">Vacation deposit, car repair, holiday flights — add them and watch the ripple.</p>'}
        </section>

        ${whatIfBlock}
      </div>`;

    Charts.line(root.querySelector('#fc-chart'),
      fc.months.map(p => ({
        ym: p.ym, value: p.balance, tone: p.tone === 'ok' ? null : p.tone,
        tip: (p.delta >= 0 ? '+' : '−') + S.fmt$(Math.abs(p.delta), 0).slice(1) + ' this month'
          + (p.wedding ? ' · wedding ' + S.fmt$(p.wedding, 0) : '')
          + (p.planned ? ' · planned ' + S.fmt$(p.planned, 0) : '')
      })),
      { empty: 'Take a balance snapshot to start the forecast.' });

    root.querySelector('#pl-add').addEventListener('click', () => plannedModal(null));
    root.querySelectorAll('[data-planned]').forEach(li =>
      li.addEventListener('click', () => {
        const p = S.data.planned.find(x => x.id === li.dataset.planned);
        if (p) plannedModal(p);
      }));

    const wiGoalSel = root.querySelector('#wi-goal');
    if (wiGoalSel) wiGoalSel.addEventListener('change', () => {
      whatIfGoal = wiGoalSel.value; whatIfMonthly = null; App.render({ resetScroll: false });
    });
    const wiSlider = root.querySelector('#wi-slider');
    if (wiSlider) wiSlider.addEventListener('change', () => {
      whatIfGoal = goal.id; whatIfMonthly = +wiSlider.value; App.render({ resetScroll: false });
    });
    const wiApply = root.querySelector('#wi-apply');
    if (wiApply) wiApply.addEventListener('click', () => {
      goal.monthly = trial; S.save();
      whatIfMonthly = null;
      App.render({ resetScroll: false });
      App.toast(App.esc(goal.name) + ' → ' + S.fmt$(trial, 0) + '/mo');
    });
    const wiReset = root.querySelector('#wi-reset');
    if (wiReset) wiReset.addEventListener('click', () => {
      whatIfMonthly = null; App.render({ resetScroll: false });
    });
  };

  const stat = (label, value) =>
    `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

  function plannedModal(p) {
    const isNew = !p;
    const S = Store;
    const months = [];
    let ym = S.thisMonth();
    for (let i = 0; i < 18; i++) { months.push(ym); ym = S.nextMonth(ym); }
    const v = p || { name: '', month: months[1], amount: '' };
    const m = App.modal(isNew ? 'Planned expense' : 'Edit planned expense', `
      <div class="form-grid">
        <label class="span2">What<input class="input" id="pl-name" value="${App.esc(v.name)}" placeholder="e.g. Flights home for the holidays"></label>
        <label>Month<select class="select" id="pl-month">
          ${months.map(mm => `<option value="${mm}"${mm === v.month ? ' selected' : ''}>${S.fmtMonth(mm)}</option>`).join('')}
        </select></label>
        <label>Amount ($)<input class="input" type="number" step="1" min="0" id="pl-amount" value="${v.amount}"></label>
      </div>
      <div class="btn-row">
        <button class="btn gold" id="pl-save">${isNew ? 'Add' : 'Save'}</button>
        ${isNew ? '' : '<button class="btn danger ghost" id="pl-del">Delete</button>'}
      </div>`);
    const g = id => m.el.querySelector(id);
    g('#pl-save').addEventListener('click', () => {
      const name = g('#pl-name').value.trim();
      const amount = parseFloat(g('#pl-amount').value);
      if (!name) return App.toast('Name it', 'warn');
      if (isNaN(amount) || amount <= 0) return App.toast('Enter an amount', 'warn');
      const next = { id: isNew ? S.uid() : p.id, name, month: g('#pl-month').value, amount: Math.round(amount) };
      if (isNew) S.data.planned.push(next); else Object.assign(p, next);
      S.save(); m.close(); App.render(); App.toast('Saved — forecast updated');
    });
    if (!isNew) g('#pl-del').addEventListener('click', () => {
      S.data.planned = S.data.planned.filter(x => x.id !== p.id);
      S.save(); m.close(); App.render(); App.toast('Removed');
    });
  }
})();
