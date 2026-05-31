-- Migration 0012 — sync CHECK constraints with the app's actual enums.
--
-- Three constraint mismatches caught in the 2026-05-31 audit:
--
--   1. invoices.status — 0008 constrained to ('DRAFT', 'ISSUED'); 0010
--      added the CANCELED lifecycle state but never updated the CHECK.
--      Every Cancel Invoice click would have raised invoices_status_check.
--
--   2. payments.payment_type — 0000 used a working-draft enum
--      (ROUGH_ADVANCE_20, PRECISE_BALANCE, INTERIM, LABOUR_DAY, MISC)
--      that the app never matched. Real app enum is
--      (ADVANCE, INTERIM, FINAL, FULL, REFUND). Only INTERIM overlapped;
--      every other insert would have raised payments_payment_type_check.
--
--   3. payments.payment_mode — 0000 missed CARD and OTHER which the
--      app's picker exposes.
--
-- Strategy: drop the old CHECK constraints and add new ones using the
-- union of historical + current enums. Union (not replace) so any
-- legacy row from earlier development that happens to use an old value
-- is not invalidated by the migration. The app no longer writes the
-- old values; we keep them allowed only for read-back compatibility
-- and can drop them in a future migration once we're certain no row
-- references them.

-- ── invoices.status ────────────────────────────────────────────────
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('DRAFT', 'ISSUED', 'CANCELED'));

-- ── payments.payment_type ──────────────────────────────────────────
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_type_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_type_check
  CHECK (payment_type IN (
    -- Current app enum
    'ADVANCE', 'INTERIM', 'FINAL', 'FULL', 'REFUND',
    -- Legacy enum retained for read-back compatibility
    'ROUGH_ADVANCE_20', 'PRECISE_BALANCE', 'LABOUR_DAY', 'MISC'
  ));

-- ── payments.payment_mode ──────────────────────────────────────────
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_payment_mode_check;
ALTER TABLE payments ADD CONSTRAINT payments_payment_mode_check
  CHECK (payment_mode IN (
    'UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'OTHER'
  ));
