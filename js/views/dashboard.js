/* Dashboard — the one-stop overview, computed live.
   Every module here is a drill-down entry point into the screen that owns the
   underlying data (tap a KPI, a chart segment, a goal, a budget slice…). */
(function () {
  'use strict';
  window.Views = window.Views || {};

  let selectedMonth = null;
  let cmpBasis = 'prev'; // comparison card: 'prev' month or 'avg3'

  /* Dashboard layout is a per-device preference (which cards show, and in what
     order) — deliberately NOT part of Store's data, so it never travels in a
     JSON backup or shows up differently on the other phone than the one that
     set it. Lives in localStorage directly, same pattern as theme.js. */
  const LAYOUT_KEY = 'householdFinance.dashboardLayout';
  const CARD_LABELS = {
    insights: 'Insights', thisMonth: 'This Month', compare: 'Month Comparison',
    spendCharts: 'Spend by Category & Person', trend: 'Monthly Spend Trend',
    goalsWho: 'Goals & Who Pays What'
  };
  const DEFAULT_LAYOUT = Object.keys(CARD_LABELS).map(id => ({ id, hidden: false }));
  function loadLayout() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LAYOUT_KEY)); } catch (e) { /* ignore */ }
    if (!Array.isArray(saved)) return DEFAULT_LAYOUT.map(c => Object.assign({}, c));
    const known = new Set(Object.keys(CARD_LABELS));
    const kept = saved.filter(c => c && known.has(c.id));
    const have = new Set(kept.map(c => c.id));
    Object.keys(CARD_LABELS).forEach(id => { if (!have.has(id)) kept.push({ id, hidden: false }); });
    return kept;
  }
  function saveLayout(layout) {
    try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (e) { /* private mode — resets each open */ }
  }

  Views.home = function (root) {
    const S = Store;
    const month = selectedMonth || S.thisMonth();
    const isCurrent = month === S.thisMonth();
    const sts = S.safeToSpend(month);
    const pace = S.monthPace(month);
    const budget = S.budgetTotal();
    const income = S.incomeTotal();
    const surplus = S.surplus();
    const rate = S.savingsRate();
    const houseGoal = S.data.goals.find(g => g.isHouse);
    const housePct = houseGoal && houseGoal.target > 0 ? houseGoal.saved / houseGoal.target : 0;
    const wedding = S.weddingRemaining();
    const months = S.monthsWithData();
    const spent = S.txInMonth(month).reduce((s, t) => s + (+t.amount || 0), 0);
    const progress = S.goalsProgress();
    const insights = S.insights();

    const layout = loadLayout();
    const cards = {
      insights: () => insightsSection(insights),
      thisMonth: () => `
        <section class="card glance">
          <div class="card-head">
            <h2>This Month</h2>
            <select id="dash-month" class="select" aria-label="Month">
              ${months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${S.fmtMonth(m)}</option>`).join('')}
            </select>
          </div>
          <div class="month-strip">
            <div><span class="ms-label">Spent</span><span class="ms-value">${S.fmt$(spent)}</span></div>
            <div><span class="ms-label">Budget</span><span class="ms-value">${S.fmt$(budget, 0)}</span></div>
            <div><span class="ms-label">${spent > budget ? 'Over by' : 'Left'}</span>
              <span class="ms-value ${spent > budget ? 'neg' : 'pos'}">${S.fmt$(Math.abs(budget - spent))}</span></div>
          </div>
          <div class="meter" role="img" aria-label="Spent ${S.fmt$(spent)} of ${S.fmt$(budget, 0)} budget${isCurrent ? `, ${Math.round(pace * 100)}% through the month` : ''}">
            <div class="meter-fill${spent > budget ? ' over' : ''}" style="width:${budget > 0 ? Math.min(100, spent / budget * 100) : 0}%"></div>
            ${isCurrent && budget > 0 ? `<div class="meter-pace" style="left:${(pace * 100).toFixed(1)}%" title="Where today sits in the month"></div>` : ''}
          </div>
          ${isCurrent && budget > 0 ? `<p class="pace-note${spent > budget * pace * 1.1 ? ' ahead' : ''}">${
            spent > budget ? 'Over budget for the month.'
            : spent > budget * pace * 1.1 ? `Ahead of pace — ${S.fmt$(spent, 0)} spent vs ${S.fmt$(budget * pace, 0)} expected by today.`
            : `On pace — ${S.fmt$(budget * pace, 0)} expected by today.`}</p>` : ''}
          <div class="card-foot"><a class="card-link" href="#/transactions?month=${month}">View month's transactions →</a></div>
        </section>`,
      compare: () => compareSection(month),
      spendCharts: () => `
        <div class="two-col">
          <section class="card">
            <div class="card-head"><h2>Spend by Category</h2><span class="card-note">tap a category · tick = budget</span></div>
            <div id="chart-cats"></div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Spend by Person</h2><span class="card-note">tap to filter</span></div>
            <div id="chart-who"></div>
          </section>
        </div>`,
      trend: () => `
        <section class="card">
          <div class="card-head"><h2>Monthly Spend Trend</h2><span class="card-note">tap a month to jump the dashboard there</span></div>
          <div id="chart-trend"></div>
        </section>`,
      goalsWho: () => `
        <div class="two-col">
          <section class="card">
            <div class="card-head"><h2>Goals at a Glance</h2><a class="card-link" href="#/goals">All goals →</a></div>
            <div class="mini-goals">${miniGoals()}</div>
          </section>
          <section class="card">
            <div class="card-head"><h2>Who Pays What (Budget)</h2><a class="card-link" href="#/budget">Budget →</a></div>
            ${whoPays()}
          </section>
        </div>`
    };

    root.innerHTML = `
      <div class="page">
        ${App.exportBanner()}
        <section class="hero card-navy">
          <div class="hero-head">
            <div>
              <h1>Household Finance</h1>
              <p class="hero-sub">Household command center · ${S.fmtMonth(month)}</p>
            </div>
            <a class="hero-progress" href="#/goals" aria-label="Overall progress across all goals">
              <div class="hero-progress-ring ring-on-navy" id="ring-overall"></div>
              <div class="hero-progress-text">
                <div class="hero-progress-label">Overall Progress</div>
                <div class="hero-progress-sub">${S.fmt$(progress.saved, 0)} of ${S.fmt$(progress.target, 0)} saved</div>
              </div>
            </a>
          </div>
          ${isCurrent ? `
          <a class="sts${sts.safe < 0 ? ' neg' : ''}" href="#/transactions?month=${month}">
            <div class="sts-label">Safe to spend · rest of ${S.fmtMonth(month)}</div>
            <div class="sts-value">${S.fmt$(sts.safe, 0)}</div>
            <div class="sts-sub">${S.fmt$(sts.spent, 0)} spent so far${sts.upcomingCount
              ? ` · ${S.fmt$(sts.upcoming, 0)} reserved for ${sts.upcomingCount} upcoming bill${sts.upcomingCount === 1 ? '' : 's'}` : ''}</div>
          </a>` : ''}
          <div class="kpi-grid">
            ${kpi('Monthly Budget', S.fmt$(budget, 0), 'recurring plan', null, '#/budget')}
            ${kpi('Combined Income', S.fmt$(income, 0), 'take-home / mo', null, '#/budget')}
            ${kpi('Monthly Surplus', S.fmt$(surplus, 0), 'income − budget', surplus < 0 ? 'bad' : 'gold', '#/budget')}
            ${kpi('Savings Rate', S.fmtPct(rate), 'of take-home', rate < 0 ? 'bad' : '', '#/budget')}
            ${kpi('House Fund', S.fmtPct(housePct, 0), S.fmt$(houseGoal ? houseGoal.saved : 0, 0) + ' of ' + S.fmt$(houseGoal ? houseGoal.target : 0, 0), null, '#/house')}
            ${kpi('Wedding Left', S.fmt$(wedding, 0), 'through ' + S.fmtDate(S.data.wedding.date), null, '#/wedding')}
          </div>
        </section>

        <div class="btn-row" style="justify-content:flex-end;margin:0">
          <button class="btn ghost sm" id="dash-customize">⚙ Customize</button>
        </div>

        ${layout.filter(c => !c.hidden).map(c => cards[c.id] ? cards[c.id]() : '').join('')}
      </div>`;

    root.querySelector('#dash-customize').addEventListener('click', () => customizeModal());
    const dashMonth = root.querySelector('#dash-month');
    if (dashMonth) dashMonth.addEventListener('change', e => {
      selectedMonth = e.target.value; App.render();
    });
    root.querySelectorAll('[data-review]').forEach(btn =>
      btn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        Store.markSubscriptionReviewed(btn.dataset.review);
        App.render(); App.toast('Marked reviewed');
      }));
    const cmpSel = root.querySelector('#cmp-basis');
    if (cmpSel) cmpSel.addEventListener('change', e => { cmpBasis = e.target.value; App.render(); });
    root.querySelectorAll('[data-cmp-cat]').forEach(tr =>
      tr.addEventListener('click', () => App.go('transactions', { month, category: tr.dataset.cmpCat })));

    // charts — only wire up whichever chart containers are actually on the page
    const budgetMap = S.budgetByCategory();
    const spendMap = S.spendByCategory(month);
    const items = S.CATEGORIES
      .map(c => ({ label: c, value: spendMap[c] || 0, budget: budgetMap[c] || 0 }))
      .filter(i => i.value > 0)
      .sort((a, b) => b.value - a.value);
    const chartCats = root.querySelector('#chart-cats');
    if (chartCats) Charts.categoryBars(chartCats, items,
      it => App.go('transactions', { month, category: it.label }),
      isCurrent ? pace : null);
    const chartWho = root.querySelector('#chart-who');
    if (chartWho) Charts.whoDonut(chartWho, S.spendByWho(month), false,
      who => App.go('transactions', { month, who }));

    const chartTrend = root.querySelector('#chart-trend');
    if (chartTrend) {
      const trendMonths = months.slice(-12);
      Charts.trendColumns(chartTrend, trendMonths,
        trendMonths.map(m => S.txInMonth(m).reduce((s, t) => s + (+t.amount || 0), 0)), budget,
        ym => { selectedMonth = ym; App.render(); });
    }

    Charts.ring(root.querySelector('#ring-overall'), progress.pct, S.fmtPct(progress.pct, 0), 'saved', '#FFC000');

    root.querySelectorAll('[data-who-row]').forEach(row => row.addEventListener('click', () => {
      App.go('budget', { section: row.dataset.whoRow });
    }));
  };

  function kpi(label, value, sub, tone, href) {
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi${tone ? ' ' + tone : ''}${href ? ' kpi-link' : ''}"${href ? ` href="${href}"` : ''}>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub}</div>
    </${tag}>`;
  }

  function insightsSection(insights) {
    if (!insights.length) {
      return `<section class="card insights-card glance">
        <div class="card-head"><h2>Insights</h2></div>
        <div class="insight-item tone-good"><span class="insight-dot" aria-hidden="true"></span>
          <span class="insight-text">Nothing needs your attention right now — everything's on track.</span></div>
      </section>`;
    }
    return `<section class="card insights-card glance">
      <div class="card-head"><h2>Insights</h2></div>
      <ul class="insight-list">
        ${insights.map(i => `<li class="insight-item tone-${i.tone}">
          <a class="insight-row" href="${i.href}">
            <span class="insight-dot" aria-hidden="true"></span>
            <span class="insight-text">${App.esc(i.text)}</span>
            <span class="insight-arrow" aria-hidden="true">›</span>
          </a>
          ${i.reviewKey ? `<button class="btn ghost sm insight-action" data-review="${App.esc(i.reviewKey)}">Mark reviewed</button>` : ''}
        </li>`).join('')}
      </ul>
    </section>`;
  }

  function miniGoals() {
    return Store.data.goals.slice(0, 4).map(g => {
      const m = Store.goalMeta(g);
      return `<a class="mini-goal" href="#/goals">
        <div class="mini-goal-bar"><div style="width:${(m.pct * 100).toFixed(1)}%"></div></div>
        <div class="mini-goal-row">
          <span>${App.esc(g.name)}</span>
          <b>${Store.fmt$(g.saved, 0)} / ${Store.fmt$(g.target, 0)}</b>
        </div>
      </a>`;
    }).join('');
  }

  /* Side-by-side: this month's categories vs last month or the 3-month average. */
  function compareSection(month) {
    const S = Store;
    const prior = S.monthsWithData().filter(m => m < month);
    if (!prior.length) return '';
    const cur = S.spendByCategory(month);
    let basisMap, basisLabel;
    if (cmpBasis === 'avg3') {
      const a = S.avgSpendByCategory(month, 3);
      basisMap = a.map;
      basisLabel = a.months > 1 ? a.months + '-mo avg' : S.fmtMonth(prior[prior.length - 1]);
    } else {
      basisMap = S.spendByCategory(prior[prior.length - 1]);
      basisLabel = S.fmtMonth(prior[prior.length - 1]);
    }
    const rows = S.CATEGORIES
      .map(c => ({ c, now: cur[c] || 0, then: basisMap[c] || 0 }))
      .filter(r => r.now > 0 || r.then > 0)
      .map(r => ({ ...r, d: r.now - r.then }))
      .sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
    if (!rows.length) return '';
    const top = rows.slice(0, 8);
    const tot = rows.reduce((s, r) => ({ now: s.now + r.now, then: s.then + r.then }), { now: 0, then: 0 });
    const delta = v => v === 0 ? '<span class="muted">—</span>'
      : `<span class="${v > 0 ? 'neg' : 'pos'}">${v > 0 ? '+' : '−'}${S.fmt$(Math.abs(v), 0)}</span>`;
    const isCurrent = month === S.thisMonth();
    return `<section class="card">
      <div class="card-head"><h2>${S.fmtMonth(month)}${isCurrent ? ' so far' : ''} vs</h2>
        <select class="select" id="cmp-basis" aria-label="Comparison basis">
          <option value="prev"${cmpBasis === 'prev' ? ' selected' : ''}>Last month</option>
          <option value="avg3"${cmpBasis === 'avg3' ? ' selected' : ''}>3-month average</option>
        </select>
      </div>
      <div class="table-scroll"><table class="table plain cmp-table">
        <thead><tr><th>Category</th><th class="num">${isCurrent ? 'This month' : S.fmtMonth(month)}</th><th class="num">${App.esc(basisLabel)}</th><th class="num">Δ</th></tr></thead>
        <tbody>${top.map(r => `
          <tr class="row-clickable" data-cmp-cat="${App.esc(r.c)}">
            <td>${App.esc(r.c)}</td>
            <td class="num">${S.fmt$(r.now, 0)}</td>
            <td class="num">${S.fmt$(r.then, 0)}</td>
            <td class="num">${delta(r.d)}</td>
          </tr>`).join('')}
        </tbody>
        <tfoot><tr><td>Total${rows.length > top.length ? ' (all categories)' : ''}</td>
          <td class="num">${S.fmt$(tot.now, 0)}</td>
          <td class="num">${S.fmt$(tot.then, 0)}</td>
          <td class="num">${delta(tot.now - tot.then)}</td></tr></tfoot>
      </table></div>
      ${isCurrent ? '<p class="help">This month is in progress — deltas compare month-to-date against the full comparison period.</p>' : ''}
    </section>`;
  }

  function whoPays() {
    const p = Store.budgetByPerson();
    const total = Store.budgetTotal() || 1;
    const rows = [['Shared', p.section.Shared]].concat(p.members.map(n => [n, p.section[n] || 0]));
    return `<table class="table plain">
      <thead><tr><th>Slice</th><th class="num">Monthly</th><th class="num">% of budget</th></tr></thead>
      <tbody>${rows.map(([who, v]) => `
        <tr class="row-clickable" data-who-row="${App.esc(who)}"><td><span class="swatch" style="background:${Charts.whoColor(who)}"></span>${App.esc(who)}${who !== 'Shared' ? ' (personal)' : ''}</td>
        <td class="num">${Store.fmt$(v, 0)}</td><td class="num">${Store.fmtPct(v / total, 0)}</td></tr>`).join('')}
      </tbody>
      <tfoot><tr><td>With shared split evenly</td>
        <td class="num" colspan="2">${p.members.map(n => `${App.esc(n)} ${Store.fmt$(p.attributed[n], 0)}`).join(' · ') || '—'}</td></tr></tfoot>
    </table>`;
  }

  /* Reorder/show/hide dashboard cards for this device only. The list re-renders
     in place on every change so up/down/hide feels immediate without closing
     and reopening the modal. */
  function customizeModal() {
    let layout = loadLayout();
    const m = App.modal('Customize dashboard', `
      <p class="help">Choose what shows here, and in what order. This phone only — the other one keeps its own layout.</p>
      <ul class="layout-list" id="layout-list"></ul>
      <div class="btn-row">
        <button class="btn gold" id="layout-done">Done</button>
        <button class="btn ghost" id="layout-reset">Reset to default</button>
      </div>`);
    const list = m.el.querySelector('#layout-list');
    const redraw = () => {
      list.innerHTML = layout.map((c, i) => `
        <li class="layout-row" data-id="${c.id}">
          <label class="checkline"><input type="checkbox" data-vis="${c.id}"${c.hidden ? '' : ' checked'}> ${CARD_LABELS[c.id]}</label>
          <div class="btn-row" style="margin:0">
            <button class="icon-btn" data-up="${c.id}" aria-label="Move ${CARD_LABELS[c.id]} up"${i === 0 ? ' disabled' : ''}>↑</button>
            <button class="icon-btn" data-down="${c.id}" aria-label="Move ${CARD_LABELS[c.id]} down"${i === layout.length - 1 ? ' disabled' : ''}>↓</button>
          </div>
        </li>`).join('');
      list.querySelectorAll('[data-vis]').forEach(cb => cb.addEventListener('change', () => {
        const c = layout.find(x => x.id === cb.dataset.vis);
        if (c) { c.hidden = !cb.checked; saveLayout(layout); }
      }));
      list.querySelectorAll('[data-up]').forEach(btn => btn.addEventListener('click', () => {
        const i = layout.findIndex(x => x.id === btn.dataset.up);
        if (i > 0) { [layout[i - 1], layout[i]] = [layout[i], layout[i - 1]]; saveLayout(layout); redraw(); }
      }));
      list.querySelectorAll('[data-down]').forEach(btn => btn.addEventListener('click', () => {
        const i = layout.findIndex(x => x.id === btn.dataset.down);
        if (i < layout.length - 1) { [layout[i + 1], layout[i]] = [layout[i], layout[i + 1]]; saveLayout(layout); redraw(); }
      }));
    };
    redraw();
    m.el.querySelector('#layout-reset').addEventListener('click', () => {
      layout = DEFAULT_LAYOUT.map(c => Object.assign({}, c));
      saveLayout(layout); redraw();
    });
    m.el.querySelector('#layout-done').addEventListener('click', () => { m.close(); App.render(); });
  }
})();
