/* Import — PDF statements, CSV files, or pasted CSV (Claude screenshot workflow).
   Everything lands in one review step: nothing is committed until approved. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  let pending = null;   // rows awaiting review
  let sourceName = '';
  let whoTouched = false; // has the user set Who (bulk or per-row) for this import yet?

  Views.import = function (root) {
    if (pending) return renderReview(root);
    const batches = Store.data.importBatches || [];
    const rules = Store.data.rules || [];
    root.innerHTML = `
      <div class="page">
        <div class="page-head"><h1>Import</h1></div>

        <section class="card drop-card" id="drop-zone">
          <div class="drop-inner">
            <div class="drop-ico" aria-hidden="true">⇪</div>
            <h2>Drop a statement here</h2>
            <p>PDF bank/card statement or a CSV in the standard schema.<br>
               Nothing is saved until you review it.</p>
            <div class="btn-row center">
              <label class="btn gold file-btn">Choose file
                <input type="file" id="file-input" accept=".pdf,.csv,text/csv,application/pdf" hidden>
              </label>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>Paste CSV</h2><span class="card-note">screenshot → Claude → paste</span></div>
          <p class="help">Snap or screenshot a statement, paste the image into a Claude chat and ask for
             <b>Date, Category, Description, Amount, Who, Account, Notes</b> CSV — then paste the result here.</p>
          <textarea class="input" id="paste-csv" rows="6" placeholder="Date,Category,Description,Amount,Who,Account,Notes
07/03/2026,Groceries,Fresh Market,112.47,Shared,Everyday Card,"></textarea>
          <div class="btn-row"><button class="btn" id="parse-paste">Preview pasted rows</button></div>
        </section>

        ${batches.length ? `
        <section class="card">
          <div class="card-head"><h2>Recent imports</h2><span class="card-note">one-tap undo</span></div>
          <ul class="batch-list">
            ${batches.map(b => `
              <li class="batch-row">
                <div class="batch-main">
                  <span class="batch-name">${App.esc(b.source)}</span>
                  <span class="batch-meta">${Store.fmtDate(b.ts.slice(0, 10))} · ${b.txIds.length} transaction${b.txIds.length === 1 ? '' : 's'}</span>
                </div>
                <button class="btn ghost sm" data-undo="${b.id}">Undo</button>
              </li>`).join('')}
          </ul>
        </section>` : ''}

        ${rules.length ? `
        <section class="card">
          <div class="card-head"><h2>Rules</h2><span class="card-note">learned merchants — applied to every import</span></div>
          <ul class="rules-list">
            ${rules.map(r => `
              <li class="rule-row" data-rule="${r.id}">
                <span class="rule-match">${App.esc(r.match)}</span>
                <select class="select slim" data-rf="category">${App.options(Store.CATEGORIES, r.category)}</select>
                <select class="select slim" data-rf="who">${App.options(Store.WHO, r.who)}</select>
                <button class="icon-btn" data-rdel="${r.id}" aria-label="Delete rule">✕</button>
              </li>`).join('')}
          </ul>
        </section>` : ''}

        <section class="card">
          <div class="card-head"><h2>How import works</h2></div>
          <ol class="steps">
            <li><b>PDF</b> — the statement is read in your browser (nothing uploaded anywhere); transaction-looking lines are extracted for review.</li>
            <li><b>CSV</b> — columns are mapped to the standard schema; categories and Who are validated against the fixed lists.</li>
            <li><b>Auto-categorize</b> — merchants you've categorized before are filled in from your rules and marked <i>auto</i>; recurring bills inherit their budget line's category.</li>
            <li><b>Review</b> — fix categories, uncheck junk rows, then commit. Likely duplicates (same amount within a few days at a similar merchant) are flagged.</li>
          </ol>
        </section>
      </div>`;

    const zone = root.querySelector('#drop-zone');
    ['dragover', 'dragenter'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', e => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f, root);
    });
    root.querySelector('#file-input').addEventListener('change', e => {
      if (e.target.files[0]) handleFile(e.target.files[0], root);
    });
    root.querySelector('#parse-paste').addEventListener('click', () => {
      const text = root.querySelector('#paste-csv').value.trim();
      if (!text) return App.toast('Paste CSV first', 'warn');
      sourceName = 'pasted CSV';
      startCSV(text, root);
    });
    root.querySelectorAll('[data-undo]').forEach(btn =>
      btn.addEventListener('click', () => {
        const b = Store.data.importBatches.find(x => x.id === btn.dataset.undo);
        if (!b) return;
        App.confirmDialog('Undo this import',
          `Remove all ${b.txIds.length} transaction${b.txIds.length === 1 ? '' : 's'} imported from “${App.esc(b.source)}”? Transactions you've edited since are removed too.`,
          'Undo import', () => {
            const n = Store.undoImportBatch(b.id);
            App.render(); App.toast('Removed ' + n + ' transaction' + (n === 1 ? '' : 's'));
          });
      }));
    root.querySelectorAll('.rule-row [data-rf]').forEach(sel =>
      sel.addEventListener('change', () => {
        const r = Store.data.rules.find(x => x.id === sel.closest('.rule-row').dataset.rule);
        if (r) { r[sel.dataset.rf] = sel.value; Store.save(); App.toast('Rule updated'); }
      }));
    root.querySelectorAll('[data-rdel]').forEach(btn =>
      btn.addEventListener('click', () => {
        Store.data.rules = Store.data.rules.filter(x => x.id !== btn.dataset.rdel);
        Store.save(); App.render(); App.toast('Rule deleted');
      }));
  };

  /* Applied to every pending set before review: fill category/who from learned
     rules (marked "auto"), fall back to a matching budget line, and clean
     statement-junk descriptions on the PDF path. Source-file values always win. */
  function applyIntelligence(cleanDesc) {
    for (const p of pending) {
      if (cleanDesc) p.description = Store.prettyMerchant(p.description);
      const rule = Store.ruleFor(p.description);
      if (rule && !p.catFromSource) {
        p.category = rule.category;
        if (!p.whoFromSource) p.who = rule.who;
        p.auto = 'rule';
      } else if (!p.catFromSource && (!p.category || p.category === 'Other')) {
        const line = Store.matchBudgetLine({ description: p.description, amount: p.amount, category: '' });
        if (line) { p.category = line.category; p.auto = 'bill'; }
        else {
          // No confident match — a fuzzy nearest-neighbor guess still beats a
          // blank "Other", as long as it's flagged for a second look.
          const sug = Store.suggestRule(p.description);
          if (sug) { p.category = sug.category; if (!p.whoFromSource) p.who = sug.who; p.suggested = true; }
        }
      }
    }
  }

  function handleFile(file, root) {
    sourceName = file.name;
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return handlePDF(file, root);
    const reader = new FileReader();
    reader.onload = () => startCSV(String(reader.result), root);
    reader.readAsText(file);
  }

  /* ---------- CSV path ---------- */
  function startCSV(text, root) {
    const rows = Store.parseCSV(text);
    if (rows.length < 2) return App.toast('Could not find data rows in that CSV', 'warn');
    const header = rows[0].map(h => h.trim());
    const guess = name => {
      const pats = {
        date: /date|posted/i, category: /category/i, description: /desc|payee|merchant|name|memo/i,
        amount: /amount|amt|debit|charge/i, who: /^who$/i, account: /account|card/i, notes: /note/i
      };
      const i = header.findIndex(h => pats[name].test(h));
      return i;
    };
    const map = {
      date: guess('date'), category: guess('category'), description: guess('description'),
      amount: guess('amount'), who: guess('who'), account: guess('account'), notes: guess('notes')
    };
    // Exact-schema CSVs skip the mapping dialog entirely.
    const exact = Store.CSV_HEADER.every((h, i) => (header[i] || '').toLowerCase() === h.toLowerCase());
    if (exact || (map.date >= 0 && map.amount >= 0 && map.description >= 0)) {
      buildPending(rows.slice(1), map);
      return App.render();
    }
    mappingModal(header, rows, map);
  }

  function mappingModal(header, rows, map) {
    const fields = ['date', 'amount', 'description', 'category', 'who', 'account', 'notes'];
    const required = ['date', 'amount', 'description'];
    const sel = f => `<select class="select" data-map="${f}">
        <option value="-1">— none —</option>
        ${header.map((h, i) => `<option value="${i}"${map[f] === i ? ' selected' : ''}>${App.esc(h || 'column ' + (i + 1))}</option>`).join('')}
      </select>`;
    const m = App.modal('Map CSV columns', `
      <p class="help">Match your file's columns to the standard schema. ${required.join(', ')} are required.</p>
      <div class="form-grid">
        ${fields.map(f => `<label>${f[0].toUpperCase() + f.slice(1)}${required.includes(f) ? ' *' : ''}${sel(f)}</label>`).join('')}
      </div>
      <div class="btn-row"><button class="btn gold" id="map-go">Preview rows</button></div>`);
    m.el.querySelector('#map-go').addEventListener('click', () => {
      const chosen = {};
      m.el.querySelectorAll('[data-map]').forEach(s => chosen[s.dataset.map] = +s.value);
      for (const f of required) if (chosen[f] < 0) return App.toast('Map the ' + f + ' column', 'warn');
      buildPending(rows.slice(1), chosen);
      m.close(); App.render();
    });
  }

  function buildPending(dataRows, map) {
    const get = (r, f) => map[f] >= 0 ? (r[map[f]] || '').trim() : '';
    pending = dataRows.map(r => {
      const rawDate = get(r, 'date');
      const iso = /^\d{4}-\d{2}-\d{2}/.test(rawDate) ? rawDate.slice(0, 10) : Store.isoFromUs(rawDate);
      let amount = parseFloat(get(r, 'amount').replace(/[$,()]/g, ''));
      if (/\(.*\)/.test(get(r, 'amount'))) amount = -amount;
      const cat = get(r, 'category');
      const who = get(r, 'who');
      return {
        include: true,
        date: iso || '',
        description: get(r, 'description'),
        amount: isNaN(amount) ? '' : Math.abs(Math.round(amount * 100) / 100),
        category: Store.CATEGORIES.includes(cat) ? cat : (cat ? '' : ''),
        catFromSource: Store.CATEGORIES.includes(cat),
        rawCategory: cat,
        who: Store.WHO.includes(who) ? who : 'Shared',
        whoFromSource: Store.WHO.includes(who),
        account: get(r, 'account'),
        notes: get(r, 'notes')
      };
    }).filter(p => p.date || p.description || p.amount !== '');
    if (!pending.length) { pending = null; App.toast('No usable rows found', 'warn'); }
    else {
      whoTouched = pending.some(p => p.whoFromSource);
      applyIntelligence(false);
      // Rows with no category from any source still need a human pick.
      for (const p of pending) if (!p.category && !p.rawCategory) p.category = 'Other';
    }
  }

  /* ---------- PDF path ---------- */
  let pdfjsPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (!pdfjsPromise) {
      pdfjsPromise = new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = PDFJS_URL;
        s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; res(); };
        s.onerror = () => { pdfjsPromise = null; rej(new Error('offline')); };
        document.head.appendChild(s);
      });
    }
    return pdfjsPromise;
  }

  async function handlePDF(file, root) {
    App.toast('Reading PDF…');
    try {
      await loadPdfJs();
    } catch (e) {
      return App.modal('PDF reader unavailable', `
        <p>The PDF engine loads from the network the first time and it couldn't be reached.
        While offline, use the screenshot route instead: paste the statement image into a
        Claude chat, ask for standard-schema CSV, and paste it on the Import screen.</p>`);
    }
    try {
      const buf = await file.arrayBuffer();
      const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
      const lines = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const byY = new Map();
        for (const item of tc.items) {
          if (!item.str.trim()) continue;
          const y = Math.round(item.transform[5] / 2) * 2; // bucket nearby baselines
          if (!byY.has(y)) byY.set(y, []);
          byY.get(y).push({ x: item.transform[4], str: item.str });
        }
        [...byY.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
          lines.push(items.sort((a, b) => a.x - b.x).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim());
        });
      }
      const rows = extractTxLines(lines);
      if (!rows.length) {
        return App.modal('No transactions found', `
          <p>Text was extracted from <b>${App.esc(file.name)}</b> but no transaction-shaped
          lines (date + amount) were recognized — some statements are images, not text.</p>
          <p>Fallback: screenshot the statement, paste it into a Claude chat, ask for
          standard-schema CSV, and paste the result on the Import screen.</p>`);
      }
      pending = rows;
      whoTouched = false;
      applyIntelligence(true);
      App.render();
    } catch (e) {
      App.toast('Could not read that PDF', 'warn');
    }
  }

  /* Heuristic: a transaction line starts with (or contains) a date and ends with an amount. */
  function extractTxLines(lines) {
    const year = new Date().getFullYear();
    const out = [];
    const dateRe = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
    const amtRe = /-?\(?\$?\s?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})\)?/g;
    const skipRe = /balance|payment due|minimum|apr|interest charged|fees charged|total|previous|available credit|statement/i;
    for (const line of lines) {
      const dm = line.match(dateRe);
      if (!dm) continue;
      if (skipRe.test(line)) continue;
      let last = null, m2;
      while ((m2 = amtRe.exec(line)) !== null) last = m2;
      amtRe.lastIndex = 0;
      if (!last) continue;
      const amount = parseFloat(last[0].replace(/[$,()\s]/g, ''));
      if (!amount || Math.abs(amount) > 100000) continue;
      let y = dm[3] ? +dm[3] : year;
      if (y < 100) y += 2000;
      const iso = y + '-' + String(+dm[1]).padStart(2, '0') + '-' + String(+dm[2]).padStart(2, '0');
      let desc = line.slice(dm.index + dm[0].length, line.lastIndexOf(last[0])).trim();
      desc = desc.replace(dateRe, '').replace(/\s+/g, ' ').trim(); // second (posted) date, if any
      out.push({
        include: true, date: iso, description: desc,
        amount: Math.abs(amount), category: guessCategory(desc),
        who: 'Shared', account: '', notes: ''
      });
    }
    return out;
  }

  function guessCategory(desc) {
    const d = desc.toLowerCase();
    const rules = [
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
    for (const [re, cat] of rules) if (re.test(d)) return cat;
    return 'Other';
  }

  /* ---------- review step ---------- */
  function renderReview(root) {
    const included = pending.filter(p => p.include);
    const autoCount = pending.filter(p => p.auto).length;
    root.innerHTML = `
      <div class="page">
        <div class="page-head">
          <h1>Review Import</h1>
          <button class="btn ghost" id="rev-cancel">Cancel</button>
        </div>
        <section class="card">
          <div class="card-head">
            <h2>${pending.length} rows from ${App.esc(sourceName)}</h2>
            <span class="card-note">${included.length} selected · ${Store.fmt$(included.reduce((s, p) => s + (+p.amount || 0), 0))}${autoCount ? ' · ' + autoCount + ' auto-categorized' : ''}</span>
          </div>
          <div class="rev-who-banner${whoTouched ? '' : ' unset'}">
            <label for="rev-who">Whose statement is this?</label>
            <select class="select" id="rev-who">
              <option value="">— choose, or set Who per row below —</option>
              ${App.options(Store.WHO)}
            </select>
            <span class="help" style="margin:0">${whoTouched
              ? 'Applies to every row here; you can still override individual rows in the table.'
              : '⚠ Not set yet — every row will default to "Shared" unless you pick someone.'}</span>
          </div>
          <div class="rev-tools">
            <label>Account for all rows
              <input class="input" id="rev-account" placeholder="e.g. Everyday Card" value=""></label>
          </div>
          <div class="table-scroll">
            <table class="table rev-table">
              <thead><tr><th></th><th>Date</th><th>Description</th><th class="num">Amount</th><th>Category</th><th>Who</th><th></th></tr></thead>
              <tbody>
                ${pending.map((p, i) => {
                  const bad = !p.date || p.amount === '' || !p.category;
                  const dup = !!Store.likelyDuplicate(p);
                  return `<tr class="${bad ? 'bad' : ''}${dup ? ' dup' : ''}">
                    <td><input type="checkbox" data-i="${i}" data-f="include" ${p.include ? 'checked' : ''} aria-label="Include row"></td>
                    <td><input class="input slim" type="date" value="${p.date}" data-i="${i}" data-f="date"></td>
                    <td><input class="input slim wide" value="${App.esc(p.description)}" data-i="${i}" data-f="description"></td>
                    <td><input class="input slim num" type="number" step="0.01" value="${p.amount}" data-i="${i}" data-f="amount"></td>
                    <td><select class="select slim" data-i="${i}" data-f="category">
                      ${p.category ? '' : `<option value="" selected>⚠ ${App.esc(p.rawCategory || 'pick')}</option>`}
                      ${App.options(Store.CATEGORIES, p.category)}</select></td>
                    <td><select class="select slim" data-i="${i}" data-f="who">${App.options(Store.WHO, p.who)}</select></td>
                    <td>${p.auto ? `<span class="pill auto" title="${p.auto === 'rule' ? 'Filled from a learned rule' : 'Matched a recurring budget line'}">auto</span>` : ''}
                        ${p.suggested ? '<span class="pill warn" title="Similar to a merchant you\'ve categorized before — double-check">suggested</span>' : ''}
                        ${dup ? '<span class="pill warn" title="A transaction with this amount at a similar merchant already exists within 3 days">dup</span>' : ''}
                        ${bad ? '<span class="pill bad">fix</span>' : ''}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <label class="learn-toggle"><input type="checkbox" id="rev-learn" checked>
            Remember these categorizations as rules for future imports</label>
          <div class="btn-row">
            <button class="btn gold" id="rev-commit">Import ${included.length} transaction${included.length === 1 ? '' : 's'}</button>
          </div>
          <p class="help">Rows marked <span class="pill auto">auto</span> were categorized for you — from a learned rule or a matching budget line.
             <span class="pill warn">suggested</span> rows are a best guess from a similar merchant you've categorized before — worth a second look before importing.
             <span class="pill warn">dup</span> rows look like an existing transaction (same amount, similar merchant, within 3 days) — uncheck them unless they're real repeats.
             <span class="pill bad">fix</span> rows are missing a valid date, amount, or category and will be skipped.</p>
        </section>
      </div>`;

    root.querySelectorAll('[data-f]').forEach(inp => {
      inp.addEventListener('change', () => {
        const p = pending[+inp.dataset.i];
        const f = inp.dataset.f;
        if (f === 'include') p.include = inp.checked;
        else if (f === 'amount') p.amount = inp.value === '' ? '' : Math.abs(parseFloat(inp.value) || 0);
        else p[f] = inp.value;
        if (f === 'who') whoTouched = true;
        if (f === 'include' || f === 'category' || f === 'date' || f === 'amount' || f === 'who') App.render();
      });
    });
    root.querySelector('#rev-account').addEventListener('change', e => {
      pending.forEach(p => p.account = e.target.value.trim());
    });
    root.querySelector('#rev-who').addEventListener('change', e => {
      if (e.target.value) { pending.forEach(p => p.who = e.target.value); whoTouched = true; App.render(); }
    });
    root.querySelector('#rev-cancel').addEventListener('click', () => { pending = null; App.render(); });
    root.querySelector('#rev-commit').addEventListener('click', () => {
      const good = pending.filter(p => p.include && p.date && p.amount !== '' && p.category);
      if (!good.length) return App.toast('Nothing valid selected', 'warn');
      const skipped = pending.filter(p => p.include).length - good.length;

      const learn = root.querySelector('#rev-learn').checked;
      const commit = () => {
        const ids = [];
        const ruleCountBefore = Store.data.rules.length;
        for (const p of good) {
          const id = Store.uid();
          ids.push(id);
          Store.data.transactions.push({
            id, date: p.date, category: p.category,
            description: p.description.trim(), amount: +p.amount,
            who: p.who, account: p.account.trim(), notes: (p.notes || '').trim()
          });
          // Re-learning an auto row is a no-op upsert; new/corrected rows become rules.
          if (learn) Store.learnRule(p.description, p.category, p.who);
        }
        Store.addImportBatch(sourceName, ids);
        Store.touchTransactions(); Store.save();
        const newRules = Store.data.rules.length - ruleCountBefore;
        pending = null;
        App.toast('Imported ' + good.length + ' transactions'
          + (newRules ? ' · learned ' + newRules + ' rule' + (newRules === 1 ? '' : 's') : '')
          + (skipped ? ' · ' + skipped + ' skipped' : ''));
        location.hash = '#/transactions';
      };

      // Skipped rows (missing date/amount/category) silently vanish otherwise —
      // make the user confirm rather than losing rows without noticing.
      if (skipped > 0) {
        App.confirmDialog('Some rows will be skipped',
          `${skipped} checked row${skipped === 1 ? '' : 's'} ${skipped === 1 ? 'is' : 'are'} missing a valid date, amount, or category and marked <span class="pill bad">fix</span> in the table — ${skipped === 1 ? 'it' : 'they'} will NOT be imported. Continue with the other ${good.length}?`,
          'Import ' + good.length, commit);
      } else {
        commit();
      }
    });
  }
})();
