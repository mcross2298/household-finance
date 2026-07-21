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

