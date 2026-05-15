-- Migration 0007 — round-off + ship-to (delivery) address on invoices.
-- All ALTERs are idempotent (IF NOT EXISTS) so re-running is a no-op.

-- ============================================================
-- 1. Round-off — small ± adjustment applied so the printed grand
--    total is a whole rupee. The DB's total_invoice_value column now
--    stores the ROUNDED amount. The pre-round value can always be
--    reconstructed as `total_taxable_value + total_cgst + total_sgst
--    + total_igst`, and `round_off` captures the delta.
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS round_off NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Ship-to / delivery address. Optional. When non-null the PDF
--    prints a "Ship To" block beside "Bill To". Place of supply is
--    derived from delivery_state when set (otherwise from buyer.state),
--    so a Delhi-billed customer asking for delivery to Noida correctly
--    flips the invoice to IGST.
-- ============================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_address TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_state TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS delivery_state_code TEXT;
