# localStorage or Supabase: where should your household's money data live?

Household Finance runs perfectly in either mode — pure in-browser storage
with zero setup, or synced to a Supabase backend you own. Neither is wrong.
This page explains honestly how each works, what each is genuinely good at,
and why the cloud option is the durability winner — so you can decide
whether the ~1-hour migration is worth it for your household.

## Two homes for the same data

### Vanilla localStorage — a notebook in your browser's drawer

Every browser gives each website a small private storage space on the
device. The app writes your entire dataset there as one JSON document,
instantly, on every change. Nothing ever leaves the device — there is no
server, no account, no network request. The app is just files; the data is
just a drawer only that browser can open.

- **Storage type:** key–value strings on the device, typically 5–10 MB per
  site — hundreds of times more than years of household finance data needs.
- **Functionality:** instant reads/writes, full offline operation, JSON file
  export/import as the backup mechanism.

### Supabase sync — a vault with your notebook photocopied inside

Supabase is a hosted PostgreSQL database — the same class of database banks
and businesses run — wrapped with login and row-level security rules. In
sync mode the app *keeps* its localStorage copy as the working notebook, and
mirrors it to your own private Supabase project: one live copy plus a shelf
of dated snapshots.

- **Storage type:** a real database (500 MB on the free tier) with
  transactional writes, plus versioned snapshot history.
- **Functionality:** everything vanilla does, *plus* multi-device sync,
  per-person sign-in, one-tap restore to any snapshot, and survival of any
  single device's death.

## Side by side

| | Vanilla localStorage | + Supabase sync |
|---|---|---|
| Setup | None — open the app and go | ~20 min once (free account, paste one SQL file, two settings) |
| Cost | Free forever | Free tier comfortably covers a household forever |
| Privacy | Absolute — data never leaves the device | Data in *your* project, sealed by closed signups + row-level security; still never on anyone else's server |
| Works offline | Always | Always — localStorage stays the working copy; cloud catches up later |
| Devices | Exactly one browser on one device | Every device you sign in, kept identical automatically |
| Household members | Share one device, or juggle files | Each person signs in on their own phone |
| Capacity | ~5–10 MB (plenty for this app) | 500 MB+ (effectively unlimited for this app) |
| Backup | Manual — you must export a JSON file, on a schedule only discipline enforces | Automatic versioned snapshots, plus the same JSON export any time |
| Recovery | Restore your newest exported file — you lose everything since that export | Restore any snapshot, or just sign in on a new device |
| Survives a lost/broken phone | Only as well as your last export | Yes — the phone was just one copy |
| Survives "Clear browsing data" | No — that clears the app's storage too | Yes — sign back in and pull |
| Maintenance | Remember to export regularly | Glance monthly that snapshots are accruing |
| Dependencies | None — outlives every company | Supabase the service; the JSON export escape hatch removes the lock-in |

## The durability question — where each copy can die

Durability is the honest core of this decision. Browser storage is
*convenient* storage, not *durable* storage — browsers treat it as
expendable cache, and real households lose it in mundane ways:

- **The device itself** — lost, broken, stolen, traded in. The drawer goes
  with the desk.
- **"Clear browsing data"** — one well-meaning cleanup tap wipes the app's
  storage alongside cookies.
- **Browser eviction** — under storage pressure, or on iOS Safari after ~7
  days of not visiting a non-installed web app, the browser may delete site
  data on its own. (Installing the PWA to your home screen largely protects
  you, but the policy is the browser's, not yours.)
- **Corruption** — rare, but a half-written record during a crash can spoil
  the stored JSON. The app parks a corrupted copy for recovery rather than
  discarding it, but parked is not restored.

Every one of those has the same answer in vanilla mode: *your last exported
file*. Which is why vanilla mode is genuinely fine — for people who actually
export.

## Why Supabase is the ultimate durability source

With sync on, your data stops being one copy and becomes a stack of
independent copies, each guarding against a different failure:

- **Layer 0 — the device copy (localStorage).** Still there, still the
  working copy — the app runs offline exactly as before. Any single device
  dying costs nothing.
- **Layer 1 — the live cloud copy (Postgres).** Every change lands in a
  transactional database on managed, redundant infrastructure — writes
  either fully succeed or cleanly fail, never half-happen.
- **Layer 2 — versioned snapshots.** Dated copies of your whole dataset,
  kept automatically. This is the layer no single "current copy" can offer:
  it protects you from *yourself* — a bad import, a bad edit, a bad restore
  — by making any earlier state one tap away.
- **Layer 3 — platform backups.** Supabase itself backs up your database on
  its own schedule — a safety net under the safety nets, run by people whose
  whole job is not losing databases.
- **Layer 4 — the JSON export escape hatch.** Unchanged from vanilla mode
  and kept forever: a plain file in your hands that no service outage,
  account issue, or company decision can touch.

The key property: these layers fail *independently*. Losing your phone
doesn't touch the cloud; a Supabase outage doesn't touch your phone; a bad
edit propagated everywhere is still undone by a snapshot; and the exported
file answers even the scenario where Supabase disappears entirely. In
vanilla mode, layers 1–3 don't exist — every failure routes to the same
single answer, your last manual export, exactly as old as your discipline.

> **One honest caveat:** sync adds a dependency and a routine. Your project
> needs its members added by hand, your devices need to stay signed in, and
> a service you don't run is now part of the picture. The design compensates
> — offline-first, kill switch back to vanilla, exports forever — but "more
> durable" is not "nothing to think about."

## So: should you set it up?

**Stay vanilla if…**

- One person, one device, and that's genuinely the whole picture.
- You reliably export a JSON backup after every session that matters — and
  store it off the device.
- Maximum privacy is the priority that outranks everything, including
  convenience.
- You've installed the PWA to your home screen (protecting against iOS's
  eviction policy).

**Set up Supabase if…**

- Two people (or two devices) should see the same numbers without passing
  files around.
- "What if I lost my phone today?" doesn't have an answer you're happy with.
- Your last backup is older than you'd like to admit — automation beats
  discipline.
- You want undo-anything safety: any earlier state of your finances, one tap
  away.

A fair summary: **vanilla is a great place to start, and Supabase is a great
place to end up.** Most households outgrow one browser the day a second
person or second device enters the picture — and that's the signal to
migrate.

Ready to make the move? `SUPABASE.md` walks you through creating and locking
down your own project (~20 minutes), and `MIGRATION.md` is the
stage-by-stage, gate-checked path from one browser to every device. Staying
vanilla? Export a JSON backup today — this page will wait.
