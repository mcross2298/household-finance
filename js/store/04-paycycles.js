/* ---- pay cycles — paydays & which paycheck funds a bill ---- */
'use strict';

  /* ---------- pay cycles ---------- */
  /* Paydays for one member within a given month, derived from their pay-cycle
     anchor (a known past/future payday) walked forward by frequency. Weekly/
     biweekly step in fixed-day increments from the anchor; semimonthly/monthly
     repeat on the anchor's day-of-month each month (capped like dueDay is). */
  function paydaysInMonth(person, ym) {
    const pc = data.payCycles && data.payCycles[person];
    if (!pc || !pc.anchor) return [];
    const freq = pc.frequency || 'biweekly';
    const dim = daysInMonth(ym);
    if (freq === 'monthly' || freq === 'semimonthly') {
      const anchorDay = +pc.anchor.slice(8, 10);
      const days = freq === 'monthly' ? [Math.min(anchorDay, dim)]
        : [...new Set([Math.min(anchorDay, dim), Math.min(anchorDay + 15, dim)])].sort((a, b) => a - b);
      return days.map(d => ym + '-' + String(d).padStart(2, '0'));
    }
    const stepMs = (freq === 'weekly' ? 7 : 14) * 86400000;
    const start = new Date(ym + '-01T00:00:00');
    const end = new Date(ym + '-' + String(dim).padStart(2, '0') + 'T00:00:00');
    let d = new Date(pc.anchor + 'T00:00:00');
    if (d > end) return [];
    while (d < start) d = new Date(d.getTime() + stepMs);
    const out = [];
    while (d <= end) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + stepMs); }
    return out;
  }
  /* Every payday in the month across the whole household, tagged by who it's for. */
  function paydaysInMonthAll(ym) {
    const out = [];
    for (const person of members()) {
      for (const date of paydaysInMonth(person, ym)) out.push({ date, person });
    }
    return out.sort((a, b) => a.date < b.date ? -1 : 1);
  }
  /* Which paycheck a Fixed line's due date should be funded from: the latest
     payday on or before it, from the bill owner's cycle (or any member's for a
     Shared line, whichever comes closer to the due date). Looks one month back
     so early-month due dates can still land on a prior month's paycheck. */
  function fundingPaycheck(b, ym) {
    if (!b.dueDay) return null;
    const dim = daysInMonth(ym);
    const due = ym + '-' + String(Math.min(+b.dueDay, dim)).padStart(2, '0');
    const persons = b.section === SHARED ? members() : [b.section];
    let best = null;
    for (const p of persons) {
      const candidates = paydaysInMonth(p, prevMonth(ym)).concat(paydaysInMonth(p, ym));
      for (const date of candidates) {
        if (date <= due && (!best || date > best.date)) best = { date, person: p };
      }
    }
    return best;
  }
  /* Groups this month's dueDay'd Fixed lines by the paycheck that funds them —
     "set aside $X from this check" instead of just "$X is due this month." */
  function paycheckAllocations(ym) {
    const dim = daysInMonth(ym);
    const map = {};
    for (const b of data.budget) {
      if (b.type !== 'Fixed' || !b.dueDay) continue;
      const fp = fundingPaycheck(b, ym);
      if (!fp) continue;
      const key = fp.date + '|' + fp.person;
      map[key] = map[key] || { date: fp.date, person: fp.person, amount: 0, bills: [] };
      map[key].amount += +b.monthly || 0;
      map[key].bills.push({ id: b.id, name: b.name, amount: +b.monthly || 0,
        due: ym + '-' + String(Math.min(+b.dueDay, dim)).padStart(2, '0') });
    }
    return Object.values(map).sort((a, b) => a.date < b.date ? -1 : 1);
  }

