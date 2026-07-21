/* Household Finance — data layer, split into domain files under js/store/.
   All files here share one top-level scope (classic <script> tags in the same
   document share script-global let/const/function bindings — see index.html's
   load order) so every function below can call any other by its bare name,
   exactly as when this was one file. 00-state.js owns the mutable `data`;
   99-export.js must load last since it assembles window.Store and calls
   load(). localStorage is the only persistence. */
'use strict';

  const KEY = 'householdFinance.v1';

  const CATEGORIES = [
    'Housing', 'Utilities', 'Internet & Streaming', 'Insurance', 'Auto',
    'Student Loans', 'Personal Loan', 'Phone', 'Pets', 'Groceries',
    'Dining Out', 'Entertainment', 'Shopping', 'Health & Fitness', 'Travel',
    'Gifts', 'Wedding', 'Savings', 'Other'
  ];
  /* 'Shared' is a reserved pseudo-member meaning "split evenly across everyone".
     Real household members live in data.members; who()/section values are member
     names (or 'Shared'). WHO() returns the full attribution vocabulary for the
     current household — dropdowns, iteration, and CSV all read from it. */
  const SHARED = 'Shared';
  const TYPES = ['Fixed', 'Discretionary'];
  /* Debt account types. 'Loan' is the legacy catch-all already in use by
     seeded accounts; Mortgage/Auto Loan are extensibility stubs for debt
     categories the household doesn't have yet. */
  const DEBT_TYPES = ['Loan', 'Mortgage', 'Auto Loan', 'Credit Card', 'Other'];
  const DEBT_STRATEGIES = [
    { key: 'conservative', label: 'Conservative', multiplier: 1 },
    { key: 'base', label: 'Base', multiplier: 1.5 },
    { key: 'aggressive', label: 'Aggressive', multiplier: 2 }
  ];
  const CSV_HEADER = ['Date', 'Category', 'Description', 'Amount', 'Who', 'Account', 'Notes'];

  const uid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

  /* Minimal starter accounts — used only as a fallback when older restored data
     is missing its accounts registry entirely. Fresh installs get the richer
     demo set built inside seed(). */
  function seedAccounts() {
    const a = (name, kind, type, owner, payment, rate) =>
      ({ id: uid(), name, kind, type, owner, payment: payment || 0, rate: rate || 0 });
    return [
      a('Joint Checking', 'asset', 'Checking', 'Shared'),
      a('High-Yield Savings', 'asset', 'Savings', 'Shared')
    ];
  }

  /* First-run DEMO household — an obviously fictional two-income couple, "Alex &
     Sam", with round made-up numbers that light up every screen so a new user
     sees what "good" looks like. None of this is real. The Data screen's
     "Start fresh" wipes it to an empty household; Reset restores this demo.
     Dates are anchored to the current month/year so the demo never looks stale. */
  function seed() {
    const b = (name, section, category, type, monthly, notes) =>
      ({ id: uid(), name, section, category, type, monthly, notes: notes || '' });
    const acct = (name, kind, type, owner, payment, rate) =>
      ({ id: uid(), name, kind, type, owner, payment: payment || 0, rate: rate || 0 });

    const now = new Date();
    const ym = now.toISOString().slice(0, 7);
    const day = d => ym + '-' + String(d).padStart(2, '0');
    const addMonths = n => new Date(now.getFullYear(), now.getMonth() + n, 15).toISOString().slice(0, 10);
    const year = now.getFullYear();
    const note = 'Demo data — clear it from the Data screen to start fresh';

    const accounts = [
      acct('Joint Checking', 'asset', 'Checking', 'Shared'),
      acct('High-Yield Savings', 'asset', 'Savings', 'Shared'),
      acct('Roth IRA — Alex', 'asset', 'Investment', 'Alex'),
      acct('Roth IRA — Sam', 'asset', 'Investment', 'Sam'),
      acct('Personal Loan', 'debt', 'Loan', 'Alex', 250, 9.5),
      acct('Car Loan', 'debt', 'Loan', 'Sam', 350, 6.0),
      acct('Student Loan', 'debt', 'Loan', 'Sam', 300, 4.5)
    ];
    // one balance snapshot this month, so Net Worth and Forecast have data to show
    const bal = {
      [accounts[0].id]: 3200, [accounts[1].id]: 6000,
      [accounts[2].id]: 1500, [accounts[3].id]: 1200,
      [accounts[4].id]: 4200, [accounts[5].id]: 12000, [accounts[6].id]: 9000
    };

    return {
      version: 9,
      lastUpdated: new Date().toISOString(),
      needsExport: false,
      rules: [],
      importBatches: [],
      closes: {},
      reminders: { enabled: false, daysAhead: 3, log: {}, insightsEnabled: false, insightLog: {} },
      accounts: accounts,
      snapshots: { [ym]: bal },
      planned: [],
      rolloverBalances: {},
      subReviewed: {},
      forecastScenarios: [],
      streaksEnabled: false,
      members: ['Alex', 'Sam'],
      incomes: { Alex: 4200, Sam: 3800 },
      payCycles: {
        Alex: { frequency: 'biweekly', anchor: day(3) },
        Sam: { frequency: 'semimonthly', anchor: day(1) }
      },
      budget: [
        b('Rent', 'Shared', 'Housing', 'Fixed', 1750),
        b('Electric', 'Shared', 'Utilities', 'Fixed', 110),
        b('Gas', 'Shared', 'Utilities', 'Fixed', 40),
        b('Water', 'Shared', 'Utilities', 'Fixed', 45),
        b('Internet', 'Shared', 'Internet & Streaming', 'Fixed', 65),
        b('Netflix', 'Shared', 'Internet & Streaming', 'Discretionary', 18),
        b('Spotify', 'Shared', 'Internet & Streaming', 'Discretionary', 12),
        b('Pet Insurance', 'Shared', 'Pets', 'Fixed', 30),
        b('Groceries', 'Shared', 'Groceries', 'Discretionary', 550, 'Estimate — adjust to your average'),
        b('Dining Out', 'Shared', 'Dining Out', 'Discretionary', 180, 'Estimate — adjust to your average'),
        b('Fuel', 'Shared', 'Auto', 'Discretionary', 220, 'Estimate — adjust to your average'),
        b('Entertainment', 'Shared', 'Entertainment', 'Discretionary', 120, 'Estimate — adjust to your average'),
        b('Auto Insurance', 'Alex', 'Insurance', 'Fixed', 95),
        b('Personal Loan', 'Alex', 'Personal Loan', 'Fixed', 250),
        b('Phone', 'Alex', 'Phone', 'Discretionary', 25),
        b('Car Payment', 'Sam', 'Auto', 'Fixed', 350),
        b('Student Loan', 'Sam', 'Student Loans', 'Fixed', 300),
        b('Car Insurance', 'Sam', 'Insurance', 'Fixed', 80),
        b('Phone', 'Sam', 'Phone', 'Discretionary', 25)
      ],
      transactions: [
        { id: uid(), date: day(1), category: 'Housing', description: 'Rent — monthly', amount: 1750, who: 'Shared', account: 'Joint Checking', notes: note },
        { id: uid(), date: day(3), category: 'Groceries', description: 'Fresh Market', amount: 128.44, who: 'Shared', account: 'Everyday Card', notes: note },
        { id: uid(), date: day(5), category: 'Dining Out', description: 'Corner Bistro', amount: 62.10, who: 'Alex', account: 'Everyday Card', notes: note },
        { id: uid(), date: day(7), category: 'Auto', description: 'QuickFuel', amount: 48.75, who: 'Sam', account: 'Everyday Card', notes: note },
        { id: uid(), date: day(9), category: 'Internet & Streaming', description: 'Streamly', amount: 18.00, who: 'Shared', account: 'Everyday Card', notes: note },
        { id: uid(), date: day(12), category: 'Shopping', description: 'Bright Goods', amount: 74.20, who: 'Alex', account: 'Everyday Card', notes: note }
      ],
      goals: [
        { id: uid(), name: 'Emergency Fund (3 mo)', target: 12000, saved: 4200, monthly: 500 },
        { id: uid(), name: 'Home Down Payment', target: 20000, saved: 8500, monthly: 800, isHouse: true },
        { id: uid(), name: `Roth IRA — Alex (${year} max)`, target: 7500, saved: 1500, monthly: 500 },
        { id: uid(), name: `Roth IRA — Sam (${year} max)`, target: 7500, saved: 1200, monthly: 500 },
        { id: uid(), name: 'Vacation Fund', target: 3000, saved: 900, monthly: 200 },
        { id: uid(), name: 'New Car Fund', target: 10000, saved: 2500, monthly: 300 }
      ],
      house: {
        targetDate: (year + 2) + '-06-01',
        rate: 6.5, termYears: 30, taxRate: 1.6, insuranceYr: 1200,
        pmiRate: 0.75, closingPct: 4,
        scenarios: [
          { label: 'Scenario A', price: 250000, downPct: 10 },
          { label: 'Scenario B', price: 300000, downPct: 10 },
          { label: 'Scenario C', price: 350000, downPct: 20 }
        ]
      },
      invest: {
        rothLimit: 7500, rothYear: year,
        roth: { Alex: 1500, Sam: 1200 },
        hysa: { balance: 6000, deposit: 400, apys: [3.0, 3.8, 4.5] },
        payFrequency: 'biweekly'
      },
      wedding: {
        date: addMonths(4),
        vendors: [
          { id: uid(), vendor: 'Venue (final payment)', due: addMonths(3), amount: 2500, paid: false },
          { id: uid(), vendor: 'Catering deposit', due: addMonths(1), amount: 800, paid: true }
        ]
      }
    };
  }

  let data = null;
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) { data = JSON.parse(raw); migrate(); return; }
    } catch (e) { /* corrupted storage falls through to reseed */ }
    data = seed();
    save();
  }
  /* Schema upgrades for data saved by older app versions. Each step is additive
     so a backup from any version restores cleanly. */
  function migrate() {
    const v = +data.version || 1;
    if (v >= 10) return;
    if (v < 2) {
      data.rules = data.rules || [];
      data.importBatches = data.importBatches || [];
    }
    if (v < 3) {
      data.closes = data.closes || {};
      data.reminders = data.reminders || { enabled: false, daysAhead: 3, log: {} };
    }
    data.accounts = data.accounts || seedAccounts();
    data.snapshots = data.snapshots || {};
    data.planned = data.planned || [];
    /* v5: the two-person Mike/Bri model became a dynamic member roster. Older
       data keyed incomes and Roth balances by the lowercase 'mike'/'bri'; the
       who/section values were already the display names. Carry both across so a
       backup from any prior version upgrades in place without losing a cent. */
    if (v < 5 && !Array.isArray(data.members)) {
      data.members = ['Mike', 'Bri'];
      const inc = data.incomes || {};
      data.incomes = { Mike: +inc.mike || 0, Bri: +inc.bri || 0 };
      if (data.invest && data.invest.roth) {
        const r = data.invest.roth;
        data.invest.roth = { Mike: +r.mike || 0, Bri: +r.bri || 0 };
      }
    }
    data.members = data.members || ['Mike', 'Bri'];
    data.incomes = data.incomes || {};
    if (v < 6) {
      data.rolloverBalances = data.rolloverBalances || {};
      data.subReviewed = data.subReviewed || {};
    }
    if (v < 7) {
      data.forecastScenarios = data.forecastScenarios || [];
      if (data.invest) data.invest.payFrequency = data.invest.payFrequency || 'biweekly';
    }
    if (v < 8) {
      if (!('streaksEnabled' in data)) data.streaksEnabled = false;
    }
    if (v < 9) {
      data.payCycles = data.payCycles || {};
      (data.members || []).forEach(m => {
        if (!data.payCycles[m]) data.payCycles[m] = { frequency: 'biweekly', anchor: null };
      });
    }
    if (v < 10) {
      data.reminders.insightsEnabled = data.reminders.insightsEnabled || false;
      data.reminders.insightLog = data.reminders.insightLog || {};
    }
    data.version = 10;
    save();
  }
  function save() {
    data.lastUpdated = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(data));
    document.dispatchEvent(new CustomEvent('cf:change'));
  }
  function reset() { data = seed(); save(); }
  function replace(next) { data = next; migrate(); save(); }

  /* A blank-but-valid household for "Start fresh": one placeholder member, no
     budget/transactions/goals/accounts, planning scaffolds zeroed. Everything the
     views need to render is present so no screen breaks on an empty slate. */
  function emptyState() {
    const now = new Date();
    return {
      version: 9, lastUpdated: now.toISOString(), needsExport: false,
      rules: [], importBatches: [], closes: {},
      reminders: { enabled: false, daysAhead: 3, log: {}, insightsEnabled: false, insightLog: {} },
      accounts: [], snapshots: {}, planned: [],
      rolloverBalances: {}, subReviewed: {}, forecastScenarios: [], streaksEnabled: false,
      members: ['You'], incomes: { You: 0 },
      payCycles: { You: { frequency: 'biweekly', anchor: null } },
      budget: [], transactions: [], goals: [],
      house: {
        targetDate: (now.getFullYear() + 2) + '-06-01',
        rate: 6.5, termYears: 30, taxRate: 1.6, insuranceYr: 1200,
        pmiRate: 0.75, closingPct: 4, scenarios: []
      },
      invest: { rothLimit: 7500, rothYear: now.getFullYear(), roth: { You: 0 }, hysa: { balance: 0, deposit: 0, apys: [3.0, 3.8, 4.5] }, payFrequency: 'biweekly' },
      wedding: { date: '', vendors: [] }
    };
  }
  function startFresh() { data = emptyState(); save(); }

  /* Flags that transaction data has changed since the last CSV export, so the UI
     can nudge toward re-exporting so a linked spreadsheet stays current. Kept
     separate from lastUpdated (which save() always bumps) so exporting doesn't
     itself look like a data edit. */
  function touchTransactions() { data.needsExport = true; }
  function needsExport() { return !!data.needsExport; }
  function markExported() {
    data.needsExport = false;
    localStorage.setItem(KEY, JSON.stringify(data));
    document.dispatchEvent(new CustomEvent('cf:change'));
  }

