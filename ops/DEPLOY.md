# BreatheWise Ops — Deploy

Single-vendor: Vercel hosts the Next.js app **and** the Postgres database. Free
tier. ~10 minutes from zero to a public URL.

The ops app lives inside the public-website repo under `ops/`. Vercel imports
the same repo and is told to treat `ops/` as the project root, so the public
website at `/` is untouched.

## Vercel project setup

1. **Import** — at vercel.com → **Add New → Project → Import Git Repository**,
   pick `breathewise`.
2. **Configure project** — in the Configure form before clicking Deploy:
   - **Root Directory** → click **Edit** → select **`ops`**. (This is the
     critical step. Without it, Vercel tries to deploy the public website
     root and fails.)
   - Framework Preset should auto-detect as Next.js.
   - Leave the rest at defaults.
3. **Click Deploy.** First deploy will fail because there's no DB yet —
   that's expected.

## Provision the database

1. In the project, **Storage → Create Database → Postgres**.
2. Pick region **Singapore `sin1`** for India proximity.
3. **Connect Project**. Vercel auto-injects `POSTGRES_URL`,
   `POSTGRES_URL_NON_POOLING`, etc. into all deployments.

## Set the remaining env vars

In the Vercel project, **Settings → Environment Variables** (apply to
Production, Preview, and Development):

| Name | Value |
|------|-------|
| `SESSION_SECRET` | (32-byte base64, Claude provides) |
| `SEED_OWNER_USERNAME` | `Kabir` |
| `SEED_OWNER_PASSWORD` | `101510` |
| `SEED_OWNER_FULLNAME` | `Kabir` |
| `CRON_SECRET` | (any random 32-char string; gates `/api/cron/db-ping`) |
| `SENTRY_DSN` | (optional — from Sentry project settings) |

Trigger a redeploy from the **Deployments** tab so the new env vars apply.

## After the redeploy succeeds

Claude runs locally:
- `vercel env pull .env.production.local` — fetches the live `POSTGRES_URL`.
- `DATABASE_URL=$(grep POSTGRES_URL_NON_POOLING .env.production.local | cut -d= -f2-) pnpm db:migrate` — creates tables.
- Same with `pnpm db:seed` — creates the OWNER account.
- Curls the production URL to verify `/login` is up.

You then open the URL, log in as `Kabir / 101510`, change your password, and
add employees from `/settings/users`.

## Custom subdomain (`hub.breathewise.in`)

Once verified, in Vercel project → **Settings → Domains** add `hub.breathewise.in`.
Vercel shows you a CNAME record. Add it at GoDaddy → DNS → CNAME, host `hub`,
points to `cname.vercel-dns.com`. Wait 5–30 min for propagation. Done.

## Migrations after a code push

Migrations don't run automatically. After any push that touches
`drizzle/*.sql` or `db/schema.ts`:

```bash
cd ops
pnpm dlx vercel@latest env pull .env.production.local --environment=production --yes
DATABASE_URL=$(grep '^POSTGRES_URL_NON_POOLING=' .env.production.local | cut -d= -f2- | tr -d '"') pnpm db:migrate
```

`pnpm db:migrate` auto-discovers SQL files in `drizzle/` (sorted) and
applies anything not in `_bw_migrations`. Idempotent — safe to re-run.

## Rollback runbook

**Code-only regression** (a bad page or route):
1. `git revert <bad-sha> && git push origin main` — Vercel deploys
   the revert automatically.
2. If the bad deploy is still serving traffic, the Vercel **Deployments**
   tab has "Promote to Production" on the previous good deploy for
   instant rollback.

**Bad schema migration** (`0014_foo.sql` corrupted data):

1. **Do not** drop the migration file or `_bw_migrations` row — that
   loses the history of what actually ran.
2. Write a new compensating migration (`0015_revert_foo.sql`) that
   undoes the damage. Idempotent (IF NOT EXISTS / IF EXISTS guards).
3. Apply locally against prod via `pnpm db:migrate`.
4. If the original migration locked a critical table (rare on our
   row counts), Supabase **Database → Point in time recovery** can
   roll the DB back ~24h on the free tier. Free tier retention is
   only one day — escalate to Pro before any large migration if you
   want a longer window.

**Cron alert fires** (`/api/cron/db-ping` returns 500):
- Most likely cause: Supabase free-tier auto-paused the project.
  Open the Supabase dashboard → Restore. Pull env again and verify.
- Less likely: the `CRON_SECRET` doesn't match between Vercel cron
  config and the env var. Reset both to the same value.

## Troubleshooting

- **Build fails complaining about Next.js not found** — Root Directory wasn't
  set to `ops`. Project Settings → General → Root Directory → `ops`.
- **App loads but DB queries 500** — Postgres not yet connected, or env vars
  missing. Storage tab confirms DB; Deployments tab shows logs.
- **Login form doesn't accept Kabir/101510** — seed didn't run. Local: check
  `.env.production.local` was pulled, then re-run `pnpm db:seed`.
- **PDF download shows "site not available" in the preview drawer** —
  middleware `X-Frame-Options` / `frame-ancestors` blocking same-origin
  iframe. Should be SAMEORIGIN / `'self'`. See [`middleware.ts`](./middleware.ts).
- **Quote PDF crashes with `[DecimalError] Invalid argument`** — value
  passed to `new Decimal(...)` has invalid format. Check the
  `totalDiscountVsMrp` style of `-${value}` string concatenation;
  prefer `Decimal(value).neg().toFixed(2)`.
