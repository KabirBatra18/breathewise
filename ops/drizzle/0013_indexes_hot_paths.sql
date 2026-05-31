-- Migration 0013 — indexes on common query paths.
--
-- The audit (2026-05-31) found several frequent filter/sort columns
-- that scan the full table. At our row counts today (~10s-100s) this
-- is fine, but it shows up in p99 latency and gets worse linearly as
-- data grows. Adding the indexes now is cheap (small tables = fast
-- index build) and removes the foot-shape from future-us.
--
-- All `IF NOT EXISTS` so the migration is idempotent.

-- Drafts list filters by status + orders by updated_at DESC.
CREATE INDEX IF NOT EXISTS idx_invoices_status_updated_at
  ON invoices(status, updated_at DESC);

-- Client detail page lists every quote for that client.
CREATE INDEX IF NOT EXISTS idx_quotes_client_id
  ON quotes(client_id);

-- Addendum lookups + project rollup join on parent_quote_id.
CREATE INDEX IF NOT EXISTS idx_quotes_parent_quote_id
  ON quotes(parent_quote_id);

-- Dashboard filters by status (DRAFT/SENT/NEGOTIATING/ACCEPTED).
-- We already have a partial index on status WHERE closed_at IS NULL
-- (idx_quotes_status_closed_at from 0000); this generic one covers
-- the closed-quote filters too.
CREATE INDEX IF NOT EXISTS idx_quotes_status
  ON quotes(status);

-- Payment ledger on a quote.
CREATE INDEX IF NOT EXISTS idx_payments_quote_id
  ON payments(quote_id);

-- Audit log lookups by entity (forensic queries) and by actor.
CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
  ON audit_log(actor_id, created_at DESC);
