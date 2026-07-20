# Handoff: port Cross-Household-'s M6 changes into household-finance

## Where this comes from

`mcross2298/Cross-Household-` (the private, real-data sibling of this repo) just
shipped five features across PRs #27–#30 on branch
`claude/repos-vision-brainstorm-q0xj6b` (merged to `main`). This doc briefs a
fresh session on porting them here. It describes *what changed and why*, with
exact file/function anchors checked against this repo's actual code — it is
not a literal patch. Read this repo's own `CLAUDE.md` before starting.

**Good news up front**: the two repos are far more parallel than you'd guess.
`store.js`'s `likelyDuplicate`, `matchBudgetLine`, `budgetLineStatus`,
`monthSchedule`, `dueForReminder`, the `reminders: {enabled, daysAhead, log}`
shape, and `budget.js`'s `editModal` are structurally identical or extremely
close between the two repos. Most of this port is closer to "apply the same
diff" than "redesign for this architecture." The real differences that *do*
matter are called out per-change below.

## Real differences to hold onto while porting

- **Members are dynamic here.** `WHO()` returns `[SHARED].concat(data.members
  || [])` (`js/store.js:307`) — not the fixed `['Shared','Mike','Bri']` array
  Cross-Household- uses. None of the 5 changes below actually need per-member
  logic (they touch budget lines, transactions, forecast, insights — all
  already member-count-agnostic), so this mostly doesn't bite. Just don't
  hardcode "Mike"/"Bri" anywhere while porting.
- **Schema version starts at the same place**: this repo's `migrate()` is also
  at `v >= 9` / `data.version = 9` (`js/store.js:180,224`) — so change 4's
  migration step below is a clean v9 → v10 bump here too, not a guess.
  `localStorage` key is `householdFinance.v1` (`js/store.js:9`), not
  `crossFinances.v1` — any new localStorage keys (install-prompt snooze, etc.)
  should follow this repo's own naming, not Cross-Household-'s.
- **Service worker cache** is currently `household-finance-v6`
  (`sw.js:6`) — bump by one for each sw.js change below, same discipline
  Cross-Household- used (`v13→v14→v15`), not a copy of their exact numbers.
- **Demo data, not real data.** This repo ships an "obviously-fake demo
  household" (Alex & Sam) that resets on demand. Test every change against
  that demo data — never invent realistic-looking financial figures, and
  never copy Cross-Household-'s real seed values here.
- **No `tests.html`.** Cross-Household- re-ran 30 money-math assertions after
  every `store.js` change. That harness doesn't exist here — verification
  after each port step is manual click-through only (serve the app, drive the
  affected screen(s) in a browser). Porting `tests.html` itself is a separate,
  already-identified task (see the earlier parity note in Cross-Household-'s
  session) — not part of this handoff.
- **Don't touch** `js/theme.js`, `js/lock.js`, `wrangler.jsonc`, or
  `SUPABASE.md`. None of the 5 changes need them. Mixing concerns here is
  exactly the scope creep both repos' brainstorms already ruled out.

## The 5 changes, in the order they shipped

### 1. Morning digest — dashboard shows what's due soon
*Cross-Household- PR #27.* Files: `js/store.js`, `js/views/dashboard.js`,
`css/styles.css`, `js/features.js`.

- New `store.js` function `dueSoonItems(days)`: everything unposted due
  within `days` of today (overdue included), built from the existing
  `monthSchedule()`. `dueForReminder()` (`js/store.js:1149`) refactors to call
  `dueSoonItems(horizon)` instead of duplicating the "this month + next
  month's spillover" pool-building logic.
- `dashboard.js`'s hero (`.hero-head` / `.sts` block around line 129) gets a
  new `.due-soon` block directly under the safe-to-spend link: up to 3 items
  (name, due date or "overdue", amount), a "+N more →" overflow row, or
  "Nothing due — you're clear." when empty. The whole block links to
  `#/calendar`.
