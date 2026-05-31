# BreatheWise Ops

Internal CRM + GST quoting + tax-invoicing app for BreatheWise / Urban
Tech Home Solutions. Built for a single Indian small business; one
OWNER (the founder), a small employee roster, daily desk use.

- **Stack:** Next.js 14 App Router · Drizzle ORM · Postgres (Supabase)
  · Tailwind v4 · shadcn-style components on Base UI primitives
  · `@react-pdf/renderer` + `pdf-lib` for documents
- **Deploy:** Vercel (region `bom1`), domain `hub.breathe-wise.in`
- **Lives at:** `/ops` inside the BreatheWise repo. The public marketing
  site sits in the same repo at the root.

## Quick links

- [DEPLOY.md](./DEPLOY.md) — Vercel + Supabase setup, env vars,
  domain configuration, rollback playbook
- [`drizzle/`](./drizzle) — SQL migrations (auto-discovered by
  `pnpm db:migrate`; just drop a new `NNNN_*.sql` file)
- [`db/schema.ts`](./db/schema.ts) — Drizzle schema, single source of
  TS truth for the DB
- [`lib/pricing/`](./lib/pricing) — money math (HALF_UP rounding,
  GST split, MRP discount engine). 88 vitest tests gate any change.

## Local development

```bash
pnpm install
cp .env.local.example .env.local         # fill in DATABASE_URL etc.
pnpm db:migrate                          # apply schema to your local DB
pnpm db:seed                             # OWNER + sample data
pnpm dev
```

## Useful scripts

| Command | Does |
|---|---|
| `pnpm dev` | Next.js dev server |
| `pnpm typecheck` | `tsc --noEmit`, gated by CI |
| `pnpm test` | Vitest — money math + projects rollup |
| `pnpm e2e` | Playwright smoke tests |
| `pnpm db:migrate` | Apply pending SQL migrations (auto-discovers files) |
| `pnpm db:seed` | Seed OWNER + Astberg catalog |
| `pnpm db:studio` | Drizzle Studio for ad-hoc queries |

## Deploying to prod

Migrations **do not run automatically** on Vercel deploy. After
pushing a schema change, run locally against the prod DB:

```bash
pnpm dlx vercel@latest env pull .env.production.local --environment=production --yes
DATABASE_URL=$(grep '^POSTGRES_URL_NON_POOLING=' .env.production.local | cut -d= -f2- | tr -d '"') pnpm db:migrate
```

Then push the code commit. See [DEPLOY.md](./DEPLOY.md) for the full
walkthrough and a rollback runbook.

## House rules

- **Don't touch money math without running `pnpm test`.** The 88-test
  pricing suite is the firewall against silent invoice errors.
- **Drizzle for queries, never `sql.raw`.** Parameterised by default.
- **New migration → drop the file in `drizzle/`.** The runner
  auto-discovers; no array to update.
- **Add an `audit({ action, entityType, entityId, metadata })` call**
  on every mutating server action. The audit log is what we'll need
  if a GST audit ever asks "who changed this invoice and when."
