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

  /* Net liquid cash flow for one month: take-home income minus recurring
     budget, Roth contributions (money that leaves liquid for investment),
     wedding payments due, and planned one-offs. Moving money into savings
     goals stays liquid (checking → HYSA), so goal contributions are context,
     not an outflow. Factored out of forecast() so estimatedBalance() can
     roll a single checking-type account forward by the exact same math
     instead of re-deriving it — one definition of "what moves the liquid
     pool," not two that can quietly drift apart. */
  function liquidCashFlow(ym, rothMonthly, extraPlanned) {
    const wedding = data.wedding.vendors.reduce((s, v) =>
      s + (!v.paid && v.due && v.due.slice(0, 7) === ym ? (+v.amount || 0) : 0), 0);
    const planned = data.planned.reduce((s, p) =>
      s + (p.month === ym ? (+p.amount || 0) : 0), 0)
      + (extraPlanned && extraPlanned.month === ym ? +extraPlanned.amount : 0);
    const delta = incomeTotal() - budgetTotal() - rothMonthly - wedding - planned;
    return { wedding, planned, delta };
  }
  function activeRothMonthly() {
    return (data.members || []).reduce((s, n) => s + rothMeta(n).monthlyToMax, 0);
  }

  /* 12-month liquid-cash projection. Start = latest Checking+Savings balances. */
  function forecast(monthsAhead, opts) {
    opts = opts || {};
    const n = monthsAhead || 12;
    const start = data.accounts
      .filter(a => a.kind === 'asset' && (a.type === 'Checking' || a.type === 'Savings'))
      .reduce((s, a) => {
        const est = estimatedBalance(a.id);
        return s + (est ? est.balance : (latestBalance(a.id) || 0));
      }, 0);
    const income = incomeTotal();
    const budget = budgetTotal();
    const rothMonthly = activeRothMonthly();
    const out = [];
    let ym = thisMonth();
    let bal = start;
    for (let k = 0; k < n; k++) {
      const { wedding, planned, delta } = liquidCashFlow(ym, rothMonthly, opts.extraPlanned);
      bal += delta;
      out.push({
        ym, delta, balance: bal, wedding, planned,
        tone: bal < 0 ? 'bad' : bal < budget ? 'warn' : 'ok' // under one month of budget = tight
      });
      ym = nextMonth(ym);
    }
    return { start, income, budget, rothMonthly, months: out };
  }

  /* Roll a snapshot forward to estimate today's balance without a fresh
     manual entry — the monthly snapshot ritual becomes confirm-or-correct
     instead of typing every account from scratch. Returns null when there's
     nothing to roll forward from (no prior snapshot) or nothing to roll (the
     last snapshot already covers the current month). Never persisted —
     recomputed on every call, same as everything else derived here.
       - Debt accounts amortize forward with the SAME math debtPayoff() runs
         to a payoff date, just walked partway instead of all the way to zero.
       - The HYSA-type Savings account rolls forward by the paycheck engine's
         own modeled monthly deposit, compounding at its middle ("base") APY
         scenario — one specific number instead of the 3-scenario spread
         hysaProjection() shows on the Investments screen.
       - Other liquid (Checking) accounts roll forward by the same net
         liquid-cash-flow model forecast() already walks 12 months at a time.
         A household with more than one Checking account would have its net
         flow attributed to whichever one is being estimated — the same
         simplification forecast() already makes by pooling every
         Checking/Savings balance into one starting figure.
       - Investment accounts (Roth, etc.) aren't estimated at all: a payroll
         deposit amount says nothing about market performance, so guessing
         here would be actively misleading rather than merely stale. */
  function estimatedBalance(accountId) {
    const acct = data.accounts.find(a => a.id === accountId);
    if (!acct) return null;
    const snapMonths = Object.keys(data.snapshots).filter(m => (data.snapshots[m] || {})[accountId] != null).sort();
    if (!snapMonths.length) return null;
    const lastYm = snapMonths[snapMonths.length - 1];
    const asOfYm = thisMonth();
    if (asOfYm <= lastYm) return null;
    const lastBal = +data.snapshots[lastYm][accountId];

    if (acct.kind === 'debt') {
      const i = (+acct.rate || 0) / 100 / 12;
      const payment = +acct.payment || 0;
      let bal = lastBal;
      for (let ym = nextMonth(lastYm); ym <= asOfYm; ym = nextMonth(ym)) {
        bal = bal * (1 + i) - payment;
        if (bal <= 0) { bal = 0; break; }
      }
      return { balance: Math.round(bal * 100) / 100, since: lastYm, asOf: asOfYm };
    }
    if (acct.type === 'Savings') {
      // This repo has no rule-based paycheck-split engine (see CLAUDE.md) —
      // the monthly deposit is a flat figure the household set directly on
      // Investments, not derived from a dated allocation like
      // Cross-Household-'s hysaMonthlyDeposit(). Same roll-forward shape,
      // different source for "how much goes in each month."
      const apy = (data.invest.hysa.apys && data.invest.hysa.apys[1]) || 0;
      const monthlyRate = apy / 100 / 12;
      const monthlyDeposit = +data.invest.hysa.deposit || 0;
      let bal = lastBal;
      for (let ym = nextMonth(lastYm); ym <= asOfYm; ym = nextMonth(ym)) {
        bal = bal * (1 + monthlyRate) + monthlyDeposit;
      }
      return { balance: Math.round(bal * 100) / 100, since: lastYm, asOf: asOfYm };
    }
    if (acct.type === 'Checking') {
      const rothMonthly = activeRothMonthly();
      let bal = lastBal;
      for (let ym = nextMonth(lastYm); ym <= asOfYm; ym = nextMonth(ym)) {
        bal += liquidCashFlow(ym, rothMonthly).delta;
      }
      return { balance: Math.round(bal * 100) / 100, since: lastYm, asOf: asOfYm };
    }
    return null;
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

  /* ---------- data health ---------- */
  /* Read-only self-check: everything that would silently zero out in a
     spreadsheet or skew a chart. Reported on the Data screen; never
     auto-"fixed" — the app doesn't rewrite your data behind your back. */
  function integrityCheck() {
    const issues = [];
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    let badDate = 0, badAmount = 0, badCat = 0, badWho = 0;
    const who = WHO();
    for (const t of data.transactions) {
      if (!dateRe.test(t.date || '')) badDate++;
      if (isNaN(+t.amount)) badAmount++;
      if (!CATEGORIES.includes(t.category)) badCat++;
      if (!who.includes(t.who)) badWho++;
    }
    if (badDate) issues.push(badDate + ' transaction(s) with an invalid date');
    if (badAmount) issues.push(badAmount + ' transaction(s) with a non-numeric amount');
    if (badCat) issues.push(badCat + ' transaction(s) with a category not on the fixed list');
    if (badWho) issues.push(badWho + ' transaction(s) attributed to someone no longer in the household');
    const badBudget = data.budget.filter(b => isNaN(+b.monthly) || +b.monthly < 0 || !CATEGORIES.includes(b.category)).length;
    if (badBudget) issues.push(badBudget + ' budget line(s) with a bad amount or category');
    const badGoal = data.goals.filter(g => isNaN(+g.target) || isNaN(+g.saved) || +g.saved < 0).length;
    if (badGoal) issues.push(badGoal + ' goal(s) with bad numbers');
    const acctIds = new Set(data.accounts.map(a => a.id));
    let orphanSnaps = 0;
    for (const ym in data.snapshots) {
      for (const id in data.snapshots[ym]) if (!acctIds.has(id)) orphanSnaps++;
    }
    if (orphanSnaps) issues.push(orphanSnaps + ' snapshot balance(s) for deleted accounts (harmless, kept for history)');
    return issues;
  }
