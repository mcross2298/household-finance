/* Ask — AI Financial Assistant (⌘J). Sends only an aggregated JSON context
   (see buildContext()) plus the typed question to a Cloudflare Worker route
   that proxies the Claude API — see worker/index.js. Never sends raw
   transactions, account numbers, or the Supabase session token; the answer
   is always paired with the same insights() links the rest of the app
   already uses, so it's checkable, not a black box. */
(function () {
  'use strict';
  window.Views = window.Views || {};

  const ASK_ENDPOINT = '/api/ask';
  const TIMEOUT_MS = 15000;
  const RECAP_Q = "Give me this week's recap";
  const SUGGESTED = ['Are we over budget this month?', 'Are we on pace for the house goal?', RECAP_Q];

  let log = [];      // { role: 'user'|'assistant'|'error', text, links, retry, retryRecap }
  let asking = false;
  let mountedRoot = null;

  /* Monday of the current week, ISO date — the key a recap is cached under. */
  function weekKey(d) {
    d = d || new Date();
    const dow = (d.getDay() + 6) % 7; // 0 = Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() - dow);
    return monday.toISOString().slice(0, 10);
  }

  function buildContext() {
    const S = Store;
    const ym = S.thisMonth();
    const snap = S.householdSnapshot(ym);
    return {
      month: ym,
      incomeTotal: S.incomeTotal(),
      budgetTotal: S.budgetTotal(),
      surplus: snap.surplus,
      savingsRate: snap.savingsRate,
      safeToSpend: snap.safeToSpend,
      spendByCategory: S.spendByCategory(ym),
      budgetByCategory: S.budgetByCategory(),
      categoryTrends: S.categoryTrends(ym),
      goals: snap.goals,
      netWorth: snap.netWorth.latest,
      debt: snap.debt,
      insights: snap.insights.map(i => i.text)
    };
  }

  function fallbackAnswer() {
    const items = Store.insights();
    return {
      text: items.length
        ? "Couldn't reach the assistant — here's what we know locally:"
        : "Couldn't reach the assistant, and there's nothing notable in your data right now — you're on track.",
      links: items
    };
  }

  async function ask(question, isRecap) {
    log.push({ role: 'user', text: question });
    asking = true;
    renderLog();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ASK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, context: buildContext() }),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.answer) throw new Error((data && data.error) || 'bad response');
      log.push({ role: 'assistant', text: data.answer, links: Store.insights() });
      if (isRecap) {
        Store.data.recaps[weekKey()] = { text: data.answer, ts: new Date().toISOString() };
        Store.save();
      }
    } catch (e) {
      const fb = fallbackAnswer();
      log.push({ role: 'error', text: fb.text, links: fb.links, retry: question, retryRecap: !!isRecap });
    } finally {
      clearTimeout(timer);
      asking = false;
      renderLog();
    }
  }

  function bubble(entry) {
    const links = entry.links && entry.links.length ? UI.insightList(entry.links) : '';
    if (entry.role === 'user') return `<div class="ask-bubble ask-user">${App.esc(entry.text)}</div>`;
    if (entry.role === 'error') {
      return `<div class="ask-bubble ask-assistant ask-error">
        <div>${App.esc(entry.text)}</div>
        ${links}
        <button type="button" class="btn ghost sm" data-retry="${App.esc(entry.retry)}"${entry.retryRecap ? ' data-retry-recap="1"' : ''}>Retry</button>
      </div>`;
    }
    return `<div class="ask-bubble ask-assistant">
      <div>${App.esc(entry.text)}</div>
      ${links}
    </div>`;
  }

  function renderLog() {
    const root = mountedRoot;
    const logEl = root && root.querySelector('#ask-log');
    if (!logEl) return; // navigated away mid-request
    logEl.innerHTML = log.length
      ? log.map(bubble).join('') + (asking
          ? `<div class="ask-bubble ask-assistant ask-typing" aria-label="Assistant is answering"><span></span><span></span><span></span></div>`
          : '')
      : `<div class="ask-bubble ask-assistant">Ask about spending, goals, or bills — or pick one below.</div>`;
    logEl.scrollTop = logEl.scrollHeight;
    logEl.querySelectorAll('[data-retry]').forEach(btn =>
      btn.addEventListener('click', () => {
        log.pop();
        ask(btn.dataset.retry, btn.dataset.retryRecap === '1');
      }));
    const saveBtn = root.querySelector('#ask-form button[type=submit]');
    if (saveBtn) saveBtn.disabled = asking;
  }

  Views.assistant = function (root) {
    mountedRoot = root;
    root.innerHTML = `
      <div class="page ask-page">
        <div class="page-head"><h1>Ask</h1></div>
        <div class="card ask-card">
          <div class="ask-log" id="ask-log"></div>
          <div class="ask-chips">
            ${SUGGESTED.map((q, i) => `<button type="button" class="qf-chip" data-chip="${i}">${App.esc(q)}</button>`).join('')}
          </div>
          <form id="ask-form" class="ask-form">
            <input class="input" id="ask-input" type="text" placeholder="Type a question…" autocomplete="off" aria-label="Ask a question">
            <button class="btn gold" type="submit">Ask</button>
          </form>
          <p class="help">Answers are generated from your own budget/transaction data — nothing leaves the app except the question and an aggregated summary, never raw account numbers.</p>
        </div>
      </div>`;
    renderLog();
    root.querySelectorAll('[data-chip]').forEach(btn =>
      btn.addEventListener('click', () => {
        if (asking) return;
        const q = SUGGESTED[+btn.dataset.chip];
        ask(q, q === RECAP_Q);
      }));
    root.querySelector('#ask-form').addEventListener('submit', e => {
      e.preventDefault();
      if (asking) return;
      const input = root.querySelector('#ask-input');
      const q = input.value.trim();
      if (!q) return;
      input.value = '';
      ask(q, /week.?s?\s+recap/i.test(q));
    });
  };

  /* Read by the Executive Summary's recap card — null until someone has
     asked the recap question at least once this week. */
  window.Assistant = {
    weekKey,
    latestRecap() {
      const recaps = (Store.data && Store.data.recaps) || {};
      return recaps[weekKey()] || null;
    }
  };
})();
