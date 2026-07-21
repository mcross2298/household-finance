# Household Finance — Command Center

A private, offline-first personal finance app for a household: budget,
transactions, savings goals, house plan, investments, net worth, cash-flow
forecast, and a bill calendar — all in one installable web app. It runs entirely
in your browser, stores everything on your own device, and never sends your
money data anywhere.

Add the people in your household, enter your income and recurring bills, import
or type your transactions, and the app does the math — safe-to-spend, budget
pacing, per-person splits, payoff projections, and a 12-month forecast.

## Try it in 30 seconds

The app ships with an **obviously-fake demo household** ("Alex & Sam") so every
screen is populated the first time you open it. Click around, then when you're
ready to enter your own numbers:

> **Export & Backup → Start fresh (clear demo data)**

That wipes the demo and leaves you a blank household with one member to rename.
(Changed your mind? **Reset to demo data** brings the sample back.)

**Never used GitHub or Cloudflare?** See **[SETUP.md](SETUP.md)** for a
zero-experience, click-by-click guide to getting your own private copy hosted
at a private web address.

## Running it

Nothing to install and no account to create — you just need a browser.

- **Fastest:** download the repo (green **Code** button → **Download ZIP**),
  unzip, and double-click `index.html`. Everything works from disk; your data
  saves in that browser.
- **Nicer (enables offline mode):** from the repo folder run
  `python3 -m http.server 8000` and open `http://localhost:8000`. This also
  registers the service worker, so the app works offline after the first load.