- New CSS: `.due-soon`, `.due-soon-label`, `.due-soon-list`, `.due-soon-row`
  (+ `.overdue` variant), `.due-soon-name/-when/-amt`, `.due-soon-more`,
  `.due-soon-none` — styled to match the existing `.sts` block (same
  navy-hero/gold-accent treatment; copy Cross-Household-'s CSS values as a
  starting point, this repo's palette should be identical).
- `features.js`: Dashboard blurb — add "what's due in the next few days" to
  whatever this repo's current wording is.

### 2. Mobile daily-driver pass — install prompt + notification actions
*Cross-Household- PR #27.* Files: `js/app.js`, `sw.js`, `js/views/calendar.js`,
`index.html`.

- `app.js`: capture `beforeinstallprompt`, stash the deferred event, show a
  dismissible banner in a new `#install-banner-root` div. Add that div in
  `index.html` between the topbar and `<main id="view">` — **outside** the
  router-controlled `#view` element so it survives route re-renders (same
  reason `#toast-root`/`#modal-root` live outside it). Dismissing writes a
  timestamp to a new localStorage key (follow this repo's own prefix, e.g.
  `householdFinance.installDismissedAt`) and re-shows after a 14-day snooze.
  `appinstalled` clears it.
- New shared helper `notifyLocal(title, opts, done)` in `app.js` wraps the
  service-worker-vs-plain-`Notification` branching — `checkReminders()`
  (`js/app.js:192`) refactors to use it, and change 4's `checkInsightNudges()`
  reuses the same helper rather than duplicating the branching.
- `checkReminders()` gets a "Mark paid" action + `data: {billId, due}` on the
  notification options when exactly one bill is due (skipped when several are
  due — which bill it meant would be a guess).
- `sw.js`: `notificationclick` checks `e.action === 'paid'` and routes to
  `./#/calendar?markpaid=<id>&due=<date>` instead of always
  `./#/calendar`. Bump `CACHE` from `household-finance-v6` to `v7`.
- `calendar.js`: on mount, read `markpaid`/`due` route params (same
  `App.routeParams()` / `App.clearRouteParams()` pattern already used for the
  month-end close deep link), find the budget line, and — only if
  `b.type === 'Fixed'` and it isn't already posted this month (guards a
  stale/repeated tap) — post a transaction shaped like this repo's own
  cash-pay auto-post path (`account: 'Auto-posted'`,
  `notes: 'Marked paid from a notification'`).
