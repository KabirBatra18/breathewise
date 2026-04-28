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

## Troubleshooting

- **Build fails complaining about Next.js not found** — Root Directory wasn't
  set to `ops`. Project Settings → General → Root Directory → `ops`.
- **App loads but DB queries 500** — Postgres not yet connected, or env vars
  missing. Storage tab confirms DB; Deployments tab shows logs.
- **Login form doesn't accept Kabir/101510** — seed didn't run. Local: check
  `.env.production.local` was pulled, then re-run `pnpm db:seed`.
