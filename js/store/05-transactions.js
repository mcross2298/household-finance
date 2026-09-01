/* ---- CSV import/export & merchant intelligence ---- */
'use strict';

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
  /* Fixed CSV schema — column order documented in the README. A split
     transaction (see applySplit()) is exported as one row per split — the
     spreadsheet sees the real per-category amounts — rather than adding a
     column: CSV_HEADER stays the stable 7-column contract, and each split
     row's Notes carries a "split N/M of <short id>" tag so rows from the
     same purchase can still be traced back to one another after export. */
  function exportCSV() {
    const lines = [CSV_HEADER.join(',')];
    const sorted = [...data.transactions].sort((a, b) => a.date < b.date ? -1 : 1);
    for (const t of sorted) {
      if (t.splits && t.splits.length) {
        const parent = t.id.slice(0, 8);
        t.splits.forEach((s, i) => {
          const tag = 'split ' + (i + 1) + '/' + t.splits.length + ' of ' + parent;
          const notes = t.notes ? t.notes + ' — ' + tag : tag;
          lines.push([usDate(t.date), s.category, t.description,
            (+s.amount).toFixed(2), t.who, t.account, notes].map(csvEscape).join(','));
        });
      } else {
        lines.push([usDate(t.date), t.category, t.description,
          (+t.amount).toFixed(2), t.who, t.account, t.notes].map(csvEscape).join(','));
      }
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
  /* Last resort before "Other": a fixed keyword table for merchants nobody has
     categorized yet. It lives here rather than in the import view so it sits
     in the same pipeline as the learned rules — a keyword hit is offered as a
     low-confidence guess that the review step can correct and then learn,
     instead of being an invisible second brain that never improves. */
  const KEYWORD_CATEGORIES = [
    [/giant|aldi|wegman|weis|grocery|lidl|trader joe/, 'Groceries'],
    [/restaurant|grill|pizza|chipotle|mcdonald|wendy|taco|roadhouse|dunkin|starbucks|cafe|bbq|diner/, 'Dining Out'],
    [/shell|sunoco|exxon|sheetz|wawa|gas|fuel|autozone|jiffy|car wash/, 'Auto'],
    [/netflix|hulu|hbo|max|spotify|disney|paramount|comcast|xfinity|verizon fios/, 'Internet & Streaming'],
    [/amazon|target|walmart|marshalls|tj maxx|kohls|old navy/, 'Shopping'],
    [/gym|planet fitness|crunch|cvs|walgreens|pharmacy|dental|medical/, 'Health & Fitness'],
    [/vet|petco|petsmart|chewy/, 'Pets'],
    [/hotel|airbnb|airline|delta|southwest|united|amtrak/, 'Travel'],
    [/ugi|ppl|water|sewer|electric/, 'Utilities']
  ];
  function guessCategory(desc) {
    const d = String(desc || '').toLowerCase();
    for (const [re, cat] of KEYWORD_CATEGORIES) if (re.test(d)) return cat;
    return '';
  }

  /* The whole categorization pipeline in priority order, returning both the
     category/who and HOW confident that answer is. The review step keys its
     triage off `confidence`, so a merchant seen ten times stops costing the
     same attention as one never seen before:
       rule      exact learned merchant rule        — trusted, collapses
       bill      matches a recurring budget line    — worth a glance
       suggested nearest learned merchant (fuzzy)   — worth a look
       keyword   fixed keyword table                — worth a look
       null      nothing matched                    — needs a human */
  function categorize(tx) {
    const rule = ruleFor(tx.description);
    if (rule) return { category: rule.category, who: rule.who, confidence: 'rule' };
    const line = matchBudgetLine({ description: tx.description, amount: tx.amount, category: '' });
    if (line) return { category: line.category, who: null, confidence: 'bill' };
    const sug = suggestRule(tx.description);
    if (sug) return { category: sug.category, who: sug.who, confidence: 'suggested' };
    const kw = guessCategory(tx.description);
    if (kw) return { category: kw, who: null, confidence: 'keyword' };
    return { category: '', who: null, confidence: null };
  }

  /* Upsert by key: re-learning a merchant updates the existing rule in place.
     `tag` is optional free text (e.g. "subscriptions") the visible rule
     builder lets someone attach to group related rules; omit it (undefined)
     to leave an existing rule's tag untouched on re-learn. */
  function learnRule(desc, category, who, tag) {
    const match = merchantKey(desc);
    if (!match || !category) return null;
    let r = data.rules.find(x => x.match === match);
    if (r) {
      r.category = category; if (who) r.who = who;
      if (tag !== undefined) r.tag = tag || null;
    } else {
      r = { id: uid(), match, category, who: who || 'Shared', tag: tag || null };
      data.rules.push(r);
    }
    return r;
  }

  /* Same match semantics as ruleFor() (exact merchant key, else first-token
     fallback), but against an arbitrary draft rule instead of a saved one —
     lets the rule builder show what a rule WOULD match before it's saved.
     `rule` only needs a `match` (or `contains`, pre-normalization) field. */
  function previewRule(rule) {
    const match = merchantKey((rule && (rule.match || rule.contains)) || '');
    if (!match) return [];
    const first = match.split(' ')[0];
    const since = addDays(todayIso(), -90);
    return data.transactions
      .filter(t => t.date >= since)
      .filter(t => {
        const key = merchantKey(t.description);
        if (!key) return false;
        if (key === match) return true;
        return first.length >= 3 && key.split(' ')[0] === first;
      })
      .sort((a, b) => a.date < b.date ? 1 : -1);
  }

  /* Frequent merchants with no rule yet — the Rules screen's empty state
     offers these as one-tap "promote to visible rule" chips instead of
     asking someone to type a rule from scratch for a merchant the app has
     already seen several times. Majority-vote the category/who from history
     so the promoted rule starts out right more often than not. */
  function suggestedRuleMerchants(limit) {
    const byKey = {};
    for (const t of data.transactions) {
      const key = merchantKey(t.description);
      if (!key || data.rules.some(r => r.match === key)) continue;
      const b = byKey[key] || (byKey[key] = { key, count: 0, cats: {}, whos: {} });
      b.count++;
      b.cats[t.category] = (b.cats[t.category] || 0) + 1;
      b.whos[t.who] = (b.whos[t.who] || 0) + 1;
    }
    const top = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0][0];
    return Object.values(byKey)
      .filter(b => b.count >= 2)
      .map(b => ({ match: b.key, merchant: prettyMerchant(b.key), category: top(b.cats), who: top(b.whos), count: b.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit || 3);
  }

  /* Splits a transaction's amount across multiple categories (a single
     Target run that's half Groceries, half Shopping). `parts` must sum,
     penny-exact, to the transaction's CURRENT amount — the total itself
     doesn't change, only how it's categorized — so the caller can't silently
     grow or shrink a transaction while "splitting" it. The transaction's own
     `category` becomes the largest split's (tie broken by list order), kept
     in sync so every existing report/view that reads `category` directly
     still sees a sane single answer without knowing splits exist. */
  function applySplit(txId, parts) {
    const t = data.transactions.find(x => x.id === txId);
    if (!t) return null;
    const clean = (parts || [])
      .map(p => ({ category: p.category || '', amount: Math.round((+p.amount || 0) * 100) / 100 }))
      .filter(p => p.category && p.amount > 0);
    if (clean.length < 2) return null;
    const sumCents = clean.reduce((s, p) => s + Math.round(p.amount * 100), 0);
    if (sumCents !== Math.round((+t.amount || 0) * 100)) return null;
    let primary = clean[0];
    for (const p of clean) if (p.amount > primary.amount) primary = p;
    t.splits = clean;
    t.category = primary.category;
    touchTransactions(); save();
    return t;
  }
  /* Reverts a split back to one plain category+amount — the amount was never
     touched by applySplit(), so there's nothing to restore there. */
  function clearSplit(txId) {
    const t = data.transactions.find(x => x.id === txId);
    if (!t || !t.splits) return null;
    delete t.splits;
    touchTransactions(); save();
    return t;
  }

  /* Fuzzy duplicate check: same cents, dates within ±3 days, similar merchant.
     Catches overlapping statement periods and pending→posted date shifts that
     exact date+description matching misses. A second pass below catches what
     the 3-day window can't: a Fixed bill paid manually days before (or after)
     its autopay date — same budget line, same billing month, amount still
     close, but too many days apart for the fuzzy check above to see it. */
  function likelyDuplicate(row, txs) {
    const pool = txs || data.transactions;
    const amt = Math.round((+row.amount || 0) * 100);
    if (amt && row.date) {
      const d = new Date(row.date + 'T00:00:00');
      const key = merchantKey(row.description);
      const first = key.split(' ')[0];
      for (const t of pool) {
        if (Math.round((+t.amount || 0) * 100) !== amt) continue;
        const days = Math.abs(new Date(t.date + 'T00:00:00') - d) / 86400000;
        if (days > 3) continue;
        const tKey = merchantKey(t.description);
        if (!key || !tKey || tKey === key || tKey.split(' ')[0] === first) return t;
      }
    }
    if (!row.date) return null;
    const line = matchBudgetLine({ description: row.description, amount: row.amount, category: row.category || '' });
    if (line && line.type === 'Fixed') {
      const month = row.date.slice(0, 7);
      const rowAmt = +row.amount || 0;
      for (const t of pool) {
        if (t.date.slice(0, 7) !== month || matchBudgetLine(t) !== line) continue;
        const tAmt = +t.amount || 0;
        const tol = Math.max(tAmt, rowAmt) * 0.10;
        if (Math.abs(tAmt - rowAmt) <= tol) return t;
      }
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

  /* ---------- recurring-series detector ---------- */

  /* One derived model of "what repeats" — never persisted, always recomputed
     (same philosophy as forecastScenarios), so price-creep detection,
     subscription nudges, and the Bill Calendar's "detected" overlay all read
     from the same place instead of each rediscovering recurrence from
     scratch. avg-delta cadence classification (rather than a strict
     one-per-calendar-month bucket) is deliberately tolerant of a short
     early/late month here or there, while still landing outside every
     bucket — and therefore yielding no series at all — for a merchant with
     no real cadence, like an occasional restaurant visit. */
  const CADENCE_DAYS = { weekly: 7, biweekly: 14, monthly: 30 };
  function classifyCadence(avgDeltaDays) {
    if (avgDeltaDays >= 5 && avgDeltaDays <= 9) return 'weekly';
    if (avgDeltaDays >= 10 && avgDeltaDays <= 19) return 'biweekly';
    if (avgDeltaDays >= 24 && avgDeltaDays <= 40) return 'monthly';
    return null;
  }
  function recurringSeries() {
    const byKey = {};
    for (const t of data.transactions) {
      const key = merchantKey(t.description);
      if (!key) continue;
      (byKey[key] = byKey[key] || []).push({ date: t.date, amount: +t.amount || 0 });
    }
    const today = todayIso();
    const out = [];
    for (const key in byKey) {
      const charges = byKey[key].slice().sort((a, b) => a.date < b.date ? -1 : (a.date > b.date ? 1 : 0));
      if (charges.length < 3) continue;
      const first = charges[0].date, last = charges[charges.length - 1].date;
      const spanDays = dayDiff(first, last);
      if (spanDays <= 0) continue;
      const avgDelta = spanDays / (charges.length - 1);
      const cadence = classifyCadence(avgDelta);
      if (!cadence) continue;
      const cadenceDays = CADENCE_DAYS[cadence];

      // The "expected" price is the most common amount among every charge
      // BUT the latest one, so a genuine price change doesn't get folded
      // into its own baseline the moment it happens.
      const priorCents = charges.slice(0, -1).map(c => Math.round(c.amount * 100));
      const counts = {};
      for (const c of priorCents) counts[c] = (counts[c] || 0) + 1;
      let modeCents = priorCents[priorCents.length - 1], modeCount = 0;
      for (const c in counts) if (counts[c] > modeCount) { modeCount = counts[c]; modeCents = +c; }
      const expectedAmount = modeCents / 100;

      const lastCharge = charges[charges.length - 1];
      const prevCharge = charges[charges.length - 2];
      const lastDelta = dayDiff(prevCharge.date, lastCharge.date);
      const daysSinceLast = dayDiff(lastCharge.date, today);

      let status = 'ok';
      if (lastDelta < cadenceDays * 0.5) status = 'doubled';
      else if (daysSinceLast > cadenceDays * 1.5) status = 'missed';
      else if (Math.abs(lastCharge.amount - expectedAmount) > Math.max(0.5, expectedAmount * 0.03)) status = 'price-changed';

      out.push({
        key, merchant: prettyMerchant(key), cadence, cadenceDays,
        expectedAmount, lastAmount: lastCharge.amount, lastDate: lastCharge.date,
        nextExpected: addDays(lastCharge.date, cadenceDays),
        chargeCount: charges.length, status
      });
    }
    return out.sort((a, b) => a.merchant < b.merchant ? -1 : (a.merchant > b.merchant ? 1 : 0));
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

