# BreatheWise Ops — Deploy

Single-vendor: Vercel hosts the Next.js app **and** the Postgres database. Free
tier. Roughly 10 minutes from zero to a public URL.

## What you need to do (the only manual steps)

1. **GitHub** (3 min)
   - Sign up / log in at https://github.com
   - Create a new **private** repo named `breathewise-ops`. Leave it empty
     (no README, no .gitignore).
   - Send the URL to Claude (looks like
     `https://github.com/YOUR_USERNAME/breathewise-ops.git`).

2. **Vercel** (3 min)
   - Sign up at https://vercel.com using "Continue with GitHub".
   - Once logged in, **Add New → Project → Import Git Repository**, pick
     `breathewise-ops` (after Claude has pushed code there).
   - Click **Deploy**. The first deploy will fail because there's no DB yet;
     that's fine.

3. **Vercel Postgres** (2 min)
   - In the project, go to **Storage → Create Database → Postgres**.
   - Pick a region (Singapore `sin1` for India proximity).
   - Click **Connect Project**. Vercel auto-injects `POSTGRES_URL`,
     `POSTGRES_URL_NON_POOLING`, and other Postgres env vars into the deploy.

4. **Set the remaining env vars** (1 min, in Vercel project Settings → Environment
   Variables, add to all environments):
   - `SESSION_SECRET` — Claude generates this and shares
   - `SEED_OWNER_USERNAME` — `Kabir`
   - `SEED_OWNER_PASSWORD` — `101510` (change after first login)
   - `SEED_OWNER_FULLNAME` — `Kabir`

5. **Trigger redeploy** from the Vercel Deployments tab so the new env vars
   are picked up.

## What Claude does

- Pushes the 13 commits to the GitHub repo.
- Pulls the new env vars locally (`vercel env pull`).
- Runs `pnpm db:migrate` to create all tables on Vercel Postgres.
- Runs `pnpm db:seed` to create your `Kabir` owner account.
- Verifies the production URL responds correctly.
- Sends you the URL and next steps for setting up a custom subdomain
  (`hub.breathewise.in`) on GoDaddy.

## After deployment

Open the production URL, log in as `Kabir / 101510`, change your password, and
add employees from `/settings/users`. The team accesses the same URL from any
device.

If anything breaks: the Vercel Deployments tab has logs; psql connection
string is in Storage → your DB → `.env.local` tab.
