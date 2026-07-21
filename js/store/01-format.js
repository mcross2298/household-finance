/* ---- formatting — money/date/percent, month helpers ---- */
'use strict';

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

