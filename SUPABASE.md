# Bring your own Supabase: cloud sync on your own free backend

> **Draft — ships with the sync update.** This guide accompanies the app's
> upcoming Cloud Sync feature. The steps for creating and locking down your
> Supabase project work today; the "connect the app" steps activate once
> sync lands in the app.

Household Finance normally keeps everything in your browser — private, but
stuck on one device. This guide gives you cloud backup and phone-to-phone
sync on a backend **you** own, for free, in about 20 minutes. No coding
required; every command is copy-paste.

**What you'll end up with:** your household's data living on your devices
*and* in your own private Supabase project — synced automatically, backed up
in versioned snapshots, readable by no one but the people you invite.
Nothing ever touches anyone else's server, including this app's author's.

## Step 1 — Create a free Supabase account and project (~3 min)

1. Go to [supabase.com](https://supabase.com) and sign up (GitHub login or
   email — either is fine).
2. Click **New project**. Name it anything (`household-finance` works), pick
   the region closest to you, and let it generate a database password — you
   won't need to remember it for this guide.
3. Wait a minute or two while the project spins up.

**Why Supabase?** It's a hosted Postgres database with login and security
rules built in, and its free tier comfortably covers a household's finance
data forever. You own the project; the app just talks to it.

## Step 2 — Run the setup SQL (~2 min)

1. In your project's left sidebar, open **SQL Editor**.
2. Open the `supabase/` folder in this repo, copy the contents of each
   numbered `.sql` file in order, paste into the editor, and click **Run**
   for each.

That creates the tables — `households`, `household_members`,
`household_state`, plus `state_snapshots` for versioned backups — and, most
importantly, turns on **Row Level Security** for all of them.

**Why it matters:** Row Level Security means the database itself refuses to
hand out any row to anyone who isn't a signed-in member of your household.
Even someone who finds your project's public key gets nothing.

## Step 3 — Lock the front door (~2 min)

1. Go to **Authentication → Sign In / Up** in the sidebar.
2. Under Email, turn **off** "Allow new users to sign up."
3. Add yourself: **Authentication → Users → Add user**, enter your email. Do
   the same for your partner or housemates — and nobody else.

**Why it matters:** with signups disabled, the only accounts that will ever
exist are the ones you created by hand. Combined with Row Level Security,
your project has no public surface at all.

## Step 4 — Copy your two connection values (~1 min)

1. Go to **Project Settings → API**.
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`).
3. Copy the **publishable key** (the long one labeled safe for browsers —
   historically called the *anon* key).

**Safe to handle:** the publishable key is designed to live in a browser —
it grants nothing by itself; Row Level Security decides everything. The
**secret / service-role key** on the same page is different: never copy that
one anywhere.

## Step 5 — Connect the app (~2 min)

1. Open Household Finance and go to **Export & Backup**.
2. In the **Cloud Sync** card, paste your Project URL and publishable key,
   then tap **Connect**.
3. Enter your email; tap the magic link that arrives to sign in. The app
   creates your household record on first sign-in.

## Step 6 — Move your existing data up (~2 min)

1. Still on Export & Backup, tap **Download JSON backup** first — belt and
   suspenders before any migration.
2. Tap **Back up to cloud**. Your current data becomes snapshot #1 and the
   live synced copy in one step.
3. **Verify:** the card now shows "Last cloud backup: just now."

## Step 7 — Add your second device, and your partner (~3 min)

1. On the other phone or computer, open the app, go to Export & Backup, and
   enter the same Project URL and publishable key.
2. Sign in — with your own email, or your partner signs in with theirs (the
   one you added in Step 3).
3. The app pulls the household's data down automatically. **Verify:** change
   a budget line on one device and watch it appear on the other.

## You're done — here's your new safety posture

| If this happens… | You're covered because… |
|---|---|
| Phone lost or broken | Sign in on any device; everything pulls down from your project. |
| Bad edit or bad import | Versioned snapshots on the same screen — restore any earlier state. |
| No internet | The app keeps working fully offline and catches the cloud up when you're back. |
| Someone finds your public key | Row Level Security + closed signups: no account, no rows, no exceptions. |
| You want out | Download a JSON backup, flip sync off, delete the Supabase project. Your data was always yours. |

Questions the guide should answer better? Open an issue on this repo — this
page evolves with the app.
