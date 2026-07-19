/* Household Finance — data layer.
   localStorage is the only persistence. The fixed 19-category list, the 'Who'
   vocabulary, and the CSV column order below are the schema authority for the
   export — keep them in sync with any spreadsheet you pipe the CSV into
   (the column order is documented in the README). */
(function () {
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
      reminders: { enabled: false, daysAhead: 3, log: {} },
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
    if (v >= 9) return;
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
    data.version = 9;
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
      reminders: { enabled: false, daysAhead: 3, log: {} },
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

  /* ---------- formatting ---------- */
  const fmt$ = (n, dec) => {
    if (n == null || isNaN(n)) return '—';
    const d = dec == null ? (Math.abs(n) >= 1000 ? 0 : 2) : dec;
    return (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US',
      { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const fmtPct = (x, dec) => (x == null || isNaN(x)) ? '—'
    : (x * 100).toFixed(dec == null ? 1 : dec) + '%';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-').map(Number);
    return MONTHS[m - 1] + ' ' + d + ', ' + y;
  }
  function fmtMonth(ym) {
    const [y, m] = ym.split('-').map(Number);
    return MONTHS[m - 1] + ' ' + y;
  }
  function usDate(iso) { // exported CSV wants MM/DD/YYYY
    const [y, m, d] = iso.split('-');
    return m + '/' + d + '/' + y;
  }
  function isoFromUs(s) {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (!m) return null;
    let y = +m[3]; if (y < 100) y += 2000;
    return y + '-' + String(+m[1]).padStart(2, '0') + '-' + String(+m[2]).padStart(2, '0');
  }
  const thisMonth = () => new Date().toISOString().slice(0, 7);

  /* ---------- household members ---------- */

  /* The attribution vocabulary: 'Shared' (split evenly) plus every member, in
     roster order. Everything that offers a "who owns this" choice reads from here. */
  function WHO() { return [SHARED].concat(data.members || []); }
  function members() { return (data.members || []).slice(); }

  /* Add a member. Names are the identity used across budget sections, transaction
     'who', account owners and the Roth/income maps, so a name must be unique and
     may not collide with the reserved 'Shared'. Returns the trimmed name or null. */
  function addMember(name) {
    name = String(name || '').trim();
    if (!name || name.toLowerCase() === SHARED.toLowerCase()) return null;
    if (data.members.some(m => m.toLowerCase() === name.toLowerCase())) return null;
    data.members.push(name);
    if (!(name in data.incomes)) data.incomes[name] = 0;
    if (data.invest && data.invest.roth && !(name in data.invest.roth)) data.invest.roth[name] = 0;
    data.payCycles = data.payCycles || {};
    if (!(name in data.payCycles)) data.payCycles[name] = { frequency: 'biweekly', anchor: null };
    save();
    return name;
  }
  /* Rename a member everywhere the old name was used as an identity. */
  function renameMember(oldName, next) {
    next = String(next || '').trim();
    const i = data.members.indexOf(oldName);
    if (i < 0 || !next || next === oldName) return false;
    if (next.toLowerCase() === SHARED.toLowerCase()) return false;
    if (data.members.some(m => m.toLowerCase() === next.toLowerCase())) return false;
    data.members[i] = next;
    data.budget.forEach(b => { if (b.section === oldName) b.section = next; });
    data.transactions.forEach(t => { if (t.who === oldName) t.who = next; });
    data.accounts.forEach(a => { if (a.owner === oldName) a.owner = next; });
    data.rules.forEach(r => { if (r.who === oldName) r.who = next; });
    if (oldName in data.incomes) { data.incomes[next] = data.incomes[oldName]; delete data.incomes[oldName]; }
    if (data.invest && data.invest.roth && oldName in data.invest.roth) {
      data.invest.roth[next] = data.invest.roth[oldName]; delete data.invest.roth[oldName];
    }
    if (data.payCycles && oldName in data.payCycles) {
      data.payCycles[next] = data.payCycles[oldName]; delete data.payCycles[oldName];
    }
    save();
    return true;
  }
  /* Remove a member. The last member can't be removed (the household needs at
     least one). Anything attributed to them falls back to 'Shared' so no budget
     line, transaction or account is orphaned. */
  function removeMember(name) {
    const i = data.members.indexOf(name);
    if (i < 0 || data.members.length <= 1) return false;
    data.members.splice(i, 1);
    data.budget.forEach(b => { if (b.section === name) b.section = SHARED; });
    data.transactions.forEach(t => { if (t.who === name) t.who = SHARED; });
    data.accounts.forEach(a => { if (a.owner === name) a.owner = SHARED; });
    data.rules.forEach(r => { if (r.who === name) r.who = SHARED; });
    delete data.incomes[name];
    if (data.invest && data.invest.roth) delete data.invest.roth[name];
    if (data.payCycles) delete data.payCycles[name];
    save();
    return true;
  }

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

  /* ---------- CSV ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], field = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(f => f !== '')) rows.push(row);
        row = [];
      } else field += ch;
    }
    row.push(field);
    if (row.some(f => f !== '')) rows.push(row);
    return rows;
  }
  function csvEscape(v) {
    v = String(v == null ? '' : v);
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  /* Fixed CSV schema — column order documented in the README. */
  function exportCSV() {
    const lines = [CSV_HEADER.join(',')];
    const sorted = [...data.transactions].sort((a, b) => a.date < b.date ? -1 : 1);
    for (const t of sorted) {
      lines.push([usDate(t.date), t.category, t.description,
        (+t.amount).toFixed(2), t.who, t.account, t.notes].map(csvEscape).join(','));
    }
    return lines.join('\r\n');
  }

  /* ---------- merchant intelligence (rules, dedupe, bill matching) ---------- */

  /* Statement descriptions carry per-transaction junk — store numbers, POS codes,
     embedded dates, card masks, processor prefixes — that makes every visit to the
     same merchant look unique. Stripping it lets one rule cover every location. */
  function normalizeMerchant(desc) {
    let s = String(desc || '').toUpperCase();
    s = s.replace(/^(SQ|TST|PY|PP|SP|PAYPAL|CKE|IN)\s*\*\s*/, '');           // processor prefixes
    s = s.replace(/\b(PURCHASE AUTHORIZED ON|DEBIT CARD PURCHASE|CHECKCARD|POS DEBIT|POS PURCHASE|POS|ACH|RECURRING|PAYMENT|PMT|WEB ID:?\S*)\b/g, ' ');
    s = s.replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, ' ');       // embedded dates
    s = s.replace(/[#*]\s*\d+/g, ' ');                                        // store / ref numbers
    s = s.replace(/\bX{2,}\d*\b/g, ' ');                                      // card masks (XXXX1234)
    s = s.replace(/\b\d{3,}\b/g, ' ');                                        // long digit runs
    s = s.replace(/[^A-Z0-9&'\s]/g, ' ');                                     // leftover punctuation
    return s.replace(/\s+/g, ' ').trim();
  }
  /* Rule key: the first two normalized tokens — merchant names are almost always
     1–2 words, with location/city trailing after. */
  function merchantKey(desc) {
    return normalizeMerchant(desc).split(' ').slice(0, 2).join(' ');
  }
  /* Human-readable version of the cleaned description for display in lists. */
  function prettyMerchant(desc) {
    const n = normalizeMerchant(desc);
    if (!n) return String(desc || '').trim();
    return n.split(' ').map(w =>
      w.length <= 3 && !/[AEIOUY]/.test(w) ? w  // keep acronyms (PPL, UGI, CVS) as-is
        : w.charAt(0) + w.slice(1).toLowerCase()
    ).join(' ');
  }

  /* Exact key match first; fall back to first-token match so "MARKET DOWNTOWN"
     and "MARKET UPTOWN" share one rule. Ambiguous first tokens lose to any
     exact-key rule because exact matches are checked across all rules first. */
  function ruleFor(desc) {
    const key = merchantKey(desc);
    if (!key) return null;
    const exact = data.rules.find(r => r.match === key);
    if (exact) return exact;
    const first = key.split(' ')[0];
    if (first.length < 3) return null;
    return data.rules.find(r => r.match.split(' ')[0] === first) || null;
  }
  /* A softer sibling to ruleFor: when nothing matches exactly or by first
     token, look for the nearest already-learned merchant by token overlap.
     Meant to prefill a best guess for review, not to auto-apply — the caller
     marks it "suggested" rather than "auto" so it still gets a second look. */
  function suggestRule(desc) {
    // Compare on the same ≤2-token basis rule.match itself uses — matching
    // against the full description would dilute the score with trailing
    // city/state tokens that have nothing to do with the merchant.
    const targetTokens = new Set(merchantKey(desc).split(' ').filter(Boolean));
    if (!targetTokens.size) return null;
    let best = null, bestScore = 0;
    for (const r of data.rules) {
      const rTokens = new Set(r.match.split(' ').filter(Boolean));
      if (!rTokens.size) continue;
      let overlap = 0;
      for (const t of targetTokens) if (rTokens.has(t)) overlap++;
      const score = overlap / Math.max(targetTokens.size, rTokens.size);
      if (score > bestScore) { bestScore = score; best = r; }
    }
    return bestScore >= 0.5 ? best : null;
  }
  /* Upsert by key: re-learning a merchant updates the existing rule in place. */
  function learnRule(desc, category, who) {
    const match = merchantKey(desc);
    if (!match || !category) return null;
    let r = data.rules.find(x => x.match === match);
    if (r) { r.category = category; if (who) r.who = who; }
    else { r = { id: uid(), match, category, who: who || 'Shared' }; data.rules.push(r); }
    return r;
  }

  /* Fuzzy duplicate check: same cents, dates within ±3 days, similar merchant.
     Catches overlapping statement periods and pending→posted date shifts that
     exact date+description matching misses. */
  function likelyDuplicate(row, txs) {
    const amt = Math.round((+row.amount || 0) * 100);
    if (!amt || !row.date) return null;
    const d = new Date(row.date + 'T00:00:00');
    const key = merchantKey(row.description);
    const first = key.split(' ')[0];
    for (const t of (txs || data.transactions)) {
      if (Math.round((+t.amount || 0) * 100) !== amt) continue;
      const days = Math.abs(new Date(t.date + 'T00:00:00') - d) / 86400000;
      if (days > 3) continue;
      const tKey = merchantKey(t.description);
      if (!key || !tKey || tKey === key || tKey.split(' ')[0] === first) return t;
    }
    return null;
  }

  /* Match a transaction to a recurring budget line: a line-name token (≥3 chars)
     appears verbatim in the merchant tokens, or — for Fixed lines — category
     matches and the amount is within 10% of the line's monthly. */
  const LINE_STOPWORDS = new Set(['THE', 'AND', 'FOR', 'BOTH', 'CARS', 'CAR', 'PAYMENT', 'LOAN', 'BILL', 'FEE']);
  function lineTokens(name) {
    return normalizeMerchant(name).split(' ').filter(w => w.length >= 3 && !LINE_STOPWORDS.has(w));
  }
  function matchBudgetLine(tx) {
    const txTokens = new Set(normalizeMerchant(tx.description).split(' '));
    let byAmount = null;
    for (const b of data.budget) {
      if (lineTokens(b.name).some(w => txTokens.has(w))) return b;
      if (b.type === 'Fixed' && !byAmount && tx.category && tx.category === b.category) {
        const m = +b.monthly || 0;
        if (m > 0 && Math.abs((+tx.amount || 0) - m) / m <= 0.10) byAmount = b;
      }
    }
    return byAmount;
  }
  /* For the Budget screen: which Fixed lines have a matching transaction this
     month (posted), and month-to-date actuals for Discretionary lines. Each
     transaction is attributed to at most ONE line — first by merchant/amount
     match, then by category only when a single line could own that category
     (several streaming lines share "Internet & Streaming"; without this rule
     one Netflix charge would show as spend against all of them). */
  function budgetLineStatus(ym) {
    const month = ym || thisMonth();
    const attributed = new Map(); // line id -> { sum, tx }
    const unmatched = [];
    for (const t of txInMonth(month)) {
      const line = matchBudgetLine(t);
      if (!line) { unmatched.push(t); continue; }
      const a = attributed.get(line.id) || { sum: 0, tx: t };
      a.sum += (+t.amount || 0);
      attributed.set(line.id, a);
    }
    const soleOwner = b => !data.budget.some(x => x !== b
      && x.type === 'Discretionary' && x.category === b.category
      && (x.section === b.section || x.section === 'Shared' || b.section === 'Shared'));
    const out = {};
    for (const b of data.budget) {
      const a = attributed.get(b.id);
      if (b.type === 'Fixed') {
        out[b.id] = { posted: !!a, tx: a ? a.tx : null };
      } else {
        let spent = a ? a.sum : 0;
        if (soleOwner(b)) {
          spent += unmatched.reduce((s, t) =>
            s + (t.category === b.category && (b.section === 'Shared' || t.who === b.section) ? (+t.amount || 0) : 0), 0);
        }
        out[b.id] = { spent };
      }
    }
    return out;
  }

  /* A Fixed line flagged cashPay never arrives on a statement (cash, check,
     autopay with no card trail) — matchBudgetLine can never see a transaction
     for it, so it would sit "not posted" on the Budget/Calendar screens
     forever. Posting it automatically, once, on/after its due day keeps that
     screen honest without asking for a manual entry every month. Idempotent:
     once posted, budgetLineStatus sees the new transaction and skips it. */
  function autoPostDueBills() {
    const month = thisMonth();
    const dim = daysInMonth(month);
    const today = todayIso();
    let posted = 0;
    for (const b of data.budget) {
      if (b.type !== 'Fixed' || !b.cashPay || !b.dueDay) continue;
      const st = budgetLineStatus(month);
      if (st[b.id] && st[b.id].posted) continue;
      const due = month + '-' + String(Math.min(+b.dueDay, dim)).padStart(2, '0');
      if (due > today) continue;
      data.transactions.push({
        id: uid(), date: due, category: b.category, description: b.name,
        amount: +b.monthly || 0, who: b.section, account: 'Auto-posted',
        notes: 'Auto-posted — cash-pay recurring bill'
      });
      posted++;
    }
    if (posted) { touchTransactions(); save(); }
    return posted;
  }

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
     lines (due on their dueDay, "undated" until one is set) and wedding vendor
     payments. posted comes from M1's bill matching, so paying a bill checks it
     off the calendar automatically. */
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

  /* Bills (and wedding payments) that deserve a reminder right now: due within
     daysAhead, not posted, not already reminded for this due date. */
  function dueForReminder() {
    const r = data.reminders;
    if (!r || !r.enabled) return [];
    const today = todayIso();
    const horizon = +r.daysAhead || 3;
    const cur = thisMonth();
    const pool = monthSchedule(cur).concat(
      // near month-end the horizon spills into next month's first bills
      monthSchedule(nextMonth(cur)).filter(i => i.due && dayDiff(today, i.due) <= horizon)
    );
    return pool.filter(i => i.due && !i.posted
      && dayDiff(today, i.due) <= horizon && dayDiff(today, i.due) >= 0
      && !r.log[i.id + '@' + i.due]);
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

  window.Store = {
    CATEGORIES, TYPES, DEBT_TYPES, CSV_HEADER, SHARED, uid,
    get WHO() { return WHO(); },
    get data() { return data; },
    members, addMember, renameMember, removeMember,
    load, save, reset, replace, startFresh,
    touchTransactions, needsExport, markExported,
    fmt$, fmtPct, fmtDate, fmtMonth, usDate, isoFromUs, thisMonth, MONTHS,
    budgetTotal, incomeTotal, surplus, savingsRate,
    budgetByCategory, budgetByPerson,
    txInMonth, spendByCategory, spendByWho, spendByDay, monthsWithData,
    goalMeta, houseScenario, weddingRemaining, rothMeta, hysaProjection,
    paydaysInMonth, paydaysInMonthAll, fundingPaycheck, paycheckAllocations,
    goalsProgress, insights,
    saveForecastScenario, deleteForecastScenario,
    parseCSV, exportCSV, csvEscape,
    monthPace, safeToSpend, avgSpendByCategory, categoryTrends, priceCreeps, unusualTx,
    subscriptionNudges, markSubscriptionReviewed,
    prevMonth, nextMonth, daysInMonth, monthSchedule,
    dueForReminder, markReminded,
    closeChecklist, monthSummary, closeMonth,
    balanceAt, latestBalance, netWorthSeries, saveSnapshot, debtPayoff, forecast,
    debtStrategies, debtStrategiesSummary, debtPayoffOrder, debtRollupPlan, debtPayoffOrderComparison,
    normalizeMerchant, merchantKey, prettyMerchant,
    ruleFor, suggestRule, learnRule, likelyDuplicate,
    matchBudgetLine, budgetLineStatus,
    effectiveBudget, rolloverAdjustmentTotal, autoPostDueBills, underBudgetStreak,
    addImportBatch, undoImportBatch
  };
  load();
})();
