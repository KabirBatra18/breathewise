-- Migration 0008 — DRAFT invoice state.
-- An invoice can now exist in DRAFT (editable, no number yet) or
-- ISSUED (frozen legal document with sequential number). Convert
-- always lands an invoice in DRAFT; Finalize allocates the number
-- and flips to ISSUED.
--
-- Why this design:
--   • DRAFTs survive page refresh / session loss — state lives in DB,
--     not in form local state.
--   • Numbers only get allocated at Finalize, so deleted DRAFTs leave
--     no gaps in the official BW/INV/2627/NNNN sequence.
--   • ISSUED invoices stay legally immutable (Rule 46) — the editor
--     refuses to load them and the PDF stays bit-for-bit reproducible.
--
-- All ALTERs are idempotent so re-running is a no-op.

-- ============================================================
-- 1. Lifecycle status
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ISSUED';

-- Existing rows (created before this migration) are all legal-issued
-- documents — they already have invoice numbers and frozen totals.
-- Force them to 'ISSUED' explicitly so the default-vs-not-set
-- distinction is unambiguous.
UPDATE invoices SET status = 'ISSUED' WHERE status IS NULL OR status = '';

-- Constrain status to the two allowed values. DROP first so re-runs
-- don't trip on "constraint already exists".
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('DRAFT', 'ISSUED'));

-- ============================================================
-- 2. invoice_number can now be NULL during DRAFT
-- ============================================================
-- Postgres UNIQUE allows multiple NULLs by default, so many drafts
-- can coexist. Once Finalize runs, the number is set non-null and the
-- UNIQUE constraint guards against duplicates.
ALTER TABLE invoices ALTER COLUMN invoice_number DROP NOT NULL;

-- ============================================================
-- 3. Auto-touch invoices.updated_at when a DRAFT's rows change so
--    we can sort the drafts list by recency.
-- ============================================================
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_invoices_updated_at ON invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