- New CSS: `.install-banner-inner`, `.install-banner` (reuses the existing
  `.callout` pattern already in this repo's `styles.css`).

### 3. Same-bill duplicate guard
*Cross-Household- PR #28.* Files: `js/store.js`, `js/views/import.js`.

- `likelyDuplicate(row, txs)` (`js/store.js:997`) gets a second pass after the
  existing same-amount/±3-day/similar-merchant check: if the incoming row and
  an existing transaction both resolve to the **same budget line** via
  `matchBudgetLine()` (`js/store.js:1020`, Fixed type only) within the same
  billing month, and are within **10%** of each other in amount, flag as a
  duplicate regardless of the date gap. Fixes paying a bill manually days
  before/after its usual autopay date going undetected.
- `import.js`: update the `dup` pill's tooltip and the review screen's help
  text to describe both dedupe paths, not just "within 3 days."

This one should port nearly verbatim — `matchBudgetLine`'s signature here is
the same shape.

### 4. Proactive insight nudges
*Cross-Household- PR #29.* Files: `js/store.js`, `js/app.js`,
`js/views/calendar.js`, `sw.js`.

- New `store.js`: `dueInsightNudges()` — a narrow, stably-keyed slice of two
  insight types: price-creep jumps (key: `creep:<merchant>@<newPrice>`) and a
  tight/negative forecast month (key: `forecast:<ym>:<severity>`). Verify this
  repo's `priceCreeps()`/`forecast()` return the same field names
  (`.merchant`/`.from`/`.to`, `.ym`/`.tone`/`.balance`) before porting the key
  strings verbatim — they should match, but confirm. `markInsightsNudged(items)`
  logs them with 6-month log aging.
- Schema: add `data.reminders.insightsEnabled` (bool, default `false`) and
  `data.reminders.insightLog` (`{}`) to both `seed()`'s reminders literal and
  the pre-v3 backfill (`js/store.js:90` and `:243` are the two reminders
  literals; `:187` is the backfill). Add a `v < 10` migration step and bump
  `data.version` from `9` to `10` (confirmed this repo is at v9 currently —
  see "Real differences" above).
- `app.js`: `checkInsightNudges()` mirrors `checkReminders()` via the shared
  `notifyLocal()` helper from change 2; wire it into `boot()` and the
  `visibilitychange` handler alongside `checkReminders()`; export it on
  `window.App` (`js/app.js:216`).
- `calendar.js`: second checkbox on the existing Reminders card — "Also
  notify me about insights worth a look" — its own opt-in, deliberately
  separate from the bill-reminder toggle (softer, more discretionary heads-up
  than a bill coming due).
- `sw.js`: generalize `notificationclick` to route via the notification's own
  `data.href` when present, falling back to `./#/calendar` (bill reminders
  don't set `data.href`, so their behavior is unchanged). Bump `CACHE` again.

### 5. Renewal tracker
*Cross-Household- PR #30.* Files: `js/views/budget.js`, `js/store.js`,
`js/views/calendar.js`, `js/views/dashboard.js`, `js/features.js`.

Scoped deliberately narrow after a direct question about what "renewals and
warranties" should track: physical-item warranties don't attach to anything
in this schema (no Account/Budget line owns a possession) and would need a
brand-new standalone collection — the general "vault" both repos' brainstorms
already ruled out. Contract/policy renewals attach cleanly to an existing
Budget line, so that's the whole feature. **Don't expand this back out to
warranties without a fresh product decision.**

- `budget.js`'s `editModal` (`js/views/budget.js:203`) is essentially
  identical to Cross-Household-'s — add one new optional field, `renewalDate`
  (a `<input type="date">`), right next to the existing "Due day" field
  (`:213`), for **any** line type (not Fixed-only — an annual-contract
  subscription is as valid as an insurance policy). Include `renewalDate:
  g('#b-renewal').value || null` in the `next` object at save. No schema
  version bump needed — treated as absent-when-unset everywhere, same pattern
  `dueDay`/`cashPay` already use. Also show it in the line-list's meta string
  (`:52`, alongside `due day`/`cash-pay`/`rollover`).
- `store.js`'s `monthSchedule()` (`:1116`) emits a `kind: 'renewal'` item for
  any budget line with a `renewalDate` falling in the displayed month.
  Renewals have no "posted" concept (always `posted: false`) — they age
  through upcoming/soon/overdue by date alone, riding the existing day-grouped
  schedule and `dueSoonItems()` digest for free.
- `calendar.js`: renewal rows get a "renewal" tag, "renews `<date>`" meta text
  instead of "due," and **no dollar amount shown** (renewals carry
  `amount: 0`, which would otherwise render as a confusing `$0`). Exclude
  renewal-kind items from the "Posted X of Y" ratio and the "Due this week $"
  stat (both are dollar/completion metrics a `$0`, un-postable item would
  permanently skew) but keep them in "Overdue" (dollar-free, still a
  legitimately urgent signal). Tapping a renewal row navigates to
  `#/budget?section=<section>` — reuses the scroll-to-section behavior
  `budget.js` already has for route params, no new modal needed.
- `dashboard.js`'s due-soon strip: render "Renews" instead of a dollar figure
  for renewal-kind items.
- `dueInsightNudges()` (change 4) gets a renewal branch: key
  `renewal:<lineId>@<renewalDate>`, fires for renewals within 14 days (skip
  past-due ones — the user should update the date to the next cycle rather
  than being re-nagged forever about a stale one).
- `features.js`: Bill Calendar blurb — mention "policy and contract
  renewals."

## Suggested order & verification

Port in the order above. Changes 4 and 5 share the insight-nudge
log/keying mechanism, so do 4 before 5 to avoid rework. After each change,
serve the app locally and manually click through the affected screen(s) using
the demo data — Import review, Bill Calendar, Budget line editor, Dashboard
hero, and the Reminders card's two toggles. There's no `tests.html` here to
lean on, so this manual pass is the only gate.

## Source of truth

Cross-Household- branch `claude/repos-vision-brainstorm-q0xj6b` (merged to
`main`). PRs: #27 (digest + mobile pass), #28 (dup guard), #29 (nudges), #30
(renewals). If anything above is ambiguous, the actual diffs there are the
ground truth — this doc describes intent and mechanism, not a byte-for-byte
patch.
