/* Household Finance — small inline SVG icon set (replaces unicode glyphs in nav/tiles).
   Consistent 24x24 stroke style so every screen entry point reads as one family. */
(function () {
  'use strict';
  const wrap = inner => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  window.Icons = {
    home: wrap('<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/>'),
    list: wrap('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/>'),
    upload: wrap('<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
    grid: wrap('<rect x="4" y="4" width="7" height="7" rx="1.2"/><rect x="13" y="4" width="7" height="7" rx="1.2"/><rect x="4" y="13" width="7" height="7" rx="1.2"/><rect x="13" y="13" width="7" height="7" rx="1.2"/>'),
    target: wrap('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.2"/><circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none"/>'),
    house: wrap('<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9"/><rect x="10" y="14" width="4" height="6"/>'),
    trend: wrap('<polyline points="4,17 10,11 14,15 20,7"/><polyline points="14,7 20,7 20,13"/>'),
    sparkle: wrap('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
    exchange: wrap('<polyline points="4,7 8,3 8,7"/><path d="M8 3H16a4 4 0 0 1 4 4v2"/><polyline points="20,17 16,21 16,17"/><path d="M16 21H8a4 4 0 0 1-4-4v-2"/>'),
    stack: wrap('<polygon points="12,3 21,8 12,13 3,8"/><polyline points="3,13 12,18 21,13"/>'),
    bank: wrap('<path d="M3 9.5 12 4l9 5.5"/><line x1="5" y1="10" x2="5" y2="17"/><line x1="9.7" y1="10" x2="9.7" y2="17"/><line x1="14.3" y1="10" x2="14.3" y2="17"/><line x1="19" y1="10" x2="19" y2="17"/><line x1="3" y1="20" x2="21" y2="20"/>'),
    debt: wrap('<rect x="3" y="6" width="18" height="13" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="15" x2="13" y2="15"/>'),
    calendar: wrap('<rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/><circle cx="12" cy="15" r=".9" fill="currentColor" stroke="none"/>'),
    search: wrap('<circle cx="11" cy="11" r="6.5"/><line x1="15.8" y1="15.8" x2="20.5" y2="20.5"/>'),
    sun: wrap('<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5" y1="5" x2="6.8" y2="6.8"/><line x1="17.2" y1="17.2" x2="19" y2="19"/><line x1="5" y1="19" x2="6.8" y2="17.2"/><line x1="17.2" y1="6.8" x2="19" y2="5"/>'),
    moon: wrap('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>')
  };
})();
