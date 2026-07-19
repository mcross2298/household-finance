/* Plan hub — mobile landing for the planning sections. */
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

    const tile = (href, icon, title, line1, line2) => `
      <a class="card plan-tile" href="${href}">
        <div class="plan-ico" aria-hidden="true">${icon}</div>
        <div class="plan-body">
          <h2>${title}</h2>
          <div class="plan-line">${line1}</div>
          ${line2 ? `<div class="plan-sub">${line2}</div>` : ''}
        </div>
        <div class="plan-arrow" aria-hidden="true">›</div>
      </a>`;

    root.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>Plan</h1></div>
        <div class="plan-grid">
          ${tile('#/budget', Icons.grid, 'Budget',
            S.fmt$(S.budgetTotal(), 0) + '/mo · surplus ' + S.fmt$(S.surplus(), 0),
            'Recurring expenses & income')}
          ${tile('#/calendar', Icons.calendar, 'Bill Calendar', calLine(), 'Due dates, reminders & month-end close')}
          ${tile('#/goals', Icons.target, 'Savings Goals',
            S.fmt$(saved, 0) + ' saved of ' + S.fmt$(target, 0),
            goals.length + ' goals')}
          ${tile('#/house', Icons.house, 'House Plan',
            houseGoal ? S.fmt$(houseGoal.saved, 0) + ' toward down payment' : 'Set a house goal',
            scA ? 'Scenario A PITI ' + S.fmt$(scA.piti, 0) + '/mo' : '')}
          ${tile('#/invest', Icons.trend, 'Investments',
            rothLine ? 'Roth: ' + rothLine : 'Add a member to track Roth',
            'HYSA deposit ' + S.fmt$(S.data.invest.hysa.deposit, 0) + '/mo')}
          ${tile('#/networth', Icons.bank, 'Net Worth', nwLine(), 'Accounts, snapshots & debt payoff')}
          ${tile('#/debt', Icons.debt, 'Debt Payoff Plan', debtLine(), 'Conservative / Base / Aggressive strategies')}
          ${tile('#/forecast', Icons.trend, 'Forecast', fcLine(), '12-month cash-flow projection')}
          ${tile('#/wedding', Icons.sparkle, 'Wedding Payoff',
            wedding > 0 ? S.fmt$(wedding, 0) + ' remaining' : 'All settled 🎉',
            'through ' + S.fmtDate(S.data.wedding.date))}
        </div>
      </div>`;
  };
})();
