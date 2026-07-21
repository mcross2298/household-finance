/* Executive Summary — a one-page financial snapshot, a jump-off point to
   every planning screen, and a tour of what the app itself can do. Three
   jobs, one screen: the numbers section answers "where do we stand right
   now"; the Plan section (folded in from the former standalone Plan hub —
   see CLAUDE.md) answers "where do I go to work on X"; the features section
   (rendered from Features in js/features.js) answers "what can this app do"
   — handy to skim before a budget conversation, or to hand to someone new to
   the app. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.summary = function (root) {
    const S = Store;
    const month = S.thisMonth();
    const snap = S.householdSnapshot(month);
    const sum = snap.summary;
    const sts = snap.safeToSpend;
    const surplus = snap.surplus;
    const rate = snap.savingsRate;
    const progress = snap.goals;
    const nwLatest = snap.netWorth.latest;
    const nwPrev = snap.netWorth.prev;
    const insights = snap.insights;
    const wedding = snap.wedding.remaining;
    const debtCount = snap.debt.accounts;
    const debtTotal = snap.debt.total;
    const planTiles = renderPlanTiles(S);

    root.innerHTML = `
      <div class="page summary-page">
        <div class="page-head no-print">
          <div>
            <h1>Executive Summary</h1>
            <p class="page-sub">Where things stand right now, and what this app can do.</p>
          </div>
          <button class="btn ghost sm" id="summary-print">🖨 Print</button>
        </div>

        <section class="card card-navy summary-hero">
          <div class="report-kicker">Financial health · ${S.fmtMonth(month)}</div>
          <div class="kpi-grid">
            ${kpi('Net Worth', nwLatest ? S.fmt$(nwLatest.net, 0) : '—',
              nwLatest && nwPrev ? (nwLatest.net >= nwPrev.net ? '+' : '−') + S.fmt$(Math.abs(nwLatest.net - nwPrev.net), 0) + ' vs last snapshot'
                : nwLatest ? 'as of ' + S.fmtMonth(nwLatest.ym) : 'no balance snapshots yet',
              null, '#/networth')}
            ${kpi('Monthly Surplus', S.fmt$(surplus, 0), 'income − budget', surplus < 0 ? 'bad' : 'gold', '#/budget')}
            ${kpi('Savings Rate', S.fmtPct(rate), 'of take-home', rate < 0 ? 'bad' : '', '#/budget')}
            ${kpi('Safe to Spend', S.fmt$(sts.safe, 0), 'rest of ' + S.fmtMonth(month), sts.safe < 0 ? 'bad' : '', `#/transactions?month=${month}`)}
          </div>
        </section>

        <section class="summary-plan">
          <h2>Plan</h2>
          <div class="plan-grid">${planTiles}</div>
        </section>

        <div class="two-col">
          <section class="card">
            <div class="card-head"><h2>This month</h2><span class="card-note">${S.fmt$(sum.spent, 0)} of ${S.fmt$(sum.budget, 0)} budget</span></div>
            <div class="meter" role="img" aria-label="Spent ${S.fmt$(sum.spent)} of ${S.fmt$(sum.budget, 0)} budget">
              <div class="meter-fill${sum.spent > sum.budget ? ' over' : ''}" style="width:${sum.budget > 0 ? Math.min(100, sum.spent / sum.budget * 100) : 0}%"></div>
            </div>
            <table class="table plain"><tbody>
              ${sum.topCats.length ? sum.topCats.map(([c, v]) => `<tr><td>${App.esc(c)}</td><td class="num">${S.fmt$(v, 0)}</td></tr>`).join('')
                : '<tr><td class="muted" colspan="2">No spending yet this month.</td></tr>'}
            </tbody></table>
          </section>
          <section class="card">
            <div class="card-head"><h2>Goals</h2><span class="card-note">${S.fmtPct(progress.pct, 0)} funded overall</span></div>
            <div class="mini-goals">${S.data.goals.slice(0, 4).map(g => {
              const m = S.goalMeta(g);
              return `<a class="mini-goal" href="#/goals">
                <div class="mini-goal-bar"><div style="width:${(m.pct * 100).toFixed(1)}%"></div></div>
                <div class="mini-goal-row"><span>${App.esc(g.name)}</span><b>${S.fmt$(g.saved, 0)} / ${S.fmt$(g.target, 0)}</b></div>
              </a>`;
            }).join('') || '<p class="empty">No goals set up yet.</p>'}</div>
          </section>
        </div>

        <section class="card ${insights.length ? 'insights-card' : ''}">
          <div class="card-head"><h2>What needs attention</h2></div>
          ${insights.length ? `<ul class="insight-list">
            ${insights.map(i => `<li class="insight-item tone-${i.tone}">
              <a class="insight-row" href="${i.href}">
                <span class="insight-dot" aria-hidden="true"></span>
                <span class="insight-text">${App.esc(i.text)}</span>
                <span class="insight-arrow" aria-hidden="true">›</span>
              </a>
            </li>`).join('')}
          </ul>` : `<div class="insight-item tone-good"><span class="insight-dot" aria-hidden="true"></span>
            <span class="insight-text">Nothing needs your attention right now — everything's on track.</span></div>`}
        </section>

        <div class="two-col">
          <section class="card">
            <div class="card-head"><h2>Debt</h2></div>
            ${debtCount ? `<table class="table plain"><tbody>
              <tr><td>Total balance</td><td class="num">${S.fmt$(debtTotal, 0)}</td></tr>
              <tr><td>Open accounts</td><td class="num">${debtCount}</td></tr>
            </tbody></table><div class="card-foot"><a class="card-link" href="#/debt">Payoff plan →</a></div>`
              : '<p class="empty">No debt accounts on file.</p>'}
          </section>
          <section class="card">
            <div class="card-head"><h2>Wedding</h2></div>
            ${S.data.wedding.vendors.length ? `<table class="table plain"><tbody>
              <tr><td>Remaining</td><td class="num">${S.fmt$(wedding, 0)}</td></tr>
              <tr><td>Date</td><td class="num">${S.fmtDate(S.data.wedding.date)}</td></tr>
            </tbody></table><div class="card-foot"><a class="card-link" href="#/wedding">Wedding payoff →</a></div>`
              : '<p class="empty">No wedding budget set up yet.</p>'}
          </section>
        </div>

        <section class="card summary-features">
          <div class="card-head">
            <h2>What this app can do</h2>
            <button class="btn ghost sm no-print" id="summary-tour">🧭 Take the Quick Tour</button>
          </div>
          <div class="feature-grid">
            ${(window.Features || []).filter(f => f.id !== 'summary').map(f => `
              <a class="feature-card" href="#/${f.route}">
                <div class="feature-ico" aria-hidden="true">${(window.Icons && Icons[f.icon]) || ''}</div>
                <div>
                  <div class="feature-title">${App.esc(f.title)}</div>
                  <div class="feature-blurb">${App.esc(f.blurb)}</div>
                </div>
              </a>`).join('')}
          </div>
        </section>

        <p class="help report-foot no-print">Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          · Household Finance · data lives on-device only.</p>
      </div>`;

    root.querySelector('#summary-print').addEventListener('click', () => window.print());
    const tourBtn = root.querySelector('#summary-tour');
    if (tourBtn) tourBtn.addEventListener('click', () => { if (window.Tour) Tour.open(0); });
  };

  function kpi(label, value, sub, tone, href) {
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi${tone ? ' ' + tone : ''}${href ? ' kpi-link' : ''}"${href ? ` href="${href}"` : ''}>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub}</div>
    </${tag}>`;
  }

  /* Ported from the former standalone Plan hub (js/views/plan.js, removed —
     see CLAUDE.md). Tiles are generated from the Features registry so titles,
     icons and which screens exist stay single-sourced with the Quick Tour and
     the features grid below. STATUS owns the two live data lines per tile —
     and, by having an entry for a route, declares that route belongs here. */
  function renderPlanTiles(S) {
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
          <h3>${App.esc(title)}</h3>
          <div class="plan-line">${line1}</div>
          ${line2 ? `<div class="plan-sub">${line2}</div>` : ''}
        </div>
        <div class="plan-arrow" aria-hidden="true">›</div>
      </a>`;

    return (window.Features || [])
      .filter(f => STATUS[f.route])
      .map(f => {
        const [line1, line2] = STATUS[f.route]();
        return tile('#/' + f.route, (window.Icons && Icons[f.icon]) || '', f.title, line1, line2);
      }).join('');
  }
})();
