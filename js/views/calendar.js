/* Bill Calendar — the month's bills and wedding payments laid out by due date,
   expected vs posted (via the import bill-matcher), plus opt-in local reminders
   and the guided month-end close ritual. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  let calMonth = null;

  Views.calendar = function (root) {
    const S = Store;
    const month = calMonth || S.thisMonth();
    const isCurrent = month === S.thisMonth();
    const items = S.monthSchedule(month);
    const dated = items.filter(i => i.due);
    const undated = items.filter(i => !i.due);
    const posted = items.filter(i => i.posted);
    const dueSoon = items.filter(i => i.status === 'soon');
    const overdue = items.filter(i => i.status === 'overdue');
    const last = S.prevMonth(S.thisMonth());
    const lastCheck = S.closeChecklist(last);
    const showClose = S.txInMonth(last).length > 0;

    const byDay = {};
    for (const i of dated) (byDay[i.due] = byDay[i.due] || []).push(i);

    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Bill Calendar</h1>
          <div class="cal-nav">
            <button class="icon-btn" id="cal-prev" aria-label="Previous month">‹</button>
            <b class="cal-month">${S.fmtMonth(month)}</b>
            <button class="icon-btn" id="cal-next" aria-label="Next month">›</button>
          </div>
        </div>
        ${App.exportBanner()}

        <section class="card card-navy stat-band">
          ${stat('Due this week', dueSoon.length ? S.fmt$(dueSoon.reduce((s, i) => s + i.amount, 0), 0) + ' · ' + dueSoon.length : '—')}
          ${stat('Overdue', overdue.length ? String(overdue.length) : 'none', overdue.length ? 'bad' : '')}
          ${stat('Posted', posted.length + ' of ' + items.length)}
          ${stat('Month total', S.fmt$(items.reduce((s, i) => s + i.amount, 0), 0))}
        </section>

        <section class="card">
          <div class="card-head"><h2>${S.fmtMonth(month)} schedule</h2>
            <span class="card-note">bills check off automatically when the transaction posts</span></div>
          ${dated.length ? Object.keys(byDay).sort().map(day => `
            <div class="cal-day">
              <div class="cal-day-chip${day === new Date().toISOString().slice(0, 10) ? ' today' : ''}">
                <span class="cal-day-num">${+day.slice(8)}</span>
                <span class="cal-day-dow">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(day + 'T00:00:00').getDay()]}</span>
              </div>
              <ul class="cal-list">
                ${byDay[day].map(row).join('')}
              </ul>
            </div>`).join('')
          : '<p class="empty">No dated bills this month yet — set due days below and they\'ll show up here.</p>'}
        </section>

        ${undated.length ? `
        <section class="card">
          <div class="card-head"><h2>No due day set</h2><span class="card-note">tap a bill to place it on the calendar</span></div>
          <ul class="cal-list">${undated.map(row).join('')}</ul>
        </section>` : ''}

        <section class="card">
          <div class="card-head"><h2>Reminders</h2></div>
          ${remindersBody()}
        </section>

        ${showClose ? `
        <section class="card">
          <div class="card-head"><h2>Month-end close</h2></div>
          ${lastCheck.closed
            ? `<p class="help">✓ ${S.fmtMonth(last)} was closed on ${S.fmtDate(S.data.closes[last].closedAt.slice(0, 10))}.</p>
               <div class="btn-row"><button class="btn" id="close-view">View ${S.fmtMonth(last)} summary</button></div>`
            : `<p class="help">Put ${S.fmtMonth(last)} to bed: confirm everything's imported and categorized,
               check the bills posted, update goal balances, export your CSV — then get the month's report card.</p>
               <div class="btn-row"><button class="btn gold" id="close-run">Close out ${S.fmtMonth(last)}</button></div>`}
        </section>` : ''}
      </div>`;

    const stepMonth = dir => {
      calMonth = dir > 0 ? S.nextMonth(month) : S.prevMonth(month);
      App.render();
    };
    root.querySelector('#cal-prev').addEventListener('click', () => stepMonth(-1));
    root.querySelector('#cal-next').addEventListener('click', () => stepMonth(1));

    root.querySelectorAll('[data-cal-bill]').forEach(li =>
      li.addEventListener('click', () => {
        const b = S.data.budget.find(x => x.id === li.dataset.calBill);
        if (b) dueDayModal(b);
      }));
    root.querySelectorAll('[data-cal-wedding]').forEach(li =>
      li.addEventListener('click', () => { location.hash = '#/wedding'; }));

    wireReminders(root);

    const runBtn = root.querySelector('#close-run');
    if (runBtn) runBtn.addEventListener('click', () => closeWizard(last));
    const viewBtn = root.querySelector('#close-view');
    if (viewBtn) viewBtn.addEventListener('click', () => summaryModal(last));

    const incoming = App.routeParams();
    if (incoming.close) {
      App.clearRouteParams();
      if (S.data.closes[incoming.close]) summaryModal(incoming.close);
      else closeWizard(incoming.close);
    }
  };

  const stat = (label, value, tone) =>
    `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value${tone ? ' ' + tone : ''}">${value}</div></div>`;

  const STATUS = {
    done: ['good', '✓ posted'],
    soon: ['warn', 'due soon'],
    overdue: ['bad', 'overdue'],
    missed: ['bad', 'not posted'],
    upcoming: ['', 'upcoming'],
    undated: ['', '']
  };
  function row(i) {
    const [tone, label] = STATUS[i.status];
    const pill = label ? `<span class="pill ${tone || 'plain'}">${label}</span>` : '';
    const attr = i.kind === 'bill' ? `data-cal-bill="${i.id}"` : `data-cal-wedding="${i.id}"`;
    return `<li class="cal-row status-${i.status}" ${attr} role="button" tabindex="0">
      <div class="cal-row-main">
        <span class="cal-row-name">${App.esc(i.name)}${i.kind === 'wedding' ? ' <span class="cal-tag">wedding</span>' : ''}</span>
        <span class="cal-row-meta">${i.posted && i.tx ? 'posted ' + Store.fmtDate(i.tx.date) : i.kind === 'wedding' && i.posted ? 'paid' : i.due ? 'due ' + Store.fmtDate(i.due) : 'tap to set a due day'}</span>
      </div>
      ${pill}
      <b class="cal-row-amt">${Store.fmt$(i.amount, 0)}</b>
    </li>`;
  }

  /* ---------- due day editor ---------- */
  function dueDayModal(b) {
    const m = App.modal('Due day — ' + App.esc(b.name), `
      <p class="help">Which day of the month is “${App.esc(b.name)}” (${Store.fmt$(b.monthly, 0)}/mo) due?
         Months shorter than the chosen day use their last day.</p>
      <label>Due day
        <select class="select" id="dd-day">
          <option value="">— none —</option>
          ${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${+b.dueDay === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}
        </select>
      </label>
      <div class="btn-row">
        <button class="btn gold" id="dd-save">Save</button>
        <button class="btn ghost" id="dd-budget">Edit in Budget</button>
      </div>`);
    m.el.querySelector('#dd-save').addEventListener('click', () => {
      const v = m.el.querySelector('#dd-day').value;
      b.dueDay = v ? +v : null;
      Store.save(); m.close(); App.render();
      App.toast(v ? 'On the calendar — due day ' + v : 'Removed from the calendar');
    });
    m.el.querySelector('#dd-budget').addEventListener('click', () => { m.close(); App.go('budget', { section: b.section }); });
  }

  /* ---------- reminders ---------- */
  function remindersBody() {
    const r = Store.data.reminders;
    const supported = 'Notification' in window;
    const perm = supported ? Notification.permission : 'unsupported';
    return `
      <label class="checkline"><input type="checkbox" id="rem-toggle"${r.enabled ? ' checked' : ''}>
        Remind me before bills are due</label>
      <div class="form-grid" style="margin-top:10px">
        <label>Days ahead
          <select class="select" id="rem-days"${r.enabled ? '' : ' disabled'}>
            ${[1, 3, 5, 7].map(d => `<option value="${d}"${+r.daysAhead === d ? ' selected' : ''}>${d} day${d === 1 ? '' : 's'}</option>`).join('')}
          </select>
        </label>
      </div>
      <p class="help" id="rem-status">${
        !supported ? 'This browser doesn\'t support notifications — upcoming bills still surface in the Dashboard insights and here.'
        : perm === 'denied' ? '⚠ Notifications are blocked for this app in your browser settings. Upcoming bills still surface in the Dashboard insights.'
        : 'Reminders are checked when you open the app and fire as a notification where the platform allows it (iOS home-screen apps are restrictive) — the Dashboard insights always show what\'s due regardless. Everything stays on this device.'}</p>`;
  }
  function wireReminders(root) {
    const toggle = root.querySelector('#rem-toggle');
    const days = root.querySelector('#rem-days');
    if (!toggle) return;
    toggle.addEventListener('change', async () => {
      const r = Store.data.reminders;
      if (toggle.checked) {
        if ('Notification' in window && Notification.permission === 'default') {
          try { await Notification.requestPermission(); } catch (e) { /* user dismissed */ }
        }
        r.enabled = true;
        Store.save(); App.render();
        App.toast('Notification' in window && Notification.permission === 'granted'
          ? 'Reminders on' : 'Reminders on — insights only (notifications unavailable)');
        App.checkReminders();
      } else {
        r.enabled = false;
        Store.save(); App.render(); App.toast('Reminders off');
      }
    });
    if (days) days.addEventListener('change', () => {
      Store.data.reminders.daysAhead = +days.value;
      Store.save();
    });
  }

  /* ---------- month-end close ritual ---------- */
  function closeWizard(ym) {
    const S = Store;
    const c = S.closeChecklist(ym);
    const goals = S.data.goals;
    const step = (n, ok, title, body) => `
      <div class="close-step${ok ? ' ok' : ''}">
        <span class="close-step-mark">${ok ? '✓' : n}</span>
        <div class="close-step-body"><b>${title}</b>${body ? `<div class="close-step-sub">${body}</div>` : ''}</div>
      </div>`;
    const m = App.modal('Close out ' + S.fmtMonth(ym), `
      ${step(1, c.txCount > 0, 'Statements imported',
        c.txCount > 0
          ? c.txCount + ' transaction' + (c.txCount === 1 ? '' : 's') + ' recorded for ' + S.fmtMonth(ym)
          : 'No transactions yet — <a href="#/import">import a statement</a> first')}
      ${step(2, !c.uncategorized.length, 'Categories clean',
        c.uncategorized.length
          ? `<a href="#/transactions?month=${ym}&category=Other">${c.uncategorized.length} row${c.uncategorized.length === 1 ? '' : 's'} still “Other” — worth a look</a>`
          : 'Nothing left in “Other”')}
      ${step(3, !c.unposted.length, 'Recurring bills posted',
        c.unposted.length
          ? 'Not matched to a transaction: ' + c.unposted.map(i => App.esc(i.name)).join(', ') + ' — import the missing statement or carry on if they were skipped this month'
          : 'Every fixed bill matched a transaction')}
      <div class="close-step">
        <span class="close-step-mark">4</span>
        <div class="close-step-body"><b>Update goal balances</b>
          <div class="close-goals">
            ${goals.map(g => `
              <label class="close-goal">
                <span>${App.esc(g.name)}</span>
                <input class="input slim num" type="number" step="1" min="0" data-goal="${g.id}" value="${g.saved}">
              </label>`).join('')}
          </div>
        </div>
      </div>
      ${step(5, !c.needsExport, 'CSV export current',
        c.needsExport
          ? '<button class="btn sm" id="close-export">Export CSV now</button>'
          : 'Nothing changed since the last export')}
      <div class="btn-row">
        <button class="btn gold" id="close-commit">Close ${S.fmtMonth(ym)}</button>
        <button class="btn ghost" id="close-cancel">Not yet</button>
      </div>
      <p class="help">Closing doesn't lock anything — it records the month as reviewed and files its summary.</p>`);
    m.el.querySelectorAll('[data-goal]').forEach(inp =>
      inp.addEventListener('change', () => {
        const g = goals.find(x => x.id === inp.dataset.goal);
        if (g) { g.saved = Math.max(0, parseFloat(inp.value) || 0); S.save(); }
      }));
    const exp = m.el.querySelector('#close-export');
    if (exp) exp.addEventListener('click', () => {
      App.exportTransactionsCSV();
      exp.replaceWith(Object.assign(document.createElement('span'), { textContent: '✓ exported' }));
    });
    m.el.querySelector('#close-cancel').addEventListener('click', m.close);
    m.el.querySelector('#close-commit').addEventListener('click', () => {
      S.closeMonth(ym);
      m.close();
      summaryModal(ym);
      App.render({ resetScroll: false });
    });
  }

  function summaryModal(ym) {
    const S = Store;
    const s = S.monthSummary(ym);
    const over = s.spent > s.budget;
    const rolled = S.data.budget.filter(b => b.type === 'Discretionary' && b.rolloverEnabled);
    App.modal(S.fmtMonth(ym) + ' — month in review', `
      <div class="close-summary">
        <div class="close-summary-hero${over ? ' over' : ''}">
          <div class="close-summary-big">${S.fmt$(s.spent, 0)}</div>
          <div class="close-summary-sub">spent of ${S.fmt$(s.budget, 0)} budget —
            <b>${over ? S.fmt$(s.spent - s.budget, 0) + ' over' : S.fmt$(s.budget - s.spent, 0) + ' under'}</b></div>
        </div>
        <table class="table plain">
          <tbody>
            ${s.topCats.map(([c, v]) => `<tr><td>Top: ${App.esc(c)}</td><td class="num">${S.fmt$(v, 0)}</td></tr>`).join('')}
            <tr><td>${['Shared'].concat(S.members()).map(n => App.esc(n)).join(' / ')}</td><td class="num">${['Shared'].concat(S.members()).map(n => S.fmt$(s.who[n] || 0, 0)).join(' / ')}</td></tr>
            <tr><td>Transactions</td><td class="num">${s.txCount}</td></tr>
            ${s.prev ? `<tr><td>vs ${S.fmtMonth(s.prev)}</td><td class="num">${s.spent === s.prevSpent ? 'even'
              : (s.spent > s.prevSpent ? '<span class="neg">+' : '<span class="pos">−') + S.fmt$(Math.abs(s.spent - s.prevSpent), 0) + '</span>'}</td></tr>` : ''}
            ${s.closed ? `<tr><td>Closed</td><td class="num">${S.fmtDate(s.closed.closedAt.slice(0, 10))}</td></tr>` : ''}
          </tbody>
        </table>
        ${rolled.length ? `
        <p class="help" style="margin-top:10px">Envelope rollover — carrying into next month:</p>
        <table class="table plain">
          <tbody>
            ${rolled.map(b => {
              const bal = S.data.rolloverBalances[b.id] || 0;
              return `<tr><td>${App.esc(b.name)}</td><td class="num"><span class="${bal >= 0 ? 'pos' : 'neg'}">${bal >= 0 ? '+' : ''}${S.fmt$(bal, 0)}</span></td></tr>`;
            }).join('')}
          </tbody>
        </table>` : ''}
      </div>`);
  }
})();
