/* Quick Tour — a short guided walkthrough of the app's screens for first-time
   users. Steps are read from Features (js/features.js), so a screen added
   there shows up here automatically. Auto-launches once, the first time the
   app is ever opened (tracked in localStorage, not Store data, so it isn't
   part of a JSON backup and doesn't replay on the other phone). Reachable any
   time after that via the 🧭 button in the nav or the Executive Summary. */
(function () {
  'use strict';
  const SEEN_KEY = 'householdFinance.tourSeen';
  let i = 0;

  function seen() {
    try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; }
  }
  function markSeen() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* private mode — tour just replays next open */ }
  }

  function renderStep() {
    const steps = window.Features || [];
    const f = steps[i];
    const last = i === steps.length - 1;
    const m = App.modal('Quick Tour · ' + (i + 1) + ' of ' + steps.length, `
      <div class="tour-step">
        <div class="tour-ico" aria-hidden="true">${(window.Icons && Icons[f.icon]) || ''}</div>
        <h3>${App.esc(f.title)}</h3>
        <p>${App.esc(f.blurb)}</p>
      </div>
      <div class="tour-dots" aria-hidden="true">
        ${steps.map((s, n) => `<span class="tour-dot${n === i ? ' active' : ''}"></span>`).join('')}
      </div>
      <div class="btn-row tour-actions">
        ${i > 0 ? '<button class="btn ghost" data-act="back">Back</button>' : '<span></span>'}
        <div class="btn-row" style="margin:0">
          <button class="btn ghost" data-act="skip">Skip</button>
          <button class="btn gold" data-act="next">${last ? 'Go to ' + f.title : 'Next'}</button>
        </div>
      </div>`, { onClose: markSeen });

    m.el.querySelector('[data-act=next]').addEventListener('click', () => {
      if (last) { m.close(); location.hash = '#/' + f.route; return; }
      i++; m.close(); renderStep();
    });
    const back = m.el.querySelector('[data-act=back]');
    if (back) back.addEventListener('click', () => { i--; m.close(); renderStep(); });
    m.el.querySelector('[data-act=skip]').addEventListener('click', () => { markSeen(); m.close(); });
  }

  function open(startAt) {
    i = typeof startAt === 'number' ? startAt : 0;
    renderStep();
  }

  function maybeAutoStart() {
    if (seen() || !(window.Features || []).length) return;
    open(0);
  }

  window.Tour = { open, maybeAutoStart };

  ['tour-btn-desktop', 'tour-btn-mobile'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('click', () => open(0));
  });
})();
