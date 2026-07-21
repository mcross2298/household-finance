/* Plan hub — mobile landing for the planning sections. Tiles are generated
   from the Features registry (js/features.js) so titles, icons and which
   screens exist stay single-sourced with the Executive Summary and Quick Tour.
   STATUS below owns the two live data lines per tile — and, by having an entry
   for a route, declares that route belongs on the Plan hub. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.plan = function (root) {
    const S = Store;
    const goals = S.data.goals;
    const saved = goals.reduce((s, g) => s + (+g.saved || 0), 0);
    const target = goals.reduce((s, g) => s + (+g.target || 0), 0);
    const houseGoal = goals.find(g => g.isHouse);
    const scA = S.data.house.scenarios[0] ? S.houseScenario(S.data.house.scenarios[0]) : null;
    const rothLine = S.members().map(n => App.esc(n) + ' ' + S.fmt$(S.rothMeta(n).ytd, 0)).join(' · ');
    const wedding = S.weddingRemaining();

    const calLine = () => {
      const sched = S.monthSchedule(S.thisMonth());
      const soon = sched.filter(i => i.status === 'soon');
      const overdue = sched.filter(i => i.status === 'overdue');
      if (overdue.length) return overdue.length + ' overdue';
      if (soon.length) return soon.length + ' due this week · ' + S.fmt$(soon.reduce((s, i) => s + i.amount, 0), 0);
      return sched.filter(i => i.posted).length + ' of ' + sched.length + ' posted this month';
    };
    const nwLine = () => {
      const series = S.netWorthSeries();
      if (!series.length) return 'Take your first balance snapshot';
      const last = series[series.length - 1];
      return S.fmt$(last.net, 0) + ' · ' + S.fmtMonth(last.ym);
    };
    const debtLine = () => {
      const owed = S.data.accounts.filter(a => a.kind === 'debt' && (S.latestBalance(a.id) || 0) > 0);
      if (!owed.length) return 'All paid off 🎉';
      const conservative = S.debtStrategiesSummary()[0];
      return owed.length + ' debt' + (owed.length > 1 ? 's' : '') +
        (conservative.months != null ? ' · ' + conservative.months + ' mo at current payments' : '');
    };
    const fcLine = () => {
      if (!Object.keys(S.data.snapshots).length) return 'Needs a balance snapshot';
      const fc = S.forecast(12);
      const bad = fc.months.find(m => m.tone === 'bad');
      const warn = fc.months.find(m => m.tone === 'warn');
      return bad ? 'Negative in ' + S.fmtMonth(bad.ym)
        : warn ? 'Tight in ' + S.fmtMonth(warn.ym)
        : '12 months clear · ' + S.fmt$(fc.months[fc.months.length - 1].balance, 0) + ' projected';
    };

    /* route → [line1, line2]. An entry here also opts the route onto the hub. */
    const STATUS = {
      budget: () => [S.fmt$(S.budgetTotal(), 0) + '/mo · surplus ' + S.fmt$(S.surplus(), 0), 'Recurring expenses & income'],
      calendar: () => [calLine(), 'Due dates, reminders & month-end close'],
      goals: () => [S.fmt$(saved, 0) + ' saved of ' + S.fmt$(target, 0), goals.length + ' goals'],
      house: () => [houseGoal ? S.fmt$(houseGoal.saved, 0) + ' toward down payment' : 'Set a house goal',
        scA ? 'Scenario A PITI ' + S.fmt$(scA.piti, 0) + '/mo' : ''],
      invest: () => [rothLine ? 'Roth: ' + rothLine : 'Add a member to track Roth',
        'HYSA deposit ' + S.fmt$(S.data.invest.hysa.deposit, 0) + '/mo'],
      networth: () => [nwLine(), 'Accounts, snapshots & debt payoff'],
      debt: () => [debtLine(), 'Conservative / Base / Aggressive strategies'],
      forecast: () => [fcLine(), '12-month cash-flow projection'],
      wedding: () => [wedding > 0 ? S.fmt$(wedding, 0) + ' remaining' : 'All settled 🎉', 'through ' + S.fmtDate(S.data.wedding.date)]
    };

    const tile = (href, icon, title, line1, line2) => `
      <a class="card plan-tile" href="${href}">
        <div class="plan-ico" aria-hidden="true">${icon}</div>
        <div class="plan-body">
          <h2>${App.esc(title)}</h2>
          <div class="plan-line">${line1}</div>
          ${line2 ? `<div class="plan-sub">${line2}</div>` : ''}
        </div>
        <div class="plan-arrow" aria-hidden="true">›</div>
      </a>`;

    const tiles = (window.Features || [])
      .filter(f => STATUS[f.route])
      .map(f => {
        const [line1, line2] = STATUS[f.route]();
        return tile('#/' + f.route, (window.Icons && Icons[f.icon]) || '', f.title, line1, line2);
      }).join('');

    root.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>Plan</h1></div>
        <div class="plan-grid">${tiles}</div>
      </div>`;
  };
})();
