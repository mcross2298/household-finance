/* Household Finance — light/dark toggle. Defaults to the OS preference; an explicit
   choice (stored in localStorage) overrides it in either direction. The attribute
   itself is set as early as possible by an inline snippet in index.html <head> so
   there's no flash of the wrong theme before this file loads. */
(function () {
  'use strict';
  const KEY = 'householdFinance.theme';
  const mq = window.matchMedia('(prefers-color-scheme: dark)');

  function effective() {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark' || t === 'light') return t;
    return mq.matches ? 'dark' : 'light';
  }
  function applyIcon() {
    const isDark = effective() === 'dark';
    document.querySelectorAll('.theme-toggle').forEach(btn => {
      btn.innerHTML = window.Icons ? Icons[isDark ? 'sun' : 'moon'] : '';
      btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    });
  }
  function toggle() {
    const next = effective() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem(KEY, next); } catch (e) { /* private mode etc — theme just won't persist */ }
    applyIcon();
  }

  document.querySelectorAll('.theme-toggle').forEach(btn => btn.addEventListener('click', toggle));
  mq.addEventListener('change', applyIcon);
  applyIcon();
})();
