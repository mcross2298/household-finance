/* Household Finance — the JS half of the motion system. The CSS half lives in
   the --motion-* tokens in styles.css; durations are read back out of those
   tokens rather than duplicated here, so the scale has exactly one definition
   and check-token-drift.mjs guards both halves at once. */
(function () {
  'use strict';

  const EASE_OUT_QUART = t => 1 - Math.pow(1 - t, 4);

  function reduced() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* Token value in ms. Falls back to the literal default if the stylesheet
     hasn't parsed yet (first paint on a cold cache), which keeps motion
     working rather than collapsing to 0 and looking like a bug. */
  const durCache = {};
  function dur(name, fallback) {
    if (durCache[name] != null) return durCache[name];
    let ms = fallback;
    try {
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--motion-' + name).trim();
      if (raw) ms = raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
    } catch (e) { /* fallback */ }
    if (!ms || isNaN(ms)) ms = fallback;
    return (durCache[name] = ms);
  }

  /* Per-item entrance delay. Capped so a 19-category bar chart doesn't take
     three quarters of a second to finish arriving. */
  const STAGGER_MS = 40;
  const STAGGER_CAP = 320;
  const stagger = i => Math.min(i * STAGGER_MS, STAGGER_CAP);

  /* Animate a number to its final value. `format` renders each frame, so the
     caller keeps ownership of money/percent formatting. Always lands exactly
     on `to` — the last frame assigns the target rather than an eased
     approximation of it. */
  function countUp(el, to, format, ms) {
    if (!el) return;
    const fmt = format || (n => String(Math.round(n)));
    to = +to || 0;
    if (reduced()) { el.textContent = fmt(to); return; }
    const from = 0;
    const total = ms || dur('slow', 400);
    const t0 = performance.now();
    el.textContent = fmt(from);
    const step = now => {
      const t = Math.min(1, (now - t0) / total);
      if (t >= 1) { el.textContent = fmt(to); return; }
      el.textContent = fmt(from + (to - from) * EASE_OUT_QUART(t));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* Transition a node from an initial style to its natural one. The initial
     values are applied synchronously, then cleared on the next frame so the
     browser has a starting box to animate from — setting both in one frame
     would just paint the end state. */
  function enter(node, initial, delay, ms) {
    if (!node || reduced()) return;
    const total = ms || dur('base', 240);
    for (const k in initial) node.style.setProperty(k, initial[k]);
    requestAnimationFrame(() => {
      node.style.transition = Object.keys(initial)
        .map(k => `${k} ${total}ms cubic-bezier(.25,1,.5,1) ${delay || 0}ms`).join(', ');
      requestAnimationFrame(() => {
        for (const k in initial) node.style.removeProperty(k);
      });
    });
  }

  /* Entrance motion is armed by the router on a real route change only.
     render() also runs for in-place edits — a filter, a month step, one cell
     of an import review — and re-sweeping every chart and re-counting every
     figure on those would be noise, not polish. */
  let armedFlag = false;
  const arm = () => { armedFlag = !reduced(); };
  const armed = () => armedFlag;
  const disarm = () => { armedFlag = false; };

  /* Count up anything the view tagged with data-countup, then disarm. The
     attribute carries the raw number; the element's existing text is already
     the correctly formatted final value, so it's also the fallback. */
  function runEntrance(root) {
    if (!armedFlag) return;
    (root || document).querySelectorAll('[data-countup]').forEach(el => {
      const to = parseFloat(el.getAttribute('data-countup'));
      if (isNaN(to)) return;
      const final = el.textContent;
      const digits = el.getAttribute('data-countup-digits');
      countUp(el, to, n => (window.Store ? Store.fmt$(n, digits == null ? 0 : +digits) : String(Math.round(n))));
      setTimeout(() => { el.textContent = final; }, dur('slow', 400) + 30);
    });
    disarm();
  }

  window.Motion = { reduced, countUp, enter, stagger, dur, arm, armed, disarm, runEntrance };
})();
