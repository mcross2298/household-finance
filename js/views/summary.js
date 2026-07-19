/* Executive Summary — a one-page financial snapshot plus a tour of what the
   app itself can do. Two audiences, one screen: the numbers section answers
   "where do we stand right now"; the features section (rendered from
   Features in js/features.js) answers "what can this app do" — handy to skim
   before a budget conversation, or to hand to someone new to the app. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.summary = function (root) {
    const S = Store;
    const month = S.thisMonth();
    const sum = S.monthSummary(month);
    const sts = S.safeToSpend(month);
    const surplus = S.surplus();
    const rate = S.savingsRate();
    const progress = S.goalsProgress();
    const nw = S.netWorthSeries();
    const nwLatest = nw.length ? nw[nw.length - 1] : null;
    const nwPrev = nw.length > 1 ? nw[nw.length - 2] : null;
    const insights = S.insights();
    const wedding = S.weddingRemaining();
    const debts = S.data.accounts.filter(a => a.kind === 'debt');
    const debtTotal = debts.reduce((s, a) => s + (S.latestBalance(a.id) || 0), 0);

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
            ${debts.length ? `<table class="table plain"><tbody>
              <tr><td>Total balance</td><td class="num">${S.fmt$(debtTotal, 0)}</td></tr>
              <tr><td>Open accounts</td><td class="num">${debts.length}</td></tr>
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
})();
