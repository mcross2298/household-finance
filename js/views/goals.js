/* Savings Goals — progress rings, months-to-goal, and affordability check. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const HOLD_MS = 700;

  Views.goals = function (root) {
    const S = Store;
    const goals = S.data.goals;
    const frozen = goals.filter(g => g.isFrozen);
    const ordered = goals.filter(g => !g.isFrozen).concat(frozen);
    const progress = S.goalsProgress();
    const surplus = S.surplus();
    const after = surplus - progress.monthly;

    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Savings Goals</h1>
          <button class="btn gold" id="g-add">＋ Add goal</button>
        </div>

        <section class="card card-navy stat-band">
          ${stat('Active target', S.fmt$(progress.target, 0))}
          ${stat('Saved so far', S.fmt$(progress.saved, 0))}
          ${stat('Committed / mo', S.fmt$(progress.monthly, 0))}
          ${stat('Surplus after goals', S.fmt$(after, 0), after < 0 ? 'bad' : 'gold')}
        </section>
        ${after < 0 ? `<div class="callout warn">Goal contributions exceed your monthly surplus by <b>${S.fmt$(-after, 0)}</b>. Trim a contribution or the budget to bring it back in line.</div>` : ''}
        ${frozen.length ? `<div class="callout">🧊 <b>${frozen.length}</b> goal${frozen.length > 1 ? 's' : ''} frozen — ${S.fmt$(progress.frozenMonthly, 0)}/mo paused and excluded from the totals above. Hold the lock on a card to unfreeze it.</div>` : ''}

        <div class="goal-grid">
          ${ordered.map(g => {
            const m = S.goalMeta(g);
            const isFrozen = !!g.isFrozen;
            return `<section class="card goal-card${isFrozen ? ' frozen' : ''}" data-id="${g.id}">
              <div class="goal-top">
                <div class="goal-ring" id="ring-${g.id}"></div>
                <div class="goal-info">
                  <h3>${App.esc(g.name)} ${isFrozen ? '<span class="pill plain">🔒 Frozen</span>' : ''}</h3>
                  <div class="goal-nums">${S.fmt$(g.saved, 0)} <span class="muted">of</span> ${S.fmt$(g.target, 0)}</div>
                  <div class="goal-sub">${isFrozen ? 'Paused — not counted in active goals'
                    : S.fmt$(g.monthly, 0) + '/mo · ' +
                      (m.remaining === 0 ? '<b class="pos">done 🎉</b>'
                        : m.months != null ? m.months + ' mo → ' + S.fmtDate(m.projected)
                        : 'no monthly contribution set')}</div>
                </div>
              </div>
              <div class="btn-row">
                ${isFrozen ? `
                  <button class="btn slim unlock-hold" data-unlock="${g.id}" aria-label="Hold to unlock ${App.esc(g.name)}">
                    <span class="unlock-fill"></span><span class="unlock-label">🔒 Hold to unlock</span>
                  </button>` : `
                  <button class="btn slim" data-act="fund" data-id="${g.id}">＋ Add money</button>
                  <button class="btn slim ghost" data-act="edit" data-id="${g.id}">Edit</button>
                  <button class="btn slim ghost" data-act="freeze" data-id="${g.id}">🧊 Freeze</button>`}
              </div>
            </section>`;
          }).join('')}
        </div>
      </div>`;

    goals.forEach(g => {
      const m = S.goalMeta(g);
      Charts.ring(root.querySelector('#ring-' + CSS.escape(g.id)), m.pct);
    });
    root.querySelector('#g-add').addEventListener('click', () => editModal(null));
    root.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', () => {
      const g = goals.find(x => x.id === btn.dataset.id);
      if (!g) return;
      if (btn.dataset.act === 'edit') editModal(g);
      else if (btn.dataset.act === 'freeze') {
        g.isFrozen = true;
        Store.save(); App.render(); App.toast(g.name + ' frozen — paused from active goals');
      } else fundModal(g);
    }));

    root.querySelectorAll('[data-unlock]').forEach(btn => {
      let timer = null;
      const start = () => {
        if (timer) return;
        btn.classList.add('holding');
        timer = setTimeout(() => {
          const g = goals.find(x => x.id === btn.dataset.unlock);
          timer = null;
          if (!g) return;
          g.isFrozen = false;
          Store.save(); App.render(); App.toast('Unlocked — ' + g.name + ' is active again');
          fundModal(g);
        }, HOLD_MS);
      };
      const cancel = () => { clearTimeout(timer); timer = null; btn.classList.remove('holding'); };
      btn.addEventListener('pointerdown', start);
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, cancel));
      btn.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); start(); } });
      btn.addEventListener('keyup', e => { if (e.key === 'Enter' || e.key === ' ') cancel(); });
    });
  };

  const stat = (label, value, tone) =>
    `<div class="stat${tone ? ' ' + tone : ''}"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></div>`;

  function fundModal(g) {
    const m = App.modal('Add money — ' + App.esc(g.name), `
      <div class="form-grid">
        <label>Amount to add ($)<input class="input" type="number" step="0.01" id="f-amt" value="${g.monthly || ''}"></label>
      </div>
      <p class="help">Currently ${Store.fmt$(g.saved, 0)} of ${Store.fmt$(g.target, 0)}.</p>
      <div class="btn-row"><button class="btn gold" id="f-go">Add</button></div>`);
    m.el.querySelector('#f-go').addEventListener('click', () => {
      const amt = parseFloat(m.el.querySelector('#f-amt').value);
      if (isNaN(amt)) return App.toast('Enter an amount', 'warn');
      g.saved = Math.max(0, Math.round(((+g.saved || 0) + amt) * 100) / 100);
      Store.save(); m.close(); App.render(); App.toast('Updated ' + g.name);
    });
  }

  function editModal(g) {
    const isNew = !g;
    const v = g || { name: '', target: '', saved: 0, monthly: '' };
    const m = App.modal(isNew ? 'Add goal' : 'Edit goal', `
      <div class="form-grid">
        <label class="span2">Goal<input class="input" id="g-name" value="${App.esc(v.name)}"></label>
        <label>Target ($)<input class="input" type="number" id="g-target" value="${v.target}"></label>
        <label>Already saved ($)<input class="input" type="number" id="g-saved" value="${v.saved}"></label>
        <label>Monthly contribution ($)<input class="input" type="number" id="g-monthly" value="${v.monthly}"></label>
        <label class="checkline"><input type="checkbox" id="g-house" ${v.isHouse ? 'checked' : ''}> House down-payment goal (feeds House Plan)</label>
      </div>
      <div class="btn-row">
        <button class="btn gold" id="g-save">${isNew ? 'Add' : 'Save'}</button>
        ${isNew ? '' : '<button class="btn danger ghost" id="g-del">Delete</button>'}
      </div>`);
    const q = id => m.el.querySelector(id);
    q('#g-save').addEventListener('click', () => {
      const name = q('#g-name').value.trim();
      if (!name) return App.toast('Name the goal', 'warn');
      const next = {
        id: isNew ? Store.uid() : g.id, name,
        target: Math.max(0, parseFloat(q('#g-target').value) || 0),
        saved: Math.max(0, parseFloat(q('#g-saved').value) || 0),
        monthly: Math.max(0, parseFloat(q('#g-monthly').value) || 0)
      };
      if (q('#g-house').checked) {
        Store.data.goals.forEach(x => delete x.isHouse); // only one goal feeds the House Plan
        next.isHouse = true;
      }
      if (isNew) Store.data.goals.push(next); else { delete g.isHouse; Object.assign(g, next); }
      Store.save(); m.close(); App.render(); App.toast('Saved');
    });
    if (!isNew) q('#g-del').addEventListener('click', () => {
      App.confirmDialog('Delete goal', `Remove “${App.esc(g.name)}”?`, 'Delete', () => {
        Store.data.goals = Store.data.goals.filter(x => x.id !== g.id);
        Store.save(); m.close(); App.render(); App.toast('Deleted');
      });
    });
  }
})();
