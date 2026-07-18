/* Household Finance — lightweight SVG charts (no libraries).
   Palette validated for CVD + contrast. 'Shared' is always gold; household
   members are assigned colors by roster order from the palettes below, so the
   chart legend stays stable no matter how many people are in the household.
   The first two palette slots keep a blue / pink pairing for a two-person home. */
(function () {
  'use strict';

  const SHARED_COLOR = '#B8860B';
  const MEMBER_PALETTE = ['#3567AC', '#B04A79', '#6A4C93', '#2E8B57', '#C1666B', '#4A6FA5'];
  const MEMBER_PALETTE_DARK = ['#3E8AEF', '#D9497A', '#9B7EDE', '#3FB57A', '#E0796F', '#6BA3E8'];

  function chartsDark() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  /* Color for a 'who' value: gold for Shared, else the roster-indexed palette
     slot. Unknown names (e.g. data for a member since removed) fall back to grey. */
  function whoColor(name, dark) {
    if (dark == null) dark = chartsDark();
    if (name === 'Shared') return SHARED_COLOR;
    const roster = (window.Store && Store.data && Store.data.members) || [];
    const idx = roster.indexOf(name);
    const pal = dark ? MEMBER_PALETTE_DARK : MEMBER_PALETTE;
    if (idx < 0) return dark ? '#8A94A6' : '#888';
    return pal[idx % pal.length];
  }
  /* Back-compat proxies: older call sites did WHO_COLORS[name]. A Proxy keeps
     that read working while the colors are now computed from the live roster. */
  const WHO_COLORS = new Proxy({}, { get: (_, k) => whoColor(String(k), false) });
  const WHO_COLORS_DARK = new Proxy({}, { get: (_, k) => whoColor(String(k), true) });
  const BAR = '#3567AC';
  const GOLD = '#B8860B';
  const OVER = '#C0392B';

  const SVG = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVG, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  /* shared tooltip */
  const tip = () => document.getElementById('tooltip');
  function showTip(evt, html) {
    const t = tip(); if (!t) return;
    t.innerHTML = html;
    t.style.display = 'block';
    t.setAttribute('aria-hidden', 'false');
    moveTip(evt);
  }
  function moveTip(evt) {
    const t = tip(); if (!t || t.style.display === 'none') return;
    const pad = 12;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const r = t.getBoundingClientRect();
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - pad;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() {
    const t = tip(); if (!t) return;
    t.style.display = 'none';
    t.setAttribute('aria-hidden', 'true');
  }
  function hoverable(node, html) {
    node.addEventListener('pointerenter', e => showTip(e, html));
    node.addEventListener('pointermove', moveTip);
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('pointerdown', e => showTip(e, html));
  }

  const fmt$ = (n) => Store.fmt$(n);

  const WARN = '#B45309';

  /* Horizontal bars: actual spend per category with a budget tick.
     items: [{label, value, budget}]. onClick(item), when given, makes each row a
     tappable drill-down target (e.g. jump to that category's transactions).
     pace (0..1, optional): how far through the month we are — bars running ahead
     of pace turn amber before they turn over-budget red, and a dashed tick marks
     the expected-by-today point. */
  function categoryBars(container, items, onClick, pace) {
    container.innerHTML = '';
    if (!items.length) { container.innerHTML = '<p class="empty">No spending recorded for this month yet.</p>'; return; }
    const rowH = 34, labelW = 128, valueW = 84, h = items.length * rowH;
    const w = Math.max(320, container.clientWidth || 560);
    const plotW = w - labelW - valueW;
    const max = Math.max(...items.map(i => Math.max(i.value, i.budget || 0))) * 1.05 || 1;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, role: 'img' }, container);
    items.forEach((it, i) => {
      const y = i * rowH, cy = y + rowH / 2;
      const bw = Math.max(2, it.value / max * plotW);
      const over = it.budget > 0 && it.value > it.budget;
      const expected = pace > 0 && it.budget > 0 ? it.budget * pace : null;
      const ahead = !over && expected != null && it.value > expected * 1.1;
      const lbl = el('text', { x: labelW - 10, y: cy + 4, 'text-anchor': 'end', class: 'c-label' }, svg);
      lbl.textContent = it.label;
      el('rect', { x: labelW, y: cy - 7, width: plotW, height: 14, rx: 4, class: 'c-track' }, svg);
      el('rect', { x: labelW, y: cy - 7, width: bw, height: 14, rx: 4, fill: over ? OVER : (ahead ? WARN : BAR) }, svg);
      if (it.budget > 0) {
        const bx = labelW + Math.min(1, it.budget / max) * plotW;
        el('line', { x1: bx, x2: bx, y1: cy - 11, y2: cy + 11, class: 'c-budget-tick' }, svg);
      }
      if (expected != null && pace < 1) {
        const px = labelW + Math.min(1, expected / max) * plotW;
        el('line', { x1: px, x2: px, y1: cy - 9, y2: cy + 9, class: 'c-pace-tick' }, svg);
      }
      // value labels live in their own right-hand column so they never collide
      // with the budget tick
      const val = el('text', { x: w - 4, y: cy + 4, 'text-anchor': 'end', class: 'c-value' + (over ? ' over' : '') }, svg);
      val.textContent = fmt$(it.value);
      // full-row transparent hit target on top, so hover/tap works anywhere in the row
      const hit = el('rect', {
        x: 0, y, width: w, height: rowH, fill: 'transparent',
        class: onClick ? 'c-hit clickable' : 'c-hit'
      }, svg);
      hoverable(hit, `<strong>${it.label}</strong><br>Spent ${fmt$(it.value)}` +
        (it.budget > 0 ? `<br>Budget ${fmt$(it.budget)} · ${over ? '<span class="tip-over">over by ' + fmt$(it.value - it.budget) + '</span>' : fmt$(it.budget - it.value) + ' left'}` : '') +
        (ahead ? `<br><span class="tip-warn">ahead of pace — ${fmt$(expected)} expected by today</span>` : ''));
      if (onClick) {
        hit.setAttribute('tabindex', '0');
        hit.setAttribute('role', 'button');
        hit.setAttribute('aria-label', `View ${it.label} transactions`);
        hit.addEventListener('click', () => onClick(it));
        hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(it); } });
      }
    });
  }

  /* Donut: spend by person, direct-labeled, center total.
     onClick(who), when given, makes each segment + legend item a drill-down target. */
  function whoDonut(container, map, dark, onClick) {
    container.innerHTML = '';
    const colors = dark ? WHO_COLORS_DARK : WHO_COLORS;
    const entries = Object.entries(map).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (!total) { container.innerHTML = '<p class="empty">No spending recorded for this month yet.</p>'; return; }
    const size = 210, cx = size / 2, cy = size / 2, r = 74, thick = 26;
    const wrap = document.createElement('div');
    wrap.className = 'donut-wrap';
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img' });
    let a0 = -Math.PI / 2;
    entries.forEach(([who, v]) => {
      const frac = v / total;
      const a1 = a0 + frac * Math.PI * 2;
      const gap = entries.length > 1 ? 0.028 : 0; // ~2px surface gap between segments
      const s = a0 + gap / 2, e = Math.max(s + 0.01, a1 - gap / 2);
      const large = (e - s) > Math.PI ? 1 : 0;
      const p = `M ${cx + r * Math.cos(s)} ${cy + r * Math.sin(s)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(e)} ${cy + r * Math.sin(e)}`;
      const arc = el('path', {
        d: p, fill: 'none', stroke: colors[who], 'stroke-width': thick, 'stroke-linecap': 'butt',
        class: onClick ? 'clickable' : ''
      }, svg);
      hoverable(arc, `<strong>${who}</strong><br>${fmt$(v)} · ${Store.fmtPct(frac, 0)}`);
      if (onClick) {
        arc.setAttribute('tabindex', '0');
        arc.setAttribute('role', 'button');
        arc.setAttribute('aria-label', `View ${who} transactions`);
        arc.addEventListener('click', () => onClick(who));
        arc.addEventListener('keydown', e2 => { if (e2.key === 'Enter' || e2.key === ' ') { e2.preventDefault(); onClick(who); } });
      }
      // direct label outside the arc
      const mid = (s + e) / 2, lr = r + thick / 2 + 12;
      const tx = cx + lr * Math.cos(mid), ty = cy + lr * Math.sin(mid);
      const t = el('text', {
        x: tx, y: ty + 4, class: 'c-donut-label',
        'text-anchor': Math.cos(mid) > 0.35 ? 'start' : (Math.cos(mid) < -0.35 ? 'end' : 'middle')
      }, svg);
      t.textContent = who + ' ' + Store.fmtPct(frac, 0);
      a0 = a1;
    });
    const c1 = el('text', { x: cx, y: cy - 2, 'text-anchor': 'middle', class: 'c-donut-total' }, svg);
    c1.textContent = fmt$(total);
    const c2 = el('text', { x: cx, y: cy + 16, 'text-anchor': 'middle', class: 'c-donut-sub' }, svg);
    c2.textContent = 'this month';
    wrap.appendChild(svg);
    const legend = document.createElement('div');
    legend.className = 'legend';
    entries.forEach(([who, v]) => {
      const item = document.createElement(onClick ? 'button' : 'span');
      item.className = 'legend-item' + (onClick ? ' clickable' : '');
      item.innerHTML = `<span class="swatch" style="background:${colors[who]}"></span>${who} <b>${fmt$(v)}</b>`;
      if (onClick) item.addEventListener('click', () => onClick(who));
      legend.appendChild(item);
    });
    wrap.appendChild(legend);
    container.appendChild(wrap);
  }

  /* Column trend: total spend per month with a budget reference line.
     onClick(month), when given, makes each month a tappable target (e.g. re-scope the Dashboard to it). */
  function trendColumns(container, months, values, budget, onClick) {
    container.innerHTML = '';
    if (!months.length) { container.innerHTML = '<p class="empty">No history yet.</p>'; return; }
    const w = Math.max(320, container.clientWidth || 560), h = 190;
    const padL = 8, padR = 8, padT = 18, padB = 26;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const max = Math.max(budget || 0, ...values) * 1.1 || 1;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, role: 'img' }, container);
    const n = months.length;
    const slot = plotW / n, bw = Math.min(44, Math.max(10, slot - 8));
    if (budget > 0) {
      const by = padT + (1 - budget / max) * plotH;
      el('line', { x1: padL, x2: w - padR, y1: by, y2: by, class: 'c-ref-line' }, svg);
      const t = el('text', { x: w - padR, y: by - 5, 'text-anchor': 'end', class: 'c-ref-label' }, svg);
      t.textContent = 'budget ' + fmt$(budget);
    }
    months.forEach((ym, i) => {
      const v = values[i];
      const x = padL + slot * i + (slot - bw) / 2;
      const bh = Math.max(v > 0 ? 3 : 0, v / max * plotH);
      const y = padT + plotH - bh;
      const over = budget > 0 && v > budget;
      if (bh > 0) {
        el('rect', { x, y, width: bw, height: bh, rx: 4, fill: over ? OVER : BAR }, svg);
      }
      const t = el('text', { x: x + bw / 2, y: h - 8, 'text-anchor': 'middle', class: 'c-label' }, svg);
      t.textContent = Store.MONTHS[+ym.slice(5) - 1];
      // full-column hit target (covers the label too) so the whole slot is tappable
      const hit = el('rect', {
        x: padL + slot * i, y: 0, width: slot, height: h, fill: 'transparent',
        class: onClick ? 'c-hit clickable' : 'c-hit'
      }, svg);
      hoverable(hit, `<strong>${Store.fmtMonth(ym)}</strong><br>${fmt$(v)}` +
        (budget > 0 ? `<br>${over ? '<span class="tip-over">over budget</span>' : fmt$(budget - v) + ' under budget'}` : ''));
      if (onClick) {
        hit.setAttribute('tabindex', '0');
        hit.setAttribute('role', 'button');
        hit.setAttribute('aria-label', `View ${Store.fmtMonth(ym)}`);
        hit.addEventListener('click', () => onClick(ym));
        hit.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(ym); } });
      }
    });
  }

  /* Line/area chart: one series over months. points: [{ym, value, tone?}].
     Draws a zero reference line when the series crosses it; points with
     tone 'warn'/'bad' get colored markers (used for tight forecast months). */
  function line(container, points, opts) {
    opts = opts || {};
    container.innerHTML = '';
    if (!points.length) { container.innerHTML = '<p class="empty">' + (opts.empty || 'No data yet.') + '</p>'; return; }
    const w = Math.max(320, container.clientWidth || 560), h = 200;
    const padL = 8, padR = 46, padT = 16, padB = 26;
    const plotW = w - padL - padR, plotH = h - padT - padB;
    const vals = points.map(p => p.value);
    let min = Math.min(0, ...vals), max = Math.max(...vals);
    if (min === max) { max = min + 1; }
    const span = max - min;
    min -= span * 0.06; max += span * 0.06;
    const X = i => points.length === 1 ? padL + plotW / 2 : padL + i / (points.length - 1) * plotW;
    const Y = v => padT + (1 - (v - min) / (max - min)) * plotH;
    const svg = el('svg', { viewBox: `0 0 ${w} ${h}`, width: '100%', height: h, role: 'img' }, container);
    if (min < 0 && max > 0) {
      el('line', { x1: padL, x2: w - padR, y1: Y(0), y2: Y(0), class: 'c-ref-line' }, svg);
    }
    const path = points.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.value).toFixed(1)).join(' ');
    el('path', {
      d: path + ` L ${X(points.length - 1).toFixed(1)} ${padT + plotH} L ${X(0).toFixed(1)} ${padT + plotH} Z`,
      class: 'c-area'
    }, svg);
    el('path', { d: path, fill: 'none', class: 'c-line' }, svg);
    points.forEach((p, i) => {
      const color = p.tone === 'bad' ? OVER : p.tone === 'warn' ? WARN : BAR;
      el('circle', {
        cx: X(i), cy: Y(p.value), r: i === points.length - 1 ? 4.5 : 3,
        fill: color, class: 'c-dot'
      }, svg);
      // sparse x labels: first, last, and every ~3rd in between
      if (i === 0 || i === points.length - 1 || i % 3 === 0) {
        const t = el('text', { x: X(i), y: h - 8, 'text-anchor': 'middle', class: 'c-label' }, svg);
        t.textContent = Store.MONTHS[+p.ym.slice(5) - 1];
      }
      const hit = el('rect', {
        x: X(i) - (plotW / points.length) / 2, y: 0, width: plotW / points.length, height: h,
        fill: 'transparent', class: 'c-hit'
      }, svg);
      hoverable(hit, `<strong>${Store.fmtMonth(p.ym)}</strong><br>${fmt$(p.value)}` +
        (p.tip ? '<br>' + p.tip : ''));
    });
    const endVal = el('text', {
      x: w - 4, y: Y(points[points.length - 1].value) + 4, 'text-anchor': 'end', class: 'c-value'
    }, svg);
    endVal.textContent = fmt$(points[points.length - 1].value);
  }

  /* Progress ring (goals). pct 0..1. Pass color to override the default gold stroke
     (e.g. a brighter gold for use on a navy card — pair with the .ring-on-navy CSS class
     on the container for readable track/text). */
  function ring(container, pct, centerText, subText, color) {
    container.innerHTML = '';
    const size = 92, cx = size / 2, cy = size / 2, r = 38, thick = 9;
    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img' }, container);
    el('circle', { cx, cy, r, fill: 'none', class: 'c-ring-track', 'stroke-width': thick }, svg);
    const circ = 2 * Math.PI * r;
    el('circle', {
      cx, cy, r, fill: 'none', stroke: color || GOLD, 'stroke-width': thick,
      'stroke-linecap': 'round', 'stroke-dasharray': circ,
      'stroke-dashoffset': circ * (1 - Math.min(1, Math.max(0, pct))),
      transform: `rotate(-90 ${cx} ${cy})`
    }, svg);
    const t1 = el('text', { x: cx, y: cy + (subText ? 0 : 5), 'text-anchor': 'middle', class: 'c-ring-pct' }, svg);
    t1.textContent = centerText != null ? centerText : Math.round(pct * 100) + '%';
    if (subText) {
      const t2 = el('text', { x: cx, y: cy + 15, 'text-anchor': 'middle', class: 'c-ring-sub' }, svg);
      t2.textContent = subText;
    }
  }

  window.Charts = { categoryBars, whoDonut, trendColumns, ring, line, WHO_COLORS, WHO_COLORS_DARK, whoColor, hoverable };
})();
