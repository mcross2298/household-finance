# From one browser to every device: the JSON → Supabase migration path

You set up your own copy of Household Finance, entered your household's real
data, and it all lives in one browser's localStorage. This is the staged path
to syncing it across every device — on a backend you own — ordered so that at
no point, not even mid-migration, can your data be lost. Each stage ends at a
**gate**: don't move on until every check passes.

## Before you start

- Your own copy of the app is set up and running (locally or at your private
  URL — see `SETUP.md`), with your household's members, budget, and
  transactions entered.
- The app is updated to a version with the **Cloud Sync** card on the
  Export & Backup screen.
- You know which devices currently hold data — most households have one
  "main" device and others that are empty or stale.
- Total hands-on time is about an hour, but spread it over a few days: the
  gates are designed to let real life verify each stage.

## Four rules the whole path follows

1. **Offline-first, always.** Your device's copy stays the working copy. The
   app never needs the network to open, edit, or close a month.
2. **You own the backend.** The cloud copy lives in your own free Supabase
   project. Nobody else's server is ever involved.
3. **Every step reversible.** A JSON export before anything risky, snapshots
   of every state that gets replaced, and a sync kill switch that returns you
   to local-only instantly.
4. **Gates, not dates.** Move at whatever pace you like — but only through a
   gate whose every check passed.

## Stage 0 — Make your data un-loseable (~10 min)

*Before the cloud exists, every byte you care about is safe in files you
hold.*

1. On **every device that has data**, open Export & Backup and tap
   **Download JSON backup**. Keep the files somewhere you trust (a drive
   folder, an email to yourself).
2. Verify one backup for real: open the app in a private/incognito window,
   restore the file, and confirm your budget and transactions look right. A
   backup you've never restored is a hope, not a backup.
3. Pick your **canonical device** — the one whose data is most complete and
   current. That copy will seed the cloud; every other device's copy will be
   replaced by it in Stage 3.
4. If a second device has entries the canonical one lacks, reconcile now, by
   hand, on the canonical device. Sync fast-forwards devices; it doesn't
   merge two divergent histories.

**Gate — pass before Stage 1:**
- [ ] A dated JSON backup file exists for every device that held data.
- [ ] At least one backup was restored in a private window and looked right.
- [ ] One canonical device chosen; anything unique on other devices is merged
      into it.

## Stage 1 — Stand up your locked backend (~10 min)

*Create the Supabase project and prove it's sealed before any financial data
goes near it.*

1. Follow `SUPABASE.md` steps 1–4: create a free project, run the repo's
   `supabase/*.sql` files in the SQL Editor, and copy your Project URL and
   publishable key.
2. Lock the front door: turn **off** "Allow new users to sign up," then
   hand-add each household member's email under Authentication → Users — and
   nobody else.
3. Sanity-check the locks: confirm the Users list contains only your
   household, and check Supabase's Security Advisor page shows no Row Level
   Security warnings.

**Why this order:** Row Level Security plus closed signups means your project
has no public surface — the database itself refuses every request that isn't
a signed-in member of your household. You prove that while the database is
still empty, when a mistake costs nothing.

**Gate — pass before Stage 2:**
- [ ] Signups are disabled; the Users list is exactly your household.
- [ ] All tables created; Security Advisor shows no RLS warnings.
- [ ] You copied the *publishable* key — and did not copy the
      secret/service-role key anywhere.

## Stage 2 — First cloud backup, and a fire drill (~10 min)

*The canonical device's data goes up as a versioned snapshot, and you
practice recovery while the stakes are still zero.*

1. On the **canonical device only**, paste your Project URL and publishable
   key into the Cloud Sync card, tap Connect, and sign in via the magic link.
2. Tap **Back up to cloud**. Your data becomes snapshot #1. Verify the card
   shows "Last cloud backup: just now."
3. Run the fire drill: restore that snapshot right back onto the same device.
   It should be a no-op — same data before and after. Now you've rehearsed
   the recovery move you'll one day need for real.

**Backups before sync, deliberately.** Live sync is the last thing enabled,
not the first. If anything about your setup is wrong, you find out here —
where the worst case is a snapshot that looks odd, not two devices fighting
over your ledger.

**Gate — pass before Stage 3:**
- [ ] Snapshot #1 exists in the cloud with today's date.
- [ ] The fire-drill restore completed and changed nothing.
- [ ] The app still works normally with the network off (airplane-mode
      check).

## Stage 3 — Bring devices aboard, one at a time (~5 min each)

*Each device joins the household's synced copy — never two at once, always
with its old data parked first.*

1. On the joining device, download its JSON backup first (even if you think
   it's empty — the file is your proof).
2. Connect with the same Project URL and key; the member using that device
   signs in with their own email.
3. The app pulls the household's cloud copy, replacing what was on the
   device. That's correct — Stage 0 made the canonical copy the truth.
4. Prove the loop both ways: edit a budget line on the new device, watch it
   appear on the canonical one; then edit on the canonical device and watch
   it flow back.
5. Repeat for each remaining device, then leave sync on everywhere.

**Gate — migration complete when:**
- [ ] Every device shows identical data.
- [ ] An edit made on each device appeared on the others.
- [ ] An airplane-mode edit on one device reconciled cleanly when it came
      back online.

## Stage 4 — Steady state: the habits that keep it safe (ongoing)

*Synced is not "set and forget." Three small habits keep every protection
layer honest.*

- **Monthly:** glance at the snapshot list — it should be growing on its own.
  A stalled list means a device lost its session.
- **Quarterly:** download a JSON export anyway. The file escape hatch
  outlives every service, including Supabase.
- **Know your two levers:** the *sync kill switch* (Export & Backup)
  instantly returns any device to local-only with its data intact;
  *snapshots* roll the household back to any earlier state. If sync ever
  behaves strangely: kill switch first, investigate second — your local copy
  is always safe.
- **New member or device later:** add their email in Supabase Users (signups
  stay closed), then run Stage 3 for their device. Nothing else changes.

## What you gained at each stage

| If this happens… | You're covered because… |
|---|---|
| Phone lost, broken, or replaced | Sign in on the new device; everything pulls down. (Stage 3) |
| Bad edit, bad import, bad decision | Versioned snapshots — restore any earlier state in one tap. (Stage 2) |
| Two people edit at the same moment | The app asks which version wins, and parks the loser as a snapshot — a wrong choice is one restore away. (Stage 3) |
| No internet, or Supabase is down | Offline-first: the app runs fully from the device and catches the cloud up later. (by design) |
| Someone finds your publishable key | Closed signups + Row Level Security: no account, no rows, no exceptions. (Stage 1) |
| You want out entirely | Download a JSON export, flip the kill switch everywhere, delete the Supabase project. Your data was in your hands the whole time. (Stage 0's guarantee, forever) |

Companion documents: `SETUP.md` (hosting your own copy) and `SUPABASE.md`
(creating and locking down the project, referenced in Stage 1). Something
unclear on your migration? Open an issue on this repo.
