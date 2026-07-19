# Household Finance — guidance for Claude Code

This is a **vanilla HTML/CSS/JS Progressive Web App** — no framework, no build
step, no backend, no package.json to install. Open `index.html` directly or
serve the folder over HTTP; that's the entire dev loop.

Most people who clone this repo are here for one of two things. Figure out
which before doing anything else:

1. **"Help me set up my own household's data."** They don't want code changes —
   they want to *use* the app. Point them at the running app itself (open
   `index.html`, or `python3 -m http.server 8000` and open `localhost:8000`)
   and walk them through:
   - **Export & Backup → Start fresh (clear demo data)** — wipes the built-in
     demo household to a blank slate.
   - **Budget → ＋ Add member** for each person in their household, with income.
   - Entering budget lines, transactions, goals, etc. through the UI.
   - Regularly exporting a JSON backup (same screen) since all data lives only
     in that browser's `localStorage` — there is no server copy anywhere.
   If they want it hosted at a private URL instead of run locally, that's
   `SETUP.md` — a zero-experience GitHub + Cloudflare walkthrough (also
   published as a standalone page; check the repo's README for the link).
   **Never hand-edit `seed()` in `js/store.js` to insert someone's real
   financial data** — that would put real numbers in a public repo's git
   history forever. The in-app flow above is the only place real data belongs.

2. **"Help me customize/extend the app itself."** That's normal code work —
   see the architecture notes below.

## Architecture

- `index.html` — app shell, nav, script tags (load order matters: `store.js`
  before any `views/*.js`, `app.js` last — it boots the router).
- `js/store.js` — the entire data layer. All state lives in one `data` object,
  persisted to `localStorage` as JSON on every `Store.save()`. Read this file
  first; almost everything else just calls into it.
- `js/views/*.js` — one file per screen (`budget.js`, `dashboard.js`, etc.),
  each exporting `Views.<name>(root)` that renders into the router's outlet.
- `js/features.js` — a single registry (`window.Features`) of every
  user-facing screen: `{ id, route, icon, title, blurb }`. It's the shared
  source of truth behind both onboarding surfaces below — see "Executive
  Summary & Quick Tour" for why this file matters more than its size suggests.
- `js/views/summary.js` (`Views.summary`, route `#/summary`) — the Executive
  Summary: a one-page financial snapshot (net worth, this month vs. budget,
  goals, insights, debt, wedding) plus an "app features" grid rendered from
  `Features`.
- `js/tour.js` (`window.Tour`) — Quick Tour: a step-by-step modal walkthrough
  over `Features`, auto-launched once on first-ever open (localStorage flag,
  not `Store` data) and re-launchable any time from the Executive Summary's
  "Take the Quick Tour" button.
- `js/app.js` — hash-based router, modals, toasts, global search.
- `js/charts.js` — dependency-free inline-SVG charts (bars, donut, trend,
  rings). No charting library.
- `sw.js` / `manifest.json` — PWA offline shell + install metadata.

## Executive Summary & Quick Tour

These two screens are how a person orients themselves in the app — one on
first open (Quick Tour), one any time after (Executive Summary, `#/summary`).
Both render their "what can this app do" content from the single `Features`
array in `js/features.js` instead of hardcoding a screen list twice.

**Whenever you add or meaningfully change a UI/UX-visible feature — a new
screen, a new nav entry, a renamed/repurposed screen — update
`js/features.js` first.** A new entry there automatically appears in both the
Quick Tour and the Executive Summary's feature grid; that's the whole point of
the registry, so a screen doesn't quietly drift out of sync with the two
places new users learn about it. If a change doesn't fit the registry pattern
— e.g. a workflow change *inside* an existing screen that alters what its
`blurb` promises, or a shift in the Executive Summary's financial-snapshot
section itself — update the relevant text by hand in `summary.js` and/or the
`blurb` in `features.js` so neither surface goes stale. Don't ship a
UI/UX-visible change without checking whether either surface needs a touch.

## The data model

- `data.members` is the household roster (an array of names). `'Shared'` is a
  **reserved pseudo-member**, not a real person — it means "split evenly
  across everyone." Every budget line and transaction is attributed to either
  one member's name or `'Shared'`.
- `Store.WHO` (a getter, not an array literal) returns `['Shared', ...members]`
  — the live attribution vocabulary. Dropdowns and iteration should read from
  this, not a hardcoded list.
- `Store.addMember` / `renameMember` / `removeMember` cascade across budget
  sections, transactions, account owners, and merchant rules. `removeMember`
  reassigns that person's stuff to `'Shared'` rather than deleting it.
- `incomes` and `invest.roth` are objects keyed by member name (not a fixed
  `mike`/`bri` pair) — `Store.incomeTotal()` and `Store.rothMeta(name)` iterate
  `data.members`.
- Schema changes go through `migrate()` in `store.js`, gated on `data.version`.
  Each step must be additive so a backup from any older version upgrades in
  place without data loss — see the v4→v5 step for the pattern (it renamed the
  old `{mike, bri}` income/Roth keys to member names).

## First-run data

- `seed()` returns a **fictional demo household** ("Alex & Sam") — obviously
  fake, round numbers, used only so the app isn't empty on first load. It is
  not, and must never become, anyone's real data.
- `emptyState()` / `Store.startFresh()` is the actual "new household" path —
  one placeholder member (`"You"`), everything else zeroed. This is what the
  in-app **Start fresh** button calls.
- If you're asked to change the demo's starting numbers or add a new demo
  screen's worth of sample data, edit `seed()` — keep the names and figures
  clearly fictional (this repo is public).

## Conventions

- No build tooling — don't introduce one for a small change. If a task seems
  to need bundling/transpiling, that's a sign to reconsider the approach.
- No comments unless something is genuinely non-obvious (a workaround, a
  subtle invariant). The existing files are a good model for the house style.
- The CSV export schema (`Store.CSV_HEADER`, column order, the fixed
  19-category list) is treated as a stable contract — changing it breaks
  anyone piping the export into their own spreadsheet. Don't change it in
  passing.
- After changing anything in `store.js` or a view, actually load the app (a
  local server or opening `index.html`) and click through the affected
  screen(s) — this app has no automated test suite, so manual verification in
  a real browser is the only check.

## Docs in this repo

- `README.md` — user-facing product overview, screens, CSV schema, privacy.
- `SETUP.md` — the GitHub + Cloudflare hosting walkthrough for someone who has
  never used either.
