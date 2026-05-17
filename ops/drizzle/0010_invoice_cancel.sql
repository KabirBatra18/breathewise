-- Migration 0010 — cancel an ISSUED invoice without deleting it.
-- Rule 46 makes an issued tax invoice an immutable legal document, so
-- we cannot hard-delete on a "this was a mistake" click. Instead we
-- introduce a third status CANCELED:
--   * invoice_number stays allocated (no gaps in the BW/INV/2627/NNNN
--     sequence, which is what GST audits expect)
--   * canceled_at + cancel_reason capture the audit trail
--   * the PDF still renders, but with a CANCELED stamp on every copy
--
-- Lifecycle: DRAFT → ISSUED → CANCELED (one-way each arrow).
-- Idempotent (IF NOT EXISTS) so re-running is a no-op.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

COMMENT ON COLUMN invoices.canceled_at IS
  'When status=CANCELED, the moment the cancel action ran. NULL otherwise.';
COMMENT ON COLUMN invoices.cancel_reason IS
  'When status=CANCELED, the human reason captured at cancel time (audit trail).';
