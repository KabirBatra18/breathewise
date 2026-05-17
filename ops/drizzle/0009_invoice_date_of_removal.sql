-- Migration 0009 — optional date_of_removal on invoices.
-- Rule 46(c) of CGST Rules requires the date of removal of goods to
-- be shown on the invoice when goods are removed on a date that is
-- not the same as the invoice date. Practically: invoices where
-- equipment ships later than issue date should record the dispatch
-- date for traceability. The field is optional; when NULL the PDF
-- omits the line and uses the issue date as the date of supply.
--
-- DRAFT invoices can set/clear this freely. ISSUED invoices freeze
-- it like every other field (Rule 46 immutability).
--
-- Idempotent (IF NOT EXISTS) so re-running is a no-op.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS date_of_removal DATE;

COMMENT ON COLUMN invoices.date_of_removal IS
  'Optional date of removal/dispatch of goods. Renders on the PDF only when set and different from issue_date.';
