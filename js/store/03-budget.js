/* ---- derived numbers — budget/income/goals/house/wedding/insights, safe-to-spend ---- */
'use strict';

  /* ---------- derived numbers ---------- */
  function budgetTotal() { return data.budget.reduce((s, x) => s + (+x.monthly || 0), 0); }
  function incomeTotal() {
    return (data.members || []).reduce((s, n) => s + (+data.incomes[n] || 0), 0);
  }
  function surplus() { return incomeTotal() - budgetTotal(); }
  function savingsRate() { const inc = incomeTotal(); return inc ? surplus() / inc : 0; }

  function budgetByCategory() {
    const map = {};
    for (const c of CATEGORIES) map[c] = 0;
    for (const x of data.budget) map[x.category] = (map[x.category] || 0) + (+x.monthly || 0);
    return map;
  }
  /* Budget attribution across the current roster. `section` is the raw total per
     bucket (Shared + each member's own lines); `attributed` folds the Shared pool
     in by an even 1/N split, so it answers "what does each person actually carry".
     For a solo household N=1, so Shared simply rolls onto the one member. */
  function budgetByPerson() {
    const roster = data.members || [];
    const section = { Shared: 0 };
    const attributed = {};
    for (const n of roster) { section[n] = 0; attributed[n] = 0; }
    for (const x of data.budget) {
      const m = +x.monthly || 0;
      if (x.section === SHARED) section.Shared += m;
      else { if (section[x.section] == null) section[x.section] = 0; section[x.section] += m; }
      if (x.section !== SHARED && attributed[x.section] != null) attributed[x.section] += m;
    }
    const share = roster.length ? section.Shared / roster.length : 0;
    for (const n of roster) attributed[n] += share;
    return { members: roster, section, attributed, sharePerMember: share };
  }

  function txInMonth(ym) { return data.transactions.filter(t => t.date.startsWith(ym)); }
  function spendByCategory(ym) {
    const map = {};
    for (const t of txInMonth(ym)) map[t.category] = (map[t.category] || 0) + (+t.amount || 0);
    return map;
  }
  /* Daily totals for a month — the raw material for the Bill Calendar's
     spending heatmap. Days with no transactions simply don't appear. */
  function spendByDay(ym) {
    const map = {};
    for (const t of txInMonth(ym)) map[t.date] = (map[t.date] || 0) + (+t.amount || 0);
    return map;
  }
  function spendByWho(ym) {
    const map = { Shared: 0 };
    for (const n of (data.members || [])) map[n] = 0;
    for (const t of txInMonth(ym)) map[t.who] = (map[t.who] || 0) + (+t.amount || 0);
    return map;
  }
  function monthsWithData() {
    const set = new Set(data.transactions.map(t => t.date.slice(0, 7)));
    set.add(thisMonth());
    return [...set].sort();
  }

  function goalMeta(g) {
    const remaining = Math.max(0, (+g.target || 0) - (+g.saved || 0));
    const pct = (+g.target || 0) > 0 ? Math.min(1, (+g.saved || 0) / +g.target) : 0;
    let months = null, projected = null;
    if (remaining > 0 && (+g.monthly || 0) > 0) {
      months = Math.ceil(remaining / +g.monthly);
      const d = new Date(); d.setMonth(d.getMonth() + months);
      projected = d.toISOString().slice(0, 10);
    }
    return { remaining, pct, months, projected };
  }

  /* Named, saved what-if trials for the Forecast screen's goal-contribution
     slider — just a goal id + a trial monthly figure, always recomputed live
     against current goal/forecast data rather than frozen at save time, so
     "House 2027" vs "House 2028" stays honest as everything else changes. */
  function saveForecastScenario(name, goalId, monthly) {
    name = String(name || '').trim();
    if (!name || !goalId) return null;
    const s = { id: uid(), name, goalId, monthly: +monthly || 0, createdAt: new Date().toISOString() };
    data.forecastScenarios.push(s);
    save();
    return s;
  }
  function deleteForecastScenario(id) {
    data.forecastScenarios = data.forecastScenarios.filter(s => s.id !== id);
    save();
  }

  function houseScenario(s) {
    const h = data.house;
    const price = +s.price || 0, downPct = +s.downPct || 0;
    const down = price * downPct / 100;
    const loan = price - down;
    const r = (+h.rate || 0) / 100 / 12, n = (+h.termYears || 30) * 12;
    const pi = r > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n;
    const tax = price * (+h.taxRate || 0) / 100 / 12;
    const ins = (+h.insuranceYr || 0) / 12;
    const pmi = downPct < 20 ? loan * (+h.pmiRate || 0) / 100 / 12 : 0;
    const piti = pi + tax + ins + pmi;
    const closing = price * (+h.closingPct || 0) / 100;
    const cashToClose = down + closing;
    const houseGoal = data.goals.find(g => g.isHouse) || { saved: 0, monthly: 0 };
    const stillToSave = Math.max(0, cashToClose - (+houseGoal.saved || 0));
    const monthly = +houseGoal.monthly || 0;
    let months = null, readyBy = null, vsTarget = null;
    if (stillToSave === 0) { months = 0; }
    else if (monthly > 0) { months = Math.ceil(stillToSave / monthly); }
    if (months != null) {
      const d = new Date(); d.setMonth(d.getMonth() + months);
      readyBy = d.toISOString().slice(0, 10);
      vsTarget = readyBy <= h.targetDate ? 'ON TRACK' : 'BEHIND';
    }
    const income = incomeTotal();
    return {
      down, loan, pi, tax, ins, pmi, piti, closing, cashToClose,
      stillToSave, months, readyBy, vsTarget,
      pctIncome: income ? piti / income : null
    };
  }

  function weddingRemaining() {
    return data.wedding.vendors.reduce((s, v) => s + (v.paid ? 0 : (+v.amount || 0)), 0);
  }

  /* Total saved vs. total target across every savings goal (house, Roth, emergency, etc.) —
     the single rollup number for "how are we doing overall". Frozen buckets keep their
     saved balance in the total (it's real money) but drop out of target/monthly so a
     frozen "someday" goal doesn't dilute the push toward what's active right now. */
  function goalsProgress() {
    const active = data.goals.filter(g => !g.isFrozen);
    const saved = data.goals.reduce((s, g) => s + (+g.saved || 0), 0);
    const target = active.reduce((s, g) => s + (+g.target || 0), 0);
    const monthly = active.reduce((s, g) => s + (+g.monthly || 0), 0);
    const frozenMonthly = data.goals.filter(g => g.isFrozen).reduce((s, g) => s + (+g.monthly || 0), 0);
    return { saved, target, monthly, frozenMonthly, pct: target > 0 ? Math.min(1, saved / target) : 0 };
  }

  /* Rules-based alerts surfaced on the Dashboard: budget overruns, goals outpacing
     surplus, house plan falling behind its target date, upcoming wedding payments,
     and milestones worth celebrating. Sorted worst-first, capped so it stays scannable. */
  function insights() {
    const out = [];
    const month = thisMonth();
    const budget = budgetTotal();
    const spentThisMonth = txInMonth(month).reduce((s, t) => s + (+t.amount || 0), 0);
    const surplusVal = surplus();

    if (surplusVal < 0) {
      out.push({ tone: 'bad', text: `You're spending ${fmt$(-surplusVal, 0)} more than you earn this month.`, href: '#/budget' });
    }
    if (budget > 0 && spentThisMonth > budget) {
      out.push({ tone: 'bad', text: `You're ${fmt$(spentThisMonth - budget, 0)} over budget for ${fmtMonth(month)}.`, href: `#/transactions?month=${month}` });
    }
    const committed = data.goals.filter(g => !g.isFrozen).reduce((s, g) => s + (+g.monthly || 0), 0);
    const after = surplusVal - committed;
    if (after < 0) {
      out.push({ tone: 'warn', text: `Goal contributions exceed your monthly surplus by ${fmt$(-after, 0)}.`, href: '#/goals' });
    }
    const houseGoal = data.goals.find(g => g.isHouse);
    const primaryScenario = data.house.scenarios[0];
    if (houseGoal && primaryScenario) {
      const hs = houseScenario(primaryScenario);
      if (hs.vsTarget === 'BEHIND') {
        out.push({ tone: 'warn', text: `House Plan (${primaryScenario.label}) is on pace for ${fmtDate(hs.readyBy)}, behind your ${fmtDate(data.house.targetDate)} target.`, href: '#/house' });
      }
    }
    const txHref = params => '#/transactions?' + new URLSearchParams(params).toString();
    for (const tr of categoryTrends(month).slice(0, 2)) {
      out.push({
        tone: 'warn',
        text: `${tr.category} is pacing ${Math.round((tr.ratio - 1) * 100)}% above its 3-month average (${fmt$(tr.projected, 0)} projected vs ${fmt$(tr.avg, 0)} typical).`,
        href: txHref({ month, category: tr.category })
      });
    }
    for (const c of priceCreeps().slice(0, 2)) {
      out.push({
        tone: 'warn',
        text: `${c.merchant} went up: ${fmt$(c.from, 2)} → ${fmt$(c.to, 2)}/mo.`,
        href: txHref({ q: c.merchant })
      });
    }
    for (const s of subscriptionNudges().slice(0, 2)) {
      out.push({
        tone: 'info',
        text: `${s.merchant} has been ${fmt$(s.amount, 2)}/mo for ${s.months}+ months — still worth it?`,
        href: txHref({ q: s.merchant }),
        reviewKey: s.key
      });
    }
    const u = unusualTx(month)[0];
    if (u) {
      out.push({
        tone: 'info',
        text: `Unusually large for ${u.category}: ${u.description || '(no description)'} at ${fmt$(u.amount, 0)}.`,
        href: txHref({ month, category: u.category })
      });
    }

    if (month === thisMonth()) {
      const sched = monthSchedule(month).filter(i => i.kind === 'bill');
      const overdueBills = sched.filter(i => i.status === 'overdue');
      if (overdueBills.length) {
        out.push({
          tone: 'bad',
          text: `${overdueBills.length} bill${overdueBills.length === 1 ? ' is' : 's are'} past due and not posted (${overdueBills.map(i => i.name).join(', ')}).`,
          href: '#/calendar'
        });
      }
      const dueSoonBills = sched.filter(i => i.status === 'soon');
      if (dueSoonBills.length) {
        out.push({
          tone: 'warn',
          text: `${dueSoonBills.length} bill${dueSoonBills.length === 1 ? '' : 's'} due this week — ${fmt$(dueSoonBills.reduce((s, i) => s + i.amount, 0), 0)} (${dueSoonBills.slice(0, 3).map(i => i.name).join(', ')}${dueSoonBills.length > 3 ? '…' : ''}).`,
          href: '#/calendar'
        });
      }
      if (Object.keys(data.snapshots).length) {
        const fc = forecast(12);
        const firstBad = fc.months.find(m => m.tone === 'bad');
        const firstWarn = fc.months.find(m => m.tone === 'warn');
        if (firstBad) {
          out.push({ tone: 'warn', text: `Cash-flow forecast goes negative in ${fmtMonth(firstBad.ym)} (${fmt$(firstBad.balance, 0)}).`, href: '#/forecast' });
        } else if (firstWarn) {
          out.push({ tone: 'info', text: `${fmtMonth(firstWarn.ym)} looks tight — projected liquid balance ${fmt$(firstWarn.balance, 0)}.`, href: '#/forecast' });
        }
        if (!data.snapshots[month]) {
          out.push({ tone: 'info', text: 'Account balances haven’t been updated this month — two minutes keeps net worth honest.', href: '#/networth' });
        }
      }

      const last = prevMonth(month);
      if (txInMonth(last).length && !data.closes[last]) {
        out.push({
          tone: 'info',
          text: `${fmtMonth(last)} isn't closed yet — run the five-minute month-end close.`,
          href: '#/calendar?close=' + last
        });
      }
    }

    const soonCutoff = new Date(); soonCutoff.setDate(soonCutoff.getDate() + 14);
    const dueSoon = data.wedding.vendors.filter(v => !v.paid && v.due && new Date(v.due) <= soonCutoff && (+v.amount || 0) > 0);
    if (dueSoon.length) {
      out.push({ tone: 'warn', text: `${dueSoon.length} wedding vendor payment${dueSoon.length === 1 ? '' : 's'} due within 2 weeks (${dueSoon.map(v => v.vendor).join(', ')}).`, href: '#/wedding' });
    }
    const weddingTotal = data.wedding.vendors.reduce((s, v) => s + (+v.amount || 0), 0);
    if (weddingTotal > 0 && weddingRemaining() === 0) {
      out.push({ tone: 'good', text: 'Wedding is fully paid off 🎉 — that budget now flows to the House Plan.', href: '#/house' });
    }
    data.goals.forEach(g => {
      if ((+g.target || 0) > 0 && (+g.saved || 0) >= (+g.target || 0)) {
        out.push({ tone: 'good', text: `${g.name} is fully funded 🎉`, href: '#/goals' });
      }
    });
    (data.members || []).forEach(person => {
      const m = rothMeta(person);
      if (m.limit > 0 && m.remaining === 0) {
        out.push({ tone: 'good', text: `Roth IRA — ${person} is maxed for ${data.invest.rothYear} 🎉`, href: '#/invest' });
      }
    });

    const order = { bad: 0, warn: 1, good: 2, info: 3 };
    out.sort((a, b) => order[a.tone] - order[b.tone]);
    return out.slice(0, 8);
  }

  /* One current-state snapshot the Dashboard, Executive Summary and Monthly
     Report all read from, instead of each recomputing the same figures three
     ways. Month-parameterized (defaults to the current month) so the historical
     Report can ask for a past month. `insights` is a memoized lazy getter — the
     Report never reads it, so that heavier computation isn't paid for there. */
  function householdSnapshot(ym) {
    ym = ym || thisMonth();
    const nw = netWorthSeries();
    const debts = data.accounts.filter(a => a.kind === 'debt');
    const snap = {
      month: ym,
      summary: monthSummary(ym),
      safeToSpend: safeToSpend(ym),
      surplus: surplus(),
      savingsRate: savingsRate(),
      goals: goalsProgress(),
      netWorth: {
        series: nw,
        latest: nw.length ? nw[nw.length - 1] : null,
        prev: nw.length > 1 ? nw[nw.length - 2] : null
      },
      wedding: {
        remaining: weddingRemaining(),
        date: data.wedding.date,
        vendorCount: data.wedding.vendors.length
      },
      debt: {
        accounts: debts.length,
        total: debts.reduce((s, a) => s + (latestBalance(a.id) || 0), 0)
      }
    };
    let cachedInsights;
    Object.defineProperty(snap, 'insights', {
      enumerable: true, configurable: true,
      get() { return cachedInsights || (cachedInsights = insights()); }
    });
    return snap;
  }

  /* ---------- answers at a glance ---------- */

  function daysInMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }
  /* How far through the month we are: 1 for past months, 0 for future ones. */
  function monthPace(ym) {
    const now = thisMonth();
    if (ym < now) return 1;
    if (ym > now) return 0;
    return Math.min(1, new Date().getDate() / daysInMonth(ym));
  }

  /* Envelope rollover: a Discretionary line can opt in to carrying its
     unspent (or overspent) balance into next month instead of resetting to
     the flat monthly figure. rolloverBalances is a running tally per line,
     updated only at month close — effectiveBudget is what's actually
     available THIS month once that carry is added on top. */
  function effectiveBudget(b) {
    return (+b.monthly || 0) + (b.rolloverEnabled ? (data.rolloverBalances[b.id] || 0) : 0);
  }
  function rolloverAdjustmentTotal() {
    let t = 0;
    for (const b of data.budget) {
      if (b.type === 'Discretionary' && b.rolloverEnabled) t += (data.rolloverBalances[b.id] || 0);
    }
    return t;
  }

  /* THE number: what's genuinely left to spend this month — budget (plus any
     envelope rollover), minus what has posted, minus Fixed bills that haven't
     hit yet (so rent money never looks spendable just because rent hasn't
     cleared). */
  function safeToSpend(ym) {
    const month = ym || thisMonth();
    const budget = budgetTotal() + rolloverAdjustmentTotal();
    const spent = txInMonth(month).reduce((s, t) => s + (+t.amount || 0), 0);
    const st = budgetLineStatus(month);
    let upcoming = 0, upcomingCount = 0;
    for (const b of data.budget) {
      if (b.type === 'Fixed' && st[b.id] && !st[b.id].posted) {
        upcoming += (+b.monthly || 0); upcomingCount++;
      }
    }
    return { budget, spent, upcoming, upcomingCount, safe: budget - spent - upcoming };
  }

  /* Average spend per category across the up-to-N months with data before ym. */
  function avgSpendByCategory(ym, n) {
    const prior = monthsWithData().filter(m => m < ym).slice(-(n || 3));
    const map = {};
    if (!prior.length) return { map, months: 0 };
    for (const m of prior) {
      const s = spendByCategory(m);
      for (const c in s) map[c] = (map[c] || 0) + s[c];
    }
    for (const c in map) map[c] /= prior.length;
    return { map, months: prior.length };
  }

  /* Categories running above their own recent average, pace-adjusted so the
     15th of the month is compared against half a normal month, not a full one. */
  function categoryTrends(ym) {
    const pace = monthPace(ym);
    if (pace < 0.25) return []; // too early in the month to project meaningfully
    const { map: avg, months } = avgSpendByCategory(ym, 3);
    if (!months) return [];
    const cur = spendByCategory(ym);
    const out = [];
    for (const c in cur) {
      const projected = cur[c] / pace;
      if ((avg[c] || 0) >= 40 && projected > avg[c] * 1.3) {
        out.push({ category: c, projected, avg: avg[c], ratio: projected / avg[c] });
      }
    }
    return out.sort((a, b) => (b.projected - b.avg) - (a.projected - a.avg));
  }

  /* Subscription price creep: a merchant that posts once a month at a STABLE
     price which then jumps. The stable-price requirement (two matching months
     before the increase) keeps once-a-month restaurant visits from being
     mistaken for subscriptions. */
  function priceCreeps() {
    const byKey = {};
    for (const t of data.transactions) {
      const key = merchantKey(t.description);
      if (!key) continue;
      const ym = t.date.slice(0, 7);
      (byKey[key] = byKey[key] || {})[ym] = (byKey[key][ym] || []).concat(+t.amount || 0);
    }
    const out = [];
    for (const key in byKey) {
      const months = Object.keys(byKey[key]).sort();
      if (months.length < 3) continue;
      const [m1, m2, m3] = months.slice(-3);
      const a = byKey[key][m1], b = byKey[key][m2], c = byKey[key][m3];
      if (a.length !== 1 || b.length !== 1 || c.length !== 1) continue; // once-a-month charges only
      const stable = Math.abs(a[0] - b[0]) <= Math.max(0.5, b[0] * 0.01);
      if (stable && c[0] - b[0] >= 1 && c[0] >= b[0] * 1.03) {
        out.push({ merchant: prettyMerchant(key), from: b[0], to: c[0] });
      }
    }
    return out.sort((x, y) => (y.to - y.from) - (x.to - x.from));
  }

  /* Subscriptions that have charged the same stable price for 6+ straight
     months — not a problem like priceCreeps, just old enough to deserve an
     occasional "still worth it?" glance instead of renewing silently forever.
     A merchant drops off the list once reviewed, until it charges again. */
  function subscriptionNudges() {
    const byKey = {};
    for (const t of data.transactions) {
      const key = merchantKey(t.description);
      if (!key) continue;
      const ym = t.date.slice(0, 7);
      (byKey[key] = byKey[key] || {})[ym] = (byKey[key][ym] || []).concat(+t.amount || 0);
    }
    const reviewed = data.subReviewed || {};
    const out = [];
    for (const key in byKey) {
      const months = Object.keys(byKey[key]).sort();
      if (months.length < 6) continue;
      const last6 = months.slice(-6);
      const amounts = last6.map(m => byKey[key][m]);
      if (amounts.some(a => a.length !== 1)) continue; // once-a-month charges only
      const vals = amounts.map(a => a[0]);
      const stable = vals.every(v => Math.abs(v - vals[0]) <= Math.max(0.5, vals[0] * 0.01));
      if (!stable) continue;
      const lastCharge = months[months.length - 1];
      if (reviewed[key] && reviewed[key] >= lastCharge) continue;
      out.push({ key, merchant: prettyMerchant(key), amount: vals[vals.length - 1], months: months.length });
    }
    return out.sort((a, b) => b.months - a.months);
  }
  function markSubscriptionReviewed(key) {
    data.subReviewed = data.subReviewed || {};
    data.subReviewed[key] = thisMonth();
    save();
  }

  /* Unusually large transactions this month: well above the category's own
     typical transaction size over the prior 3 months. */
  function unusualTx(ym) {
    const prior = monthsWithData().filter(m => m < ym).slice(-3);
    if (!prior.length) return [];
    const sums = {}, counts = {};
    for (const m of prior) {
      for (const t of txInMonth(m)) {
        sums[t.category] = (sums[t.category] || 0) + (+t.amount || 0);
        counts[t.category] = (counts[t.category] || 0) + 1;
      }
    }
    return txInMonth(ym).filter(t => {
      const n = counts[t.category];
      if (!n) return false;
      const avg = sums[t.category] / n;
      return (+t.amount || 0) >= 100 && (+t.amount || 0) > avg * 2.5;
    }).sort((a, b) => (+b.amount || 0) - (+a.amount || 0));
  }

  const PAY_FREQUENCIES = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
  function rothMeta(person) {
    const inv = data.invest;
    const limit = +inv.rothLimit || 0;
    const ytd = +inv.roth[person] || 0;
    const remaining = Math.max(0, limit - ytd);
    const now = new Date();
    const monthsLeft = now.getFullYear() <= inv.rothYear
      ? Math.max(1, 12 - now.getMonth()) : 1;
    const monthlyToMax = remaining / monthsLeft;
    const payFrequency = inv.payFrequency || 'biweekly';
    const perPaycheckToMax = monthlyToMax * 12 / (PAY_FREQUENCIES[payFrequency] || 26);
    return { limit, ytd, remaining, monthlyToMax, monthsLeft, perPaycheckToMax, payFrequency };
  }
  function hysaProjection(apyPct, months) {
    const { balance, deposit } = data.invest.hysa;
    const i = apyPct / 100 / 12;
    if (i === 0) return (+balance || 0) + (+deposit || 0) * months;
    return (+balance || 0) * Math.pow(1 + i, months) +
      (+deposit || 0) * (Math.pow(1 + i, months) - 1) / i;
  }

