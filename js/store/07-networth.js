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
    const d = addMonths(new Date(), months);
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
     extra fits inside the current monthly surplus.

     A debt with no payment on file makes debtPayoff() return months: null for
     THAT debt, at every multiplier, since a multiplier can't act on a $0
     base. That used to blank the whole household's summary — one payment-free
     debt silently erased a payoff date the others alone could answer. Now it's
     excluded from monthsMax/interestTotal and named in `excluded`, so the
     summary is a genuine partial answer instead of a false "unknown". Only
     when EVERY debt is excluded does the summary itself read null. */
  function debtStrategiesSummary() {
    const debts = data.accounts.filter(a => a.kind === 'debt' && (latestBalance(a.id) || 0) > 0);
    const room = Math.max(0, surplus());
    return DEBT_STRATEGIES.map(s => {
      let extraTotal = 0, interestTotal = 0, monthsMax = null;
      const excluded = [];
      debts.forEach(a => {
        const strat = debtStrategies(a).find(x => x.key === s.key);
        extraTotal += strat.extra;
        if (strat.months == null) { excluded.push(a.name); return; }
        monthsMax = monthsMax == null ? strat.months : Math.max(monthsMax, strat.months);
        interestTotal += strat.interest || 0;
      });
      const known = debts.length - excluded.length;
      let date = null;
      if (monthsMax != null) {
        const d = addMonths(new Date(), monthsMax);
        date = d.toISOString().slice(0, 10);
      }
      return {
        key: s.key, label: s.label, extraTotal,
        months: monthsMax, interest: known > 0 ? interestTotal : null, date,
        affordable: extraTotal <= room,
        excluded
      };
    });
  }

  /* Non-optimizing payoff-order hints for households with 2+ debts: snowball
     (smallest balance first, for momentum) and avalanche (highest rate first,
     cheapest overall). A scannable list, not a scheduler.

     Avalanche needs a real rate to rank on. `rate == null` means "not
     recorded"; it is not the same claim as a typed-in 0%, and treating it
     that way sorts an unrated debt to the bottom as if it were confirmed
     cheapest — exactly backwards for the account most likely to have no APR
     on file, which in practice tends to carry the household's highest rate.
     Rated debts are still ranked highest-rate-first; unrated ones are
     returned separately rather than given a guessed position, so nothing
     claims a rate-based order for a debt with no rate. */
  function debtPayoffOrder() {
    const debts = data.accounts.filter(a => a.kind === 'debt' && (latestBalance(a.id) || 0) > 0);
    const snowball = [...debts].sort((a, b) => (latestBalance(a.id) || 0) - (latestBalance(b.id) || 0));
    const rated = debts.filter(a => a.rate != null);
    const avalancheUnranked = debts.filter(a => a.rate == null);
    const avalanche = [...rated].sort((a, b) => (+b.rate || 0) - (+a.rate || 0));
    return { snowball, avalanche, avalancheUnranked };
  }

  /* Rolling payoff simulation for an ordered list of debts: each debt keeps
     its own minimum payment, but the current target (first unpaid, in the
     given order) also gets `extra` plus every payment freed up by a debt
     that's already hit zero — the actual snowball/avalanche mechanic, not
     just independent per-debt math. Capped at 50 years as a safety valve for
     a payment that can't realistically clear the balance.

     The extra-payment pool (`extra` plus every freed minimum) cascades
     within the same month: if the target clears with pool left over, the
     remainder goes to the next unpaid debt in order rather than sitting
     idle until next month. Without this, a target that finishes small
     (relative to the pool) wastes the difference every month it happens —
     `pool -= (pay - it.payment)` is what carries it forward: for the debt
     actually absorbing pool money, `pay - it.payment` is exactly how much
     of the pool it used, so the rest keeps flowing down the list; for a
     later debt whose own minimum happens to exceed what it still owes,
     the same subtraction hands its unused minimum back into the pool too,
     which is the correct, slightly deeper version of the same rule. */
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
      let pool = extra + freed;
      for (const it of items) {
        if (it.balance <= 0) continue;
        const pay = Math.min(it.payment + pool, it.balance);
        pool -= (pay - it.payment);
        it.balance -= pay;
        if (it.balance <= 0.005) { it.balance = 0; freed += it.payment; order.push({ name: it.name, month: months }); }
      }
    }
    const d = addMonths(new Date(), months);
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
      // Unranked (no-rate) debts still owe their own minimum every month —
      // the simulation needs all of them — they just go last in line for
      // extra dollars, since nothing here claims to know they're cheapest.
      avalanche: debtRollupPlan(order.avalanche.concat(order.avalancheUnranked), +extra || 0)
    };
  }

  /* Net liquid cash flow for one month: take-home income minus recurring
     budget, Roth contributions (money that leaves liquid for investment),
     and planned one-offs. Moving money into savings goals stays liquid
     (checking → HYSA), so goal contributions are context, not an outflow.
     Factored out of forecast() so estimatedBalance() can roll a single
     checking-type account forward by the exact same math instead of
     re-deriving it — one definition of "what moves the liquid pool," not
     two that can quietly drift apart. */
  function liquidCashFlow(ym, rothMonthly, extraPlanned) {
    const planned = data.planned.reduce((s, p) =>
      s + (p.month === ym ? (+p.amount || 0) : 0), 0)
      + (extraPlanned && extraPlanned.month === ym ? +extraPlanned.amount : 0);
    const delta = incomeTotal() - budgetTotal() - rothMonthly - planned;
    return { planned, delta };
  }
  /* Modeled recurring Roth outflow for the forecast/estimate cash-flow math:
     the monthly contribution the household actually stated, per member, on
     the Investments screen. A member who hasn't stated one contributes $0
     here — NOT rothMeta().monthlyToMax, which used to stand in for it.
     monthlyToMax answers a different question ("what would it take to max the
     account by December") and is date-driven rather than plan-driven: it
     grows every month as the year runs out, then jams at a permanently
     inflated number once the year turns, because monthsLeft floors at 1 with
     no recovery. Sampled once and applied to all twelve forecast months, that
     swing (and eventual permanent error) reads as a real change in the
     household's finances when nothing changed but the calendar. monthlyToMax
     is still the right number for the Investments screen's "maxes it by
     December" line — a labeled what-if, not a modeled cash outflow — so it
     stays exactly where it is; it just doesn't belong here. An unstated
     contribution is instead surfaced once, honestly, by
     rothContributionIssues(). */
  function activeRothMonthly() {
    return (data.members || []).reduce((s, n) => s + rothMeta(n).monthly, 0);
  }

  /* Members with Roth room left but no stated monthly contribution, so the
     forecast's $0 for them is visible rather than a silently rosier number. */
  function rothContributionIssues() {
    return (data.members || []).filter(n => {
      const m = rothMeta(n);
      return m.remaining > 0 && !m.monthly;
    });
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
      const { planned, delta } = liquidCashFlow(ym, rothMonthly, opts.extraPlanned);
      bal += delta;
      out.push({
        ym, delta, balance: bal, planned,
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

  /* ---------- statement reconciliation ---------- */

  /* Compares a balance a household typed in (from a bank statement, or just
     "what the app shows right now") against what the account's own balance
     model already predicts, and — only when they disagree by more than a
     rounding dollar — explains the gap in the same terms that model already
     uses, rather than a new transaction-matching engine: t.account is
     freeform text a household types per row, not a foreign key into
     data.accounts, so attributing a specific transaction to a specific
     net-worth account isn't information the store actually has. Returns
     `expected: null` (never a mismatch) when there's nothing to compare
     against yet — that's a first balance being recorded, not a discrepancy. */
  function reconcileAccount(accountId, actual, ym) {
    const acct = data.accounts.find(a => a.id === accountId);
    if (!acct) return null;
    const act = Math.round((+actual || 0) * 100) / 100;
    const est = estimatedBalance(accountId);
    const expected = est ? est.balance : latestBalance(accountId);
    if (expected == null) return { accountId, actual: act, expected: null, diff: null, matched: true, causes: [] };
    const diff = Math.round((act - expected) * 100) / 100;
    const matched = Math.abs(diff) < 1; // under a dollar isn't worth explaining
    const causes = [];
    if (!matched) {
      if (acct.kind === 'debt') {
        causes.push(diff < 0
          ? `Lower than the modeled ${fmt$(acct.payment, 0)}/mo payoff — an extra payment would explain it.`
          : `Higher than the modeled ${fmt$(acct.payment, 0)}/mo payoff — check for a missed or partial payment${
              acct.rate != null ? `, or whether the ${acct.rate}% rate on file is still current` : ', or add this debt’s APR — none is on file yet'}.`);
      } else if (acct.type === 'Savings') {
        const apy = (data.invest.hysa.apys && data.invest.hysa.apys[1]) || 0;
        causes.push(diff > 0
          ? `Higher than modeled at the ${apy}% Base APY scenario — the real rate may be running higher, or an extra deposit landed.`
          : `Lower than modeled at the ${apy}% Base APY scenario — the real rate may be running lower, or a deposit didn't land.`);
      } else if (acct.type === 'Checking') {
        const spent = txInMonth(ym).reduce((s, t) => s + (+t.amount || 0), 0);
        const spendDiff = Math.round((spent - budgetTotal()) * 100) / 100;
        if (Math.abs(spendDiff) >= 1) {
          causes.push(spendDiff > 0
            ? `Actual spending this month is running ${fmt$(spendDiff, 0)} over the ${fmt$(budgetTotal(), 0)} budgeted — that alone could cover the gap.`
            : `Actual spending this month is running ${fmt$(Math.abs(spendDiff), 0)} under the ${fmt$(budgetTotal(), 0)} budgeted.`);
        }
        causes.push('The model pools every Checking/Savings account into one balance (the same simplification Forecast uses), so more than one liquid account will show some spread here regardless.');
      }
      if (!causes.length) causes.push('No specific cause stands out from what the app tracks — worth a quick look at recent transactions.');
    }
    return { accountId, actual: act, expected, diff, matched, causes, source: est ? 'estimate' : 'snapshot' };
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
    let badDate = 0, badAmount = 0, badCat = 0, badWho = 0, badSplit = 0;
    const who = WHO();
    for (const t of data.transactions) {
      if (!dateRe.test(t.date || '')) badDate++;
      if (isNaN(+t.amount)) badAmount++;
      if (!CATEGORIES.includes(t.category)) badCat++;
      if (!who.includes(t.who)) badWho++;
      if (t.splits && t.splits.length) {
        const sumCents = t.splits.reduce((s, p) => s + Math.round((+p.amount || 0) * 100), 0);
        if (sumCents !== Math.round((+t.amount || 0) * 100)) badSplit++;
      }
    }
    if (badDate) issues.push(badDate + ' transaction(s) with an invalid date');
    if (badAmount) issues.push(badAmount + ' transaction(s) with a non-numeric amount');
    if (badCat) issues.push(badCat + ' transaction(s) with a category not on the fixed list');
    if (badWho) issues.push(badWho + ' transaction(s) attributed to someone no longer in the household');
    if (badSplit) issues.push(badSplit + " transaction(s) whose splits don't add up to the total amount");
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