- **Install it as an app (PWA):** host the folder anywhere that serves static
  files over HTTPS — [GitHub Pages](https://pages.github.com/),
  [Netlify](https://www.netlify.com/), [Cloudflare Pages](https://pages.cloudflare.com/),
  etc. — then use your browser's **Install / Add to Home Screen**. Because the
  app keeps all data on-device, a hosted copy contains none of your figures.

Moving between devices? The **Export & Backup** screen writes a full JSON backup
you restore on the other device — that's the device-to-device handoff.

## Your household

The app is built around an editable **member roster** — it works for one person,
a couple, or a few roommates:

- **Budget → Household & income:** **＋ Add member**, rename anyone inline, set
  each person's monthly take-home, or remove a member.
- Every budget line and transaction is attributed either to **one member** or to
  **Shared**, which splits **evenly** across everyone (½ each for two people, ⅓
  for three, and so on). Spend-by-person, per-person budget totals, and Roth
  tracking all follow the roster automatically.

## Screens

| Screen | What it does |
|---|---|
| **Dashboard** | The overview: a **Safe to Spend** headline (budget − spent − upcoming fixed bills), an overall progress ring, an insights feed (over budget, category trends, subscription price creep, unusually large transactions, goals outpacing surplus, house plan pace, bills due, milestones), live KPIs, a budget meter with a **day-of-month pace marker**, a **month comparison** table, spend by category / person, and a 12-month trend. Every module is a drill-down |
| **Transactions** | Filter by month, category, person, or search; tap to edit; ＋ to add |
| **Import** | Drop a **PDF statement** (parsed in-browser), a **CSV file**, or paste CSV. Learned merchant **rules auto-categorize** rows, recurring bills inherit their budget line's category, fuzzy **duplicate flagging**, and a full review before anything is saved. Home of the editable **Rules** panel and **Recent imports** with one-tap undo |
| **Budget** | System of record for recurring expenses, take-home income, and household members. Shared lines split evenly; fixed lines show **✓ posted** when the matching transaction lands; discretionary lines show month-to-date actuals. Lines can carry a **due day** for the Bill Calendar |
| **Bill Calendar** | The month's bills laid out by due date — posted ✓ / due soon / overdue, auto-checked when the matching transaction posts. Opt-in **local reminders** and a guided **month-end close** |
| **Savings Goals** | Progress rings, months-to-goal, projected dates, and an affordability check against monthly surplus |
| **House Plan** | Interactive affordability model — price scenarios, live PITI, % of take-home, cash to close, ready-by date vs target |
| **Investments** | Per-member Roth IRA tracker (monthly-to-max) + a high-yield savings 12/24-month projection |
| **Wedding Payoff** | A vendor payoff checklist through an event date (rename to fit any big one-time savings goal) |
| **Net Worth** | Accounts registry with a one-modal monthly **balance snapshot**, a net-worth trend line, and **debt payoff** projections with an extra-payment what-if slider |
| **Forecast** | A 12-month **liquid-cash projection** (income − budget − Roth − planned one-offs), tight months flagged before they arrive, plus a goal-contribution what-if slider |
| **Export & Backup** | One-tap CSV, full JSON backup/restore, and the **Start fresh** / demo reset controls |

## CSV export schema

The CSV export (Export & Backup, or the month-end close) writes transactions in a
fixed column order you can open in Excel, Google Sheets, or Numbers, or wire into
your own analysis spreadsheet:

```
Date,Category,Description,Amount,Who,Account,Notes
```

- `Date` = `MM/DD/YYYY` · `Amount` = plain decimal · `Who` = `Shared` or a member name
- `Category` must be one of the fixed 19-category list (Housing, Utilities,
  Internet & Streaming, Insurance, Auto, Student Loans, Personal Loan, Phone,
  Pets, Groceries, Dining Out, Entertainment, Shopping, Health & Fitness, Travel,
  Gifts, Wedding, Savings, Other). The app enforces this on entry and import.

## Architecture

- Vanilla HTML/CSS/JS — no framework, no build step, no backend.
- `localStorage` only; **Export & Backup** produces the portable copies.
- Installable PWA: `manifest.json` + `sw.js` (offline app shell), 48px touch
  targets, iOS safe-area insets.
- Light/dark theme follows the OS preference by default; the toggle overrides and
  remembers your choice.
- PDF import uses pdf.js loaded on demand from a CDN (the only network dependency,
  cached by the service worker after first use). Statements are parsed on-device
  — nothing ever leaves the browser.

## Privacy

Everything lives in your browser's local storage on the device you're using.
There is no server, no account, and no telemetry. If you host the app somewhere,
that hosted copy still contains **none** of your data — your figures only ever
exist in the browser where you entered them. Back up (JSON) before clearing
browser data or switching devices.

**No backend is needed for storage or persistence** — `localStorage` already
handles both, and adding a server wouldn't make the app more offline-capable or
private. The one thing a backend *would* buy you is automatic sync between two
people's devices, replacing the manual JSON export/import handoff. That's a
real convenience but a significant step up in complexity (a database, user
accounts, and a server that now holds household financial data and needs its
own security posture) — worth treating as a deliberate, separate upgrade rather
than something this template takes on by default.

## Files

```
index.html          app shell + navigation
css/styles.css      theme (light + dark)
js/store/*.js       data layer, split by domain (load order matters — see CLAUDE.md):
                    schema+migrations, demo seed, localStorage, CSV, derived math,
                    insights, merchant rules, dedupe, bill matching, household
                    member roster
js/icons.js         inline SVG icon set
js/theme.js         light/dark toggle
js/charts.js        dependency-free SVG charts (bars, donut, trend, rings)
js/app.js           router, modals, toasts, global search
js/views/*.js       one module per screen
sw.js               offline cache
manifest.json       PWA manifest
wrangler.jsonc      optional Cloudflare Workers static-asset deploy config
```

## Make it yours

- Rename the app: search the repo for **Household Finance** (title, `manifest.json`,
  sidebar in `index.html`) and swap in your own name.
- Replace the demo: **Start fresh** in-app, or edit the `seed()` function in
  `js/store/00-state.js` if you want a different starting sample.
- Categories and the CSV schema live at the top of `js/store/00-state.js`.
