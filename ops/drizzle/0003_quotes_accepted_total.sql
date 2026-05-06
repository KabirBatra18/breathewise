-- Capture the final negotiated close terms when a quote moves to ACCEPTED.
-- The ROUGH-tier total in `quote_tier_financials` is the *quoted* total.
-- Real life often closes at a slightly different figure (verbal negotiation,
-- additional small discount). `accepted_total` is the actual contract value
-- the client agreed to pay, and is what payments are reconciled against.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS accepted_total NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS accepted_notes TEXT;

-- Speed up the payments index page (which lists accepted quotes with
-- outstanding balances ordered by oldest acceptance).
CREATE INDEX IF NOT EXISTS idx_quotes_status_closed_at
  ON quotes (status, closed_at)
  WHERE status IN ('ACCEPTED', 'ADVANCE_PAID');

-- Speed up the per-quote payment ledger.
CREATE INDEX IF NOT EXISTS idx_payments_quote_received
  ON payments (quote_id, received_at);
