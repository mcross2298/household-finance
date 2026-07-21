/* ---- net worth, debt payoff, forecast, import batches ---- */
'use strict';

  /* ---------- net worth, debt payoff & cash-flow forecast ---------- */

  /* Latest known balance for an account at or before a month, carrying the most
     recent snapshot forward so one missed month doesn't zero an account. */
  function balanceAt(accountId, ym) {
    const months = Object.keys(data.snapshots).filter(m => m <= ym).sort();
    for (let i = months.length - 1; i >= 0; i--) {
      const snap = data.snapshots[months[i]];
      if (snap && snap[accountId] != null) return +snap[accountId];
    }
    return null;
  }
  function latestBalance(accountId) {
    return balanceAt(accountId, '9999-12');
  }
  /* Net worth per snapshot month: assets − debts, balances carried forward. */
  function netWorthSeries() {
    const months = Object.keys(data.snapshots).sort();
    return months.map(ym => {
      let assets = 0, debts = 0;
      for (const a of data.accounts) {
        const b = balanceAt(a.id, ym);
        if (b == null) continue;
        if (a.kind === 'debt') debts += b; else assets += b;
      }
      return { ym, assets, debts, net: assets - debts };
    });
  }
  function saveSnapshot(ym, balances) {
    data.snapshots[ym] = Object.assign({}, data.snapshots[ym] || {}, balances);
    save();
  }

  /* Amortized payoff at a fixed monthly payment: months to zero, payoff date,
     total interest. extra rides on top of the regular payment. */
  function debtPayoff(account, extra, rateOverride) {
    const B = latestBalance(account.id);
    const P = (+account.payment || 0) + (+extra || 0);
    if (B == null || B <= 0) return { months: 0, date: null, interest: 0, balance: B };
    if (P <= 0) return { months: null, date: null, interest: null, balance: B };
    const i = (rateOverride != null ? +rateOverride : (+account.rate || 0)) / 100 / 12;
    let months, interest;
    if (i === 0) {
      months = Math.ceil(B / P);
      interest = 0;
    } else if (P <= B * i) {
      return { months: null, date: null, interest: null, balance: B }; // payment doesn't cover interest
    } else {
      months = Math.ceil(-Math.log(1 - i * B / P) / Math.log(1 + i));
      // the last payment is partial — total paid = (n−1) full payments + payoff
      const grow = Math.pow(1 + i, months - 1);
      const remaining = Math.max(0, B * grow - P * (grow - 1) / i);
      interest = Math.max(0, P * (months - 1) + remaining * (1 + i) - B);
    }
    const d = new Date(); d.setMonth(d.getMonth() + months);
    return { months, date: d.toISOString().slice(0, 10), interest, balance: B };
  }

  /* Conservative/Base/Aggressive payoff comparison for one debt: minimum payment,
     1.5x, and 2x, each run through debtPayoff so the math stays identical to the
     Net Worth what-if slider. */
  function debtStrategies(account) {
    const base = +account.payment || 0;
    return DEBT_STRATEGIES.map(s => {
      const payment = base * s.multiplier;
      const extra = payment - base;
      return Object.assign({ payment, extra }, s, debtPayoff(account, extra));
    });
  }

  /* Household-wide rollup per strategy: total extra $/mo required across every
     debt with a balance, the slowest debt's payoff month (debts run in parallel
     at that strategy, not snowballed), total interest left, and whether the
     extra fits inside the current monthly surplus. */
  function debtStrategiesSummary() {
    const debts = data.accounts.filter(a => a.kind === 'debt' && (latestBalance(a.id) || 0) > 0);
    const room = Math.max(0, surplus());
    return DEBT_STRATEGIES.map(s => {
      let extraTotal = 0, interestTotal = 0, monthsMax = null, unknown = false;
      debts.forEach(a => {
        const strat = debtStrategies(a).find(x => x.key === s.key);
        extraTotal += strat.extra;
        if (strat.months == null) { unknown = true; return; }
        monthsMax = monthsMax == null ? strat.months : Math.max(monthsMax, strat.months);
        interestTotal += strat.interest || 0;
      });
      let date = null;
      if (!unknown && monthsMax != null) {
        const d = new Date(); d.setMonth(d.getMonth() + monthsMax);
        date = d.toISOString().slice(0, 10);
      }
      return {
        key: s.key, label: s.label, extraTotal,
        months: unknown ? null : monthsMax, interest: unknown ? null : interestTotal, date,
        affordable: extraTotal <= room
      };
    });
  }

  /* Non-optimizing payoff-order hints for households with 2+ debts: snowball
     (smallest balance first, for momentum) and avalanche (highest rate first,
     cheapest overall). A scannable list, not a scheduler. */
  function debtPayoffOrder() {
    const debts = data.accounts.filter(a => a.kind === 'debt' && (latestBalance(a.id) || 0) > 0);
    const snowball = [...debts].sort((a, b) => (latestBalance(a.id) || 0) - (latestBalance(b.id) || 0));
    const avalanche = [...debts].sort((a, b) => (+b.rate || 0) - (+a.rate || 0));
    return { snowball, avalanche };
  }

  /* Rolling payoff simulation for an ordered list of debts: each debt keeps
     its own minimum payment, but the current target (first unpaid, in the
     given order) also gets `extra` plus every payment freed up by a debt
     that's already hit zero — the actual snowball/avalanche mechanic, not
     just independent per-debt math. Capped at 50 years as a safety valve for
     a payment that can't realistically clear the balance. */
  function debtRollupPlan(orderedDebts, extra) {
    const items = orderedDebts
      .map(a => ({ name: a.name, balance: latestBalance(a.id) || 0, rate: (+a.rate || 0) / 100 / 12, payment: +a.payment || 0 }))
      .filter(x => x.balance > 0);
    if (!items.length) return { months: 0, interest: 0, date: null, order: [] };
    let months = 0, interest = 0, freed = 0;
    const order = [];
    const MAX_MONTHS = 600;
    while (items.some(x => x.balance > 0) && months < MAX_MONTHS) {
      months++;
      for (const it of items) {
        if (it.balance <= 0) continue;
        const monthInterest = it.balance * it.rate;
        interest += monthInterest;
        it.balance += monthInterest;
      }
      const target = items.find(x => x.balance > 0);
      for (const it of items) {
        if (it.balance <= 0) continue;
        const pay = Math.min(it === target ? it.payment + extra + freed : it.payment, it.balance);
        it.balance -= pay;
        if (it.balance <= 0.005) { it.balance = 0; freed += it.payment; order.push({ name: it.name, month: months }); }
      }
    }
    const d = new Date(); d.setMonth(d.getMonth() + months);
    return { months, interest, date: d.toISOString().slice(0, 10), order };
  }
  /* Side-by-side snowball vs. avalanche, with a shared extra-payment pool so
     the comparison is apples-to-apples: same total dollars, different order. */
  function debtPayoffOrderComparison(extra) {
    const debts = data.accounts.filter(a => a.kind === 'debt' && (latestBalance(a.id) || 0) > 0);
    if (debts.length < 2) return null;
    const order = debtPayoffOrder();
    return {
      snowball: debtRollupPlan(order.snowball, +extra || 0),
      avalanche: debtRollupPlan(order.avalanche, +extra || 0)
    };
  }

  /* 12-month liquid-cash projection. Start = latest Checking+Savings balances.
     Each month: + take-home income − recurring budget − Roth contributions
     (money that leaves liquid for investment) − wedding payments due − planned
     one-offs. Moving money into savings goals stays liquid (checking → HYSA),
     so goal contributions are context, not an outflow. */
  function forecast(monthsAhead, opts) {
    opts = opts || {};
    const n = monthsAhead || 12;
    const start = data.accounts
      .filter(a => a.kind === 'asset' && (a.type === 'Checking' || a.type === 'Savings'))
      .reduce((s, a) => s + (latestBalance(a.id) || 0), 0);
    const income = incomeTotal();
    const budget = budgetTotal();
    const rothMonthly = (data.members || []).reduce((s, n) => s + rothMeta(n).monthlyToMax, 0);
    const out = [];
    let ym = thisMonth();
    let bal = start;
    for (let k = 0; k < n; k++) {
      const wedding = data.wedding.vendors.reduce((s, v) =>
        s + (!v.paid && v.due && v.due.slice(0, 7) === ym ? (+v.amount || 0) : 0), 0);
      const planned = data.planned.reduce((s, p) =>
        s + (p.month === ym ? (+p.amount || 0) : 0), 0)
        + (opts.extraPlanned && opts.extraPlanned.month === ym ? +opts.extraPlanned.amount : 0);
      const delta = income - budget - rothMonthly - wedding - planned;
      bal += delta;
      out.push({
        ym, delta, balance: bal, wedding, planned,
        tone: bal < 0 ? 'bad' : bal < budget ? 'warn' : 'ok' // under one month of budget = tight
      });
      ym = nextMonth(ym);
    }
    return { start, income, budget, rothMonthly, months: out };
  }

  /* Import batches: every commit is recorded so a bad import (wrong file, wrong
     month, double drop) reverses in one tap instead of row-by-row deletes. */
  function addImportBatch(source, txIds) {
    data.importBatches.unshift({ id: uid(), ts: new Date().toISOString(), source: String(source || 'import'), txIds });
    data.importBatches = data.importBatches.slice(0, 10); // metadata only — keep it tidy
  }
  function undoImportBatch(id) {
    const b = data.importBatches.find(x => x.id === id);
    if (!b) return 0;
    const ids = new Set(b.txIds);
    const before = data.transactions.length;
    data.transactions = data.transactions.filter(t => !ids.has(t.id));
    data.importBatches = data.importBatches.filter(x => x.id !== id);
    touchTransactions(); save();
    return before - data.transactions.length;
  }

