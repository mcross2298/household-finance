/* House Plan — interactive affordability model, three scenarios side by side. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  Views.house = function (root) {
    const S = Store;
    const h = S.data.house;
    const houseGoal = S.data.goals.find(g => g.isHouse) || { saved: 0, monthly: 0 };

    const assumption = (label, id, value, step, suffix, note) => `
      <label class="assume">
        <span>${label}${note ? ` <span class="assume-note">${note}</span>` : ''}</span>
        <span class="assume-input"><input class="input" type="number" step="${step}" id="${id}" value="${value}">${suffix ? `<em>${suffix}</em>` : ''}</span>
      </label>`;

    root.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>House Plan</h1></div>
        <p class="page-sub">Target window: <b>${S.fmtDate(h.targetDate)}</b> — 1–2 years post-wedding. Adjust any assumption and every scenario recalculates.</p>

        <section class="card">
          <div class="card-head"><h2>Assumptions</h2></div>
          <div class="assume-grid">
            ${assumption('Interest rate (30-yr fixed)', 'h-rate', h.rate, '0.05', '%', 'update from Freddie Mac before modeling')}
            ${assumption('Loan term', 'h-term', h.termYears, '1', 'yrs')}
            ${assumption('Property tax rate', 'h-tax', h.taxRate, '0.05', '%/yr', 'Dauphin Co. est. — verify township')}
            ${assumption('Homeowners insurance', 'h-ins', h.insuranceYr, '50', '$/yr')}
            ${assumption('PMI rate (if <20% down)', 'h-pmi', h.pmiRate, '0.05', '%/yr')}
            ${assumption('Closing costs', 'h-close', h.closingPct, '0.25', '% of price', 'incl. ~1% PA transfer tax')}
            <label class="assume"><span>Target purchase date</span>
              <span class="assume-input"><input class="input" type="date" id="h-target" value="${h.targetDate}"></span></label>
          </div>
          <p class="help">Down payment saved (<b>${S.fmt$(houseGoal.saved, 0)}</b>) and monthly house savings (<b>${S.fmt$(houseGoal.monthly, 0)}</b>) come from the
            <a href="#/goals">Home Down Payment goal</a>; combined income (<b>${S.fmt$(S.incomeTotal(), 0)}</b>) from the <a href="#/budget">Budget</a>.</p>
        </section>

        <div class="scenario-grid">
          ${h.scenarios.map((s, i) => scenarioCard(s, i)).join('')}
        </div>

        <section class="card">
          <div class="card-head"><h2>Rules of thumb</h2></div>
          <ul class="steps">
            <li>Keep PITI at or below ~28% of income — scenarios above that are flagged.</li>
            <li>Keep card utilization under 10% for the 6 months before the mortgage application.</li>
            <li>Cash to close = down payment + closing costs. Keep the emergency fund separate — don't drain it to close.</li>
          </ul>
        </section>
      </div>`;

    const bind = (id, key, isPct) => {
      root.querySelector('#' + id).addEventListener('change', e => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) { S.data.house[key] = v; S.save(); App.render(); }
      });
    };
    bind('h-rate', 'rate'); bind('h-term', 'termYears'); bind('h-tax', 'taxRate');
    bind('h-ins', 'insuranceYr'); bind('h-pmi', 'pmiRate'); bind('h-close', 'closingPct');
    root.querySelector('#h-target').addEventListener('change', e => {
      if (e.target.value) { S.data.house.targetDate = e.target.value; S.save(); App.render(); }
    });
    root.querySelectorAll('[data-sc]').forEach(inp => {
      inp.addEventListener('change', () => {
        const s = S.data.house.scenarios[+inp.dataset.sc];
        const v = parseFloat(inp.value);
        if (!isNaN(v)) { s[inp.dataset.k] = v; S.save(); App.render(); }
      });
    });
  };

  function scenarioCard(s, i) {
    const S = Store;
    const r = S.houseScenario(s);
    const pctBad = r.pctIncome != null && r.pctIncome > 0.28;
    const row = (label, value, cls) =>
      `<div class="sc-row${cls ? ' ' + cls : ''}"><span>${label}</span><b>${value}</b></div>`;
    return `<section class="card sc-card">
      <div class="card-head"><h2>${App.esc(s.label)}</h2>
        ${r.vsTarget ? `<span class="pill ${r.vsTarget === 'ON TRACK' ? 'good' : 'bad'}">${r.vsTarget}</span>` : ''}</div>
      <div class="sc-inputs">
        <label>Home price ($)<input class="input" type="number" step="5000" value="${s.price}" data-sc="${i}" data-k="price"></label>
        <label>Down payment (%)<input class="input" type="number" step="1" value="${s.downPct}" data-sc="${i}" data-k="downPct"></label>
      </div>
      <div class="sc-piti">${S.fmt$(r.piti, 0)}<span>/mo PITI</span></div>
      ${row('% of take-home', S.fmtPct(r.pctIncome), pctBad ? 'flag' : '')}
      ${pctBad ? '<div class="sc-flag">above the 28% comfort line</div>' : ''}
      <div class="sc-detail">
        ${row('Down payment', S.fmt$(r.down, 0))}
        ${row('Loan amount', S.fmt$(r.loan, 0))}
        ${row('Principal & interest', S.fmt$(r.pi, 0))}
        ${row('Property tax', S.fmt$(r.tax, 0))}
        ${row('Insurance', S.fmt$(r.ins, 0))}
        ${row('PMI', r.pmi > 0 ? S.fmt$(r.pmi, 0) : '—')}
        ${row('Closing costs', S.fmt$(r.closing, 0))}
        ${row('Cash to close', S.fmt$(r.cashToClose, 0), 'strong')}
        ${row('Still to save', S.fmt$(r.stillToSave, 0))}
        ${row('Ready by', r.readyBy ? S.fmtDate(r.readyBy) : 'set a monthly contribution', 'strong')}
      </div>
    </section>`;
  }
})();
