/* Household Finance — single registry of user-facing screens/features.
   Both the Quick Tour (js/tour.js) and the Executive Summary's "app features"
   section (js/views/summary.js) render from this array. Adding a screen here
   is what makes it show up in both places — see CLAUDE.md's "keep Features
   current" rule for when this file needs a new entry. */
(function () {
  'use strict';

  window.Features = [
    { id: 'home', route: 'home', icon: 'home', title: 'Dashboard',
      blurb: 'Safe-to-spend, what’s due in the next few days, this month’s budget vs. actual, and insights, all at a glance.' },
    { id: 'summary', route: 'summary', icon: 'compass', title: 'Executive Summary',
      blurb: 'A one-page financial health snapshot, plus everything this app can do.' },
    { id: 'transactions', route: 'transactions', icon: 'list', title: 'Transactions',
      blurb: 'Every transaction — searchable, filterable, and attributed to a person or Shared.' },
    { id: 'import', route: 'import', icon: 'upload', title: 'Import',
      blurb: 'Pull in a bank CSV and auto-match it to budget lines and merchant rules.' },
    { id: 'budget', route: 'budget', icon: 'grid', title: 'Budget',
      blurb: 'Recurring income and spending lines, split across the household or Shared.' },
    { id: 'calendar', route: 'calendar', icon: 'calendar', title: 'Bill Calendar',
      blurb: 'Upcoming bills with due dates, auto-pay tracking, policy and contract renewals, bill and insight reminders, and which paycheck covers each one.' },
    { id: 'goals', route: 'goals', icon: 'target', title: 'Savings Goals',
      blurb: 'Track progress toward the house, wedding, and any other savings target.' },
    { id: 'house', route: 'house', icon: 'house', title: 'House Plan',
      blurb: 'Model the down-payment goal and timeline for buying a house.' },
    { id: 'invest', route: 'invest', icon: 'trend', title: 'Investments',
      blurb: 'Roth IRA contributions and growth, tracked per household member.' },
    { id: 'networth', route: 'networth', icon: 'bank', title: 'Net Worth',
      blurb: 'Assets vs. debts over time, built from your balance snapshots.' },
    { id: 'debt', route: 'debt', icon: 'debt', title: 'Debt Payoff Plan',
      blurb: 'Compare snowball vs. avalanche strategies and see the payoff date.' },
    { id: 'forecast', route: 'forecast', icon: 'trend', title: 'Forecast',
      blurb: 'Project account balances forward using your budget and bill schedule.' },
    { id: 'wedding', route: 'wedding', icon: 'sparkle', title: 'Wedding Payoff',
      blurb: 'Vendor-by-vendor wedding budget and what’s left to pay.' },
    { id: 'backup', route: 'backup', icon: 'exchange', title: 'Export & Backup',
      blurb: 'Export CSV/JSON backups — the only copy of your data lives in this browser.' }
  ];
})();
