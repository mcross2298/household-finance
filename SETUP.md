# Setup Guide — Get Your Own Private Copy Running

This walks you through putting this app in **your own private GitHub repository**
and hosting it with **Cloudflare** so you (and anyone you invite) can open it from
a private web address, install it like an app, and have it stay in sync with any
updates you make.

**No coding experience needed.** You won't touch a command line — everything
below happens by clicking around two websites: [GitHub](https://github.com) and
[Cloudflare](https://dash.cloudflare.com).

Total time: about 15–20 minutes the first time.

> **Remember:** your financial data itself never touches GitHub or Cloudflare.
> Both only ever host the *app* (the code). Your numbers live only in the
> browser on whatever device you use it from — see the Privacy section of the
> [README](README.md) for details.

---

## What you'll have when you're done

- A **private GitHub repository** — your own copy of the app's code, backed up
  and versioned, that only you (and people you invite) can see.
- A **live web address** (something like `your-app-name.workers.dev`) where the
  app runs, hosted by Cloudflare for free.
- The ability to **install it like a real app** on your phone or computer's home
  screen.

---

## Part 1 — Create a GitHub account

Skip this if you already have one.

1. Go to **[github.com/signup](https://github.com/signup)**.
2. Enter an email, create a password, and pick a username.
3. Verify your email when GitHub sends you the confirmation code.
4. When asked about a plan, the **Free** plan is all you need.

---

## Part 2 — Get the app's code into your own private repository

1. 1. Go to **[github.com/mcross2298/household-finance](https://github.com/mcross2298/household-finance)**
   — the template repository.
2. Click the green **Use this template** button near the top of the page
   (if you don't see this button, see the "No 'Use this template' button?" note
   below).
3. Choose **Create a new repository**.
4. Give it a name — e.g. `household-finance`. Anything works; it's just a label.
5. Under **Repository visibility**, choose **Private**. This is the important
   step — it keeps your copy of the code visible only to you.
6. Click **Create repository**.

You now have your own private copy on GitHub. You'll see a page listing folders
like `js`, `css`, and files like `index.html` and `README.md` — that's the app.

> **No "Use this template" button?** That means you were given a ZIP file
> instead of a link to a template repo. In that case:
> 1. Unzip the file on your computer.
> 2. On GitHub, click the **+** icon (top right) → **New repository**.
> 3. Name it, set it to **Private**, and click **Create repository**.
> 4. On the new repo's page, click **uploading an existing file**.
> 5. Drag every file and folder from the unzipped folder into the browser
>    window, then click **Commit changes**.

---

## Part 3 — Create a Cloudflare account

1. Go to **[dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up)**.
2. Enter your email and a password, and verify your email.
3. You'll land on the Cloudflare dashboard. You don't need to add a domain name
   or configure anything else — just having the account is enough for the next
   step.

---

## Part 4 — Connect Cloudflare to your GitHub repository

This is the step that takes your code and makes it a live, working website.

1. In the Cloudflare dashboard, find **Workers & Pages** in the left sidebar.
2. Click **Create** (or **Create application**), then look for an option like
   **Import a repository** or **Connect to Git**.
3. Click **Connect GitHub** and authorize Cloudflare when GitHub asks. You can
   choose to give it access to **only this one repository** — you don't need to
   grant it access to everything in your GitHub account.
4. Select the repository you created in Part 2.
5. Cloudflare will detect the project's settings automatically (it reads a file
   in the repo called `wrangler.jsonc`) — you shouldn't need to change the
   build settings. If it asks for a build command, leave it blank; this app has
   no build step.
6. Click **Save and Deploy**.

Cloudflare will now build and publish your app. After a minute or two, you'll get
a live web address that looks like:

```
https://household-finance.<your-cloudflare-name>.workers.dev
```

Open that link — you should see the app, with its demo data ready to explore.

**From now on:** any time you (or an AI assistant working on your behalf) push a
change to this GitHub repository, Cloudflare automatically rebuilds and
re-deploys the site within a minute or two. You never have to repeat this setup.

---

## Part 5 — (Optional but recommended) Lock the address down further

The app itself keeps your data private — nothing you enter is ever sent to
Cloudflare or GitHub. But the *web address* from Part 4 is technically public:
anyone who guesses or is given that exact URL could open the app (they'd see the
demo data or an empty household, not your data, unless they were using your
specific browser/device). If you'd rather the URL itself only work for you:

1. In the Cloudflare dashboard, go to your Worker → **Settings** →
   **Domains & Routes**.
2. Look for **Enable Cloudflare Access** (part of Cloudflare's free Zero Trust
   tier).
3. Add your own email (and anyone else's you want to allow, e.g. a partner's)
   to the allow-list.
4. Now, opening the URL requires signing in with an allow-listed email first —
   like a login screen in front of the app.

This step is optional. Skip it if you're comfortable with "unlisted" (not
indexed anywhere, hard to guess) being private enough for you.

---

## Part 6 — Start using it

1. Open your new web address.
2. You'll see a demo household with sample data — poke around to see how
   everything works.
3. When you're ready to enter your own numbers: go to
   **Export & Backup → Start fresh (clear demo data)**.
4. **Install it like an app:**
   - **iPhone (Safari):** tap the Share icon → **Add to Home Screen**.
   - **Android (Chrome):** tap the ⋮ menu → **Install app** (or **Add to Home
     screen**).
   - **Desktop (Chrome/Edge):** click the install icon in the address bar.
   - Installing it this way also makes it work **offline** and (on iPhone)
     prevents Safari from clearing its data during long gaps between visits.
5. **Back up regularly:** since everything lives only in your browser, use
   **Export & Backup → Download backup** any time you've entered something
   you'd hate to retype, and especially before switching phones or browsers.

---

## Making updates later

If you ever want to customize the app (rename it, change categories, tweak the
look), just edit the files in your private GitHub repository — either directly
on GitHub's website (click a file → the pencil/edit icon) or by asking an AI
coding assistant to do it for you. Any change saved to the repository's `main`
branch automatically redeploys to your live address within a couple of minutes.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Cloudflare says it can't find `wrangler.jsonc` | Make sure you selected the repository root when connecting — the file should be at the top level of the repo, not inside a subfolder. |
| The deployed site shows a blank page | Open your browser's developer console (F12) and check for a red error; this usually means a file failed to upload in Part 2 — try re-uploading. |
| I don't see my data on my other device | This is expected — data is per-browser, per-device. Use **Export & Backup → Download backup** on one device and **Restore from backup** on the other. |
| I want to undo everything and start the Cloudflare setup over | In Cloudflare, go to Workers & Pages, select the project, and delete it. Your GitHub repository (and its history) is untouched — you can reconnect it any time. |
