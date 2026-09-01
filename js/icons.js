/* Cross' Finances — small inline SVG icon set (replaces unicode glyphs in nav/tiles).
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
    report: wrap('<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><polyline points="14,3 14,8 19,8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>'),
    bank: wrap('<path d="M3 9.5 12 4l9 5.5"/><line x1="5" y1="10" x2="5" y2="17"/><line x1="9.7" y1="10" x2="9.7" y2="17"/><line x1="14.3" y1="10" x2="14.3" y2="17"/><line x1="19" y1="10" x2="19" y2="17"/><line x1="3" y1="20" x2="21" y2="20"/>'),
    debt: wrap('<rect x="3" y="6" width="18" height="13" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="7" y1="15" x2="13" y2="15"/>'),
    calendar: wrap('<rect x="4" y="5" width="16" height="15" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="9" y1="3" x2="9" y2="7"/><line x1="15" y1="3" x2="15" y2="7"/><circle cx="12" cy="15" r=".9" fill="currentColor" stroke="none"/>'),
    search: wrap('<circle cx="11" cy="11" r="6.5"/><line x1="15.8" y1="15.8" x2="20.5" y2="20.5"/>'),
    sun: wrap('<circle cx="12" cy="12" r="4.2"/><line x1="12" y1="2.5" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="21.5"/><line x1="2.5" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="21.5" y2="12"/><line x1="5" y1="5" x2="6.8" y2="6.8"/><line x1="17.2" y1="17.2" x2="19" y2="19"/><line x1="5" y1="19" x2="6.8" y2="17.2"/><line x1="17.2" y1="6.8" x2="19" y2="5"/>'),
    moon: wrap('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>'),
    compass: wrap('<circle cx="12" cy="12" r="9"/><polygon points="15.5,8.5 13.2,13.2 8.5,15.5 10.8,10.8"/>'),
    plus: wrap('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'),
    close: wrap('<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>'),
    check: wrap('<polyline points="4,12.5 9.5,18 20,6.5"/>'),
    alert: wrap('<path d="M12 4 21 19.5H3z"/><line x1="12" y1="10" x2="12" y2="14.5"/><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none"/>'),
    download: wrap('<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>'),
    share: wrap('<path d="M12 15V4"/><path d="M7.5 8.5 12 4l4.5 4.5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>'),
    print: wrap('<path d="M7 9V4h10v5"/><path d="M7 18H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="15" width="10" height="6" rx="1"/>'),
    gear: wrap('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3.4a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 2.7-1.1V3.4a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.8 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z"/>'),
    lock: wrap('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7"/>'),
    flame: wrap('<path d="M12 3s5 4.2 5 8.6a5 5 0 0 1-10 0C7 9.4 9 8 9 8s.4 2 1.6 2.6C11.4 8.6 12 6 12 3z"/>'),
    freeze: wrap('<line x1="12" y1="3" x2="12" y2="21"/><line x1="4.2" y1="7.5" x2="19.8" y2="16.5"/><line x1="4.2" y1="16.5" x2="19.8" y2="7.5"/>'),
    cash: wrap('<rect x="3" y="6.5" width="18" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><line x1="6.5" y1="10" x2="6.5" y2="14"/><line x1="17.5" y1="10" x2="17.5" y2="14"/>'),
    save: wrap('<path d="M5 4h10.5L20 8.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4"/><rect x="8" y="13" width="8" height="7"/>'),
    up: wrap('<path d="M12 19V6"/><path d="M6.5 11.5 12 6l5.5 5.5"/>'),
    down: wrap('<path d="M12 5v13"/><path d="M6.5 12.5 12 18l5.5-5.5"/>'),
    split: wrap('<path d="M12 3v6"/><path d="M12 9c0 3-5 2-5 6v6"/><path d="M12 9c0 3 5 2 5 6v6"/>'),
    ask: wrap('<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="12.5" x2="13" y2="12.5"/>')
  };
})();
