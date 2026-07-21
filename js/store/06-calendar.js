/* ---- bill calendar, reminders & month-end close ---- */
'use strict';

  /* ---------- bill calendar, reminders & month-end close ---------- */

  function prevMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0');
  }
  function nextMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return m === 12 ? (y + 1) + '-01' : y + '-' + String(m + 1).padStart(2, '0');
  }
  const todayIso = () => new Date().toISOString().slice(0, 10);
  function dayDiff(fromIso, toIso) {
    return Math.round((new Date(toIso + 'T00:00:00') - new Date(fromIso + 'T00:00:00')) / 86400000);
  }

  /* Everything with a date (or that should have one) in a month: Fixed budget
     lines (due on their dueDay, "undated" until one is set), any budget line
     with a renewal date set (insurance policies, contract terms — any type,
     not just Fixed), and wedding vendor payments. posted comes from M1's bill
     matching, so paying a bill checks it off the calendar automatically. A
     renewal never has a "posted" concept of its own — it just ages through
     upcoming/soon/overdue by date, same as everything else here. */
  function monthSchedule(ym) {
    const month = ym || thisMonth();
    const st = budgetLineStatus(month);
    const dim = daysInMonth(month);
    const today = todayIso();
    const items = [];
    for (const b of data.budget) {
      if (b.type !== 'Fixed') continue;
      const posted = !!(st[b.id] && st[b.id].posted);
      const due = b.dueDay ? month + '-' + String(Math.min(+b.dueDay, dim)).padStart(2, '0') : null;
      items.push({
        kind: 'bill', id: b.id, name: b.name, amount: +b.monthly || 0,
        due, posted, tx: posted ? st[b.id].tx : null, section: b.section
      });
    }
    for (const b of data.budget) {
      if (!b.renewalDate || b.renewalDate.slice(0, 7) !== month) continue;
      items.push({ kind: 'renewal', id: b.id, name: b.name, amount: 0, due: b.renewalDate, posted: false, section: b.section });
    }
    for (const v of data.wedding.vendors) {
      if (v.due && v.due.slice(0, 7) === month && (+v.amount || 0) > 0) {
        items.push({ kind: 'wedding', id: v.id, name: v.vendor, amount: +v.amount || 0, due: v.due, posted: !!v.paid });
      }
    }
    for (const it of items) {
      it.status = it.posted ? 'done'
        : !it.due ? 'undated'
        : it.due < today ? (month < thisMonth() ? 'missed' : 'overdue')
        : dayDiff(today, it.due) <= 7 ? 'soon'
        : 'upcoming';
    }
    items.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1);
    return items;
  }

  /* Everything unposted that's due within `days` of today, overdue items
     included — the shared pool behind both the dashboard's "due soon" digest
     and the reminder system below. Unlike dueForReminder, this ignores the
     reminders opt-in and the "already reminded" log: it's a read of what's
     true right now, not a decision about whether to notify. */
  function dueSoonItems(days) {
    const horizon = days == null ? 3 : days;
    const today = todayIso();
    const cur = thisMonth();
    const pool = monthSchedule(cur).concat(
      // near month-end the horizon spills into next month's first bills
      monthSchedule(nextMonth(cur)).filter(i => i.due && dayDiff(today, i.due) <= horizon)
    );
    return pool.filter(i => i.due && !i.posted && dayDiff(today, i.due) <= horizon)
      .sort((a, b) => a.due < b.due ? -1 : 1);
  }
  /* Bills (and wedding payments) that deserve a reminder right now: due within
     daysAhead, not posted, not already reminded for this due date. */
  function dueForReminder() {
    const r = data.reminders;
    if (!r || !r.enabled) return [];
    const today = todayIso();
    const horizon = +r.daysAhead || 3;
    return dueSoonItems(horizon).filter(i => dayDiff(today, i.due) >= 0 && !r.log[i.id + '@' + i.due]);
  }
  function markReminded(items) {
    for (const i of items) data.reminders.log[i.id + '@' + i.due] = todayIso();
    // keep the log from growing forever — entries for past due dates age out
    const cutoff = todayIso().slice(0, 7);
    for (const k of Object.keys(data.reminders.log)) {
      if (k.split('@')[1].slice(0, 7) < prevMonth(cutoff)) delete data.reminders.log[k];
    }
    localStorage.setItem(KEY, JSON.stringify(data)); // no cf:change — nothing visual changed
  }

  /* Insights worth a notification, not just a dashboard card — a deliberately
     narrow, stably-keyed slice of insights() (which recomputes fresh every
     render and mostly has no identity to dedupe against). A price jump keys
     on the merchant + the new price, so a bigger jump later still notifies;
     a tight forecast month keys on the month + its severity, so an escalation
     from "tight" to "negative" notifies again; a renewal keys on the line +
     its renewal date, so updating the date to the next cycle naturally opens
     up a fresh nudge — the same finding never repeats every time the app
     opens, but a real change always does. */
  function dueInsightNudges() {
    const r = data.reminders;
    if (!r || !r.insightsEnabled) return [];
    const log = r.insightLog || {};
    const out = [];
    for (const c of priceCreeps()) {
      const key = 'creep:' + c.merchant + '@' + c.to.toFixed(2);
      if (!log[key]) out.push({ key, text: `${c.merchant} went up: ${fmt$(c.from, 2)} → ${fmt$(c.to, 2)}/mo.`,
        href: '#/transactions?q=' + encodeURIComponent(c.merchant) });
    }
    if (Object.keys(data.snapshots).length) {
      const fc = forecast(12);
      const tight = fc.months.find(m => m.tone === 'bad') || fc.months.find(m => m.tone === 'warn');
      if (tight) {
        const key = 'forecast:' + tight.ym + ':' + tight.tone;
        if (!log[key]) out.push({
          key,
          text: tight.tone === 'bad'
            ? `Cash-flow forecast goes negative in ${fmtMonth(tight.ym)} (${fmt$(tight.balance, 0)}).`
            : `${fmtMonth(tight.ym)} looks tight — projected liquid balance ${fmt$(tight.balance, 0)}.`,
          href: '#/forecast'
        });
      }
    }
    const today = todayIso();
    for (const b of data.budget) {
      if (!b.renewalDate) continue;
      const days = dayDiff(today, b.renewalDate);
      if (days < 0 || days > 14) continue; // past renewals go stale, not urgent — update the date instead of re-nagging
      const key = 'renewal:' + b.id + '@' + b.renewalDate;
      if (!log[key]) out.push({ key, text: `${b.name} renews ${fmtDate(b.renewalDate)}.`,
        href: '#/budget?section=' + encodeURIComponent(b.section) });
    }
    return out;
  }
  function markInsightsNudged(items) {
    for (const i of items) data.reminders.insightLog[i.key] = todayIso();
    // keep the log from growing forever — entries older than 6 months age out
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
    const cutoffIso = cutoff.toISOString().slice(0, 10);
    for (const k of Object.keys(data.reminders.insightLog)) {
      if (data.reminders.insightLog[k] < cutoffIso) delete data.reminders.insightLog[k];
    }
    localStorage.setItem(KEY, JSON.stringify(data)); // no cf:change — nothing visual changed
  }

  /* Month-end close: the checklist state, the summary it ends with, and the
     record that a month has been put to bed. */
  function closeChecklist(ym) {
    const txs = txInMonth(ym);
    const uncategorized = txs.filter(t => !t.category || t.category === 'Other');
    const unposted = monthSchedule(ym).filter(i => i.kind === 'bill' && !i.posted);
    return {
      txCount: txs.length,
      uncategorized,
      unposted,
      needsExport: needsExport(),
      closed: !!data.closes[ym]
    };
  }
  function monthSummary(ym) {
    const spent = txInMonth(ym).reduce((s, t) => s + (+t.amount || 0), 0);
    const budget = budgetTotal();
    const cats = Object.entries(spendByCategory(ym)).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const who = spendByWho(ym);
    const prior = monthsWithData().filter(m => m < ym);
    const prev = prior.length ? prior[prior.length - 1] : null;
    const prevSpent = prev ? txInMonth(prev).reduce((s, t) => s + (+t.amount || 0), 0) : null;
    return {
      spent, budget, diff: budget - spent, txCount: txInMonth(ym).length,
      topCats: cats, who, prev, prevSpent,
      closed: data.closes[ym] || null
    };
  }
  function closeMonth(ym) {
    const st = budgetLineStatus(ym);
    data.rolloverBalances = data.rolloverBalances || {};
    for (const b of data.budget) {
      if (b.type !== 'Discretionary' || !b.rolloverEnabled) continue;
      const spent = (st[b.id] && st[b.id].spent) || 0;
      const delta = (+b.monthly || 0) - spent;
      data.rolloverBalances[b.id] = (data.rolloverBalances[b.id] || 0) + delta;
    }
    data.closes[ym] = { closedAt: new Date().toISOString() };
    save();
  }

  /* Consecutive closed months (most recent first) a Discretionary line stayed
     at or under its flat monthly figure — a quiet, opt-in "still on track"
     signal. Deliberately ignores rollover: rollover is about the dollars
     carrying forward, this is about whether a given month, on its own, came
     in under. Stops counting the moment a month breaks the streak. */
  function underBudgetStreak(lineId) {
    const line = data.budget.find(b => b.id === lineId);
    if (!line || line.type !== 'Discretionary') return 0;
    const closedMonths = Object.keys(data.closes).sort().reverse();
    let streak = 0;
    for (const ym of closedMonths) {
      const st = budgetLineStatus(ym);
      const spent = (st[lineId] && st[lineId].spent) || 0;
      if (spent <= (+line.monthly || 0)) streak++;
      else break;
    }
    return streak;
  }

