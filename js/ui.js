/* Shared view kit — the small markup helpers every screen was declaring for
   itself. `stat` alone existed in seven view files with three mutually
   incompatible signatures, which is how the same "this figure is bad" state
   ended up expressed two different ways with a CSS rule for each. Same move
   the store layer already made: one definition, many callers. */
(function () {
  'use strict';

  const tone = t => (t ? ' ' + t : '');

  /* Figure in a navy stat band. `t` is '', 'gold' or 'bad' and always lands on
     the wrapper — never on .stat-value, which was calendar.js's variant. */
  const stat = (label, value, t) =>
    `<div class="stat${tone(t)}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

  /* Hero KPI. With `href` the whole tile becomes a drill-down target. */
  const kpi = (label, value, sub, t, href) => {
    const tag = href ? 'a' : 'div';
    return `<${tag} class="kpi${tone(t)}${href ? ' kpi-link' : ''}"${href ? ` href="${href}"` : ''}>
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-sub">${sub}</div>
    </${tag}>`;
  };

  /* Signed money delta. Spending more than the basis is bad, so positive is
     the negative tone — the inversion is deliberate, not a slip. */
  const delta = v => v === 0
    ? '<span class="muted">—</span>'
    : `<span class="${v > 0 ? 'neg' : 'pos'}">${v > 0 ? '+' : '−'}${Store.fmt$(Math.abs(v), 0)}</span>`;

  /* Label/value row inside a scenario card (House Plan, Debt Payoff). */
  const scRow = (label, value, cls) =>
    `<div class="sc-row${cls ? ' ' + cls : ''}"><span>${label}</span><b>${value}</b></div>`;

  /* Every empty state says what's missing and what to do about it. */
  const empty = (message, action) =>
    `<p class="empty">${message}${action ? ' ' + action : ''}</p>`;

  const miniGoals = (goals, limit) =>
    goals.slice(0, limit || 4).map(g => {
      const m = Store.goalMeta(g);
      return `<a class="mini-goal" href="#/goals">
        <div class="mini-goal-bar"><div style="width:${(m.pct * 100).toFixed(1)}%"></div></div>
        <div class="mini-goal-row">
          <span>${App.esc(g.name)}</span>
          <b>${Store.fmt$(g.saved, 0)} / ${Store.fmt$(g.target, 0)}</b>
        </div>
      </a>`;
    }).join('');

  const ALL_CLEAR = "Nothing needs your attention right now — everything's on track.";

  /* `withActions` is what the Dashboard passes to get the "Mark reviewed"
     button; the Executive Summary renders the same feed read-only. The two
     had drifted apart as separate copies. */
  const insightList = (insights, withActions) => {
    if (!insights.length) {
      return `<div class="insight-item tone-good"><span class="insight-dot" aria-hidden="true"></span>
        <span class="insight-text">${ALL_CLEAR}</span></div>`;
    }
    return `<ul class="insight-list">
      ${insights.map(i => `<li class="insight-item tone-${i.tone}">
        <a class="insight-row" href="${i.href}">
          <span class="insight-dot" aria-hidden="true"></span>
          <span class="insight-text">${App.esc(i.text)}</span>
          <span class="insight-arrow" aria-hidden="true">›</span>
        </a>
        ${withActions && i.reviewKey ? `<button class="btn ghost sm insight-action" data-review="${App.esc(i.reviewKey)}">Mark reviewed</button>` : ''}
      </li>`).join('')}
    </ul>`;
  };

  window.UI = { stat, kpi, delta, scRow, empty, miniGoals, insightList };
})();
