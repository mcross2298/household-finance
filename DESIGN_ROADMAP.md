# Design Alignment & Wedding Payoff Cleanup Roadmap

**Household Finance — Design System Audit · Shipped September 2, 2026 · Status: complete**

Two independent asks executed together because they touched overlapping
files: (1) audit the MC Training workout PWA (`4-Weeks-to-Open-`, this
account's flagship design system) against this app and close the real gaps,
and (2) retire the Wedding Payoff feature — the balance is fully settled on
the private `Cross-Household-` app this repo mirrors. **Ported from
`Cross-Household-`, the source of truth for this repo per its own
`CLAUDE.md`** — see that repo's copy of this file for the audit's full
reasoning; this copy documents what actually changed here.

## Decision on record

Asked directly rather than assumed: should this app adopt the workout app's
actual look (true-black OLED surfaces, gold accent, heavy display-weight
type, gym-floor UI), or its engineering discipline while keeping its own
finance-appropriate identity? **Chose the latter.** The two apps are
different products — a personal-finance command center is not a gym-floor
PWA — so nothing about the navy/gold palette, light-first theme, or system
font stack changed. What changed is what was actually missing when the two
codebases were compared side by side.

## Phase 1 — Audit findings

Read both design systems end to end (`4-Weeks-to-Open-/base.css` and this
app's `css/styles.css`) rather than guessing at the gap:

| Area | Workout app | This app, before | Verdict |
|---|---|---|---|
| Color tokens | Full `--ink-0…11` ramp, zero raw hex outside the token block, CI-enforced | Full navy/gold token set, zero raw hex outside the token block, CI-enforced (`check-token-drift.mjs`) | **Already at parity** — nothing to do |
| Motion tokens | `--duration-*` scale, JS reads it back | `--motion-*` scale, `js/motion.js` reads it back, CI-enforced | **Already at parity** |
| Dark/light theming | Dark-first, single theme | Both themes, OS-following + manual toggle, every route checked in both by `check-a11y.mjs` | **Already ahead** — no change |
| Contrast | Ratcheted, `--muted` fixed to 5.59:1 after a past AA failure | Checked every route/theme by `check-a11y.mjs`, currently clean | **Already at parity** |
| Touch targets | 44px floor, CI-enforced | 44px floor, CI-enforced (`check-a11y.mjs`, `check-start-fresh.mjs`) | **Already at parity** |
| **Typography scale** | Named `--fs-*` scale, CI-enforced (no raw literal escapes the token block) | **33 distinct `font-size` values as raw literals**, zero named beyond the browser default | **Real gap — closed in Phase 2** |
| **Radius scale** | Named `--r-*` scale, CI-enforced | One token (`--radius: 14px`) defined but **14 other raw `border-radius` literals** used instead of it | **Real gap — closed in Phase 2** |

The gap was never color, contrast, motion, or accessibility — this app's
token discipline on those axes already matched the flagship standard. The
gap was specifically typography and corner-radius: real values, used
consistently, but never named, so nothing stopped a future change from
introducing yet another one-off size.

## Phase 2 — Token scale (shipped)

**`css/styles.css`:**
- Added `--fs-058` … `--fs-230` (33 tokens — one fewer than
  `Cross-Household-`'s 34, since this repo has no `report.js`/Monthly
  Report screen and so never used its `1.35rem` heading size) — **every
  distinct `font-size` value already in use**, named by `rem × 100` so the
  value is self-evident from the name. Deliberately **not** collapsed to a
  handful of steps the way the workout app's scale is: consolidating would
  nudge real text sizes by a visible amount with no way to verify the
  result pixel-by-pixel from this environment. Every value renders exactly
  as it did before — this is a naming pass, not a resize.
- Added `--fs-chart-9/10/11/17/19` for the five inline-SVG chart-label sizes
  (`js/charts.js` draws text inside an SVG `viewBox`, which scales with
  chart geometry rather than the document font stack, so these are kept
  distinct from the rem-based scale on purpose).
- Added `--r-2/4/5/6/8/10/12/16/18/20/24` — the corner-radius scale. Unlike
  font-size, a 1px difference in corner rounding is imperceptible, so two
  pairs of near-neighbors were folded together (3px→4px, 9px→10px,
  affecting a handful of pills/inputs). `--r-14` was not created since
  `--radius` (already 14px, already the app-wide card default) covers that
  step.
- Every `font-size:`/`border-radius:` declaration in the file now reads
  `var(--fs-*)` / `var(--r-*)` (or `var(--radius)`); two multi-value
  `border-radius` shorthands (`.brand-mark span`, the bottom-sheet radius)
  needed both corners rewritten, not just the first value the regex pass
  caught on its own.
- `.kpi-grid-5` — a scoped modifier for the Dashboard's 5-tile KPI row
  (down from 6 once Wedding Left was retired in Phase 3) so its 1000px
  breakpoint fits 5 columns evenly instead of leaving the general
  `.kpi-grid` rule's 6th column empty.

**`scripts/check-token-drift.mjs`** (copied byte-identical from
`Cross-Household-`, now tracked in that repo's `scripts/sync/manifest.json`
as a `"none"`-reason unit so future drift between the two copies is
caught): gained two new rules, matching the two already enforced for color
and motion —
- **Rule 4:** no raw `font-size` literal anywhere outside the token block.
- **Rule 5:** no raw `border-radius` literal outside the token block, except
  the two structural literals `50%` (circle) and `0` (square).

Verified before shipping: every resolved `var()` reference was checked
against the original literal it replaced (script-diffed, not eyeballed) —
zero unintended value changes beyond the two deliberate 1px radius merges.
`check-token-drift.mjs`, `check-a11y.mjs` (both viewports, both themes,
every route), `check-start-fresh.mjs`, and the full `run-tests.mjs`
money-math suite all pass clean on the resulting stylesheet.

## Phase 3 — Wedding Payoff removal (shipped)

Full removal, not a soft-deprecate:

- **Deleted:** `js/views/wedding.js`, its nav entry, its `<script>` tag and
  `sw.js` precache entry, its `Features` registry entry (and the Quick
  Tour/Executive Summary feature-grid tiles that render from it — one less
  entry, nothing to hand-maintain).
- **Data model:** `data.wedding` removed from **both** `seed()` (the
  fictional "Alex & Sam" demo) and `emptyState()` (the real "Start fresh"
  blank-slate path) — this repo is the one with a public demo household, so
  both first-run shapes needed the field gone, not just one. `migrate()`
  gained an unconditional `delete data.wedding` (same pattern as the
  existing unconditional `reminders` backfill, since a synced or
  hand-restored payload from an older client build could still carry the
  field after the version bump) and the schema version advanced v13→v14
  (v15→v16 in `Cross-Household-`).
- **Forecast math corrected:** `liquidCashFlow()`/`forecast()` in
  `js/store/07-networth.js` no longer subtract wedding-vendor payments from
  projected monthly cash flow — the 12-month liquid-balance projection, the
  Forecast screen's chart tooltip, and its explanatory copy all reflect the
  real formula post-removal.
- **Insights, search, snapshot:** the "wedding vendor due soon" and "wedding
  fully paid off" dashboard insights, the global search's "Wedding vendors"
  result group, and `householdSnapshot()`'s `wedding` key are gone. The Bill
  Calendar's `monthSchedule()` (`js/store/06-calendar.js`) no longer
  synthesizes wedding-vendor rows, and its row renderer no longer carries a
  wedding branch (kind now resolves to `bill` as the default rather than
  `wedding`).
- **Executive Summary:** its `Wedding`/`Debt` two-column section is now a
  single full-width `Debt` card (a two-column grid with one child would
  have left a visible gap on desktop); the "Savings Goals" blurb's mention
  of wedding as an example target was reworded.
- **House Plan:** the "1–2 years post-wedding" framing on the target-window
  copy was removed as stale context now that there's no wedding feature to
  reference at all.
- **Export & Backup:** the "everything this backs up" copy no longer lists
  wedding data.
- **`scripts/check-start-fresh.mjs`** asserted `emptyState().wedding.vendors
  === []` — that line no longer applies once the field doesn't exist and was
  removed; every other assertion in that gate (member roster, incomes,
  budget, goals, house scenarios, and a sweep of all 14 routes for a stray
  `undefined`/`NaN`/`[object Object]`) still passes unchanged.

Verified: `run-tests.mjs` (81/81 here, 98/98 in `Cross-Household-`),
`check-a11y.mjs` (zero console errors across every remaining route, both
viewports, both themes — 14 routes here, 16 in `Cross-Household-`),
`check-doc-drift.mjs`, `check-sw-shell.mjs`, and `check-start-fresh.mjs`.
Both dashboards were screenshotted before and after: no layout gap, no
dangling link, no orphaned reference anywhere in rendered output.

## What did not change

No color, contrast, motion, dark-mode, or touch-target work — those were
already at parity with the flagship standard before this audit, and the
brief was to close real gaps, not manufacture busywork. No screens were
added, renamed, or restructured beyond what the wedding removal required.
The fictional demo household ("Alex & Sam") stays fictional; no real data
was introduced anywhere in this public repo.
