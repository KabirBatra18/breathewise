-- ============================================================================
-- Migration 0021 — Invoice installation-safety disclaimer toggle
-- ============================================================================
-- Adds one boolean column that gates a client-facing safety-disclaimer
-- clause on the invoice PDF. Purpose: when Kabir has advised a specific
-- installation approach (moisture/heat/environmental) and the client
-- refuses or switches vendor mid-project, this clause makes BreatheWise's
-- liability boundary explicit on the invoice itself.
--
-- Default false — the clause is opt-in per invoice. Existing invoices
-- keep their current output (nothing appears until owner ticks the box).
-- The clause text itself is hardcoded in the PDF component so the wording
-- stays consistent; case-specific context goes in the existing `notes`
-- column which is already printed on the PDF.
-- ============================================================================

ALTER TABLE invoices
  ADD COLUMN show_safety_clause boolean NOT NULL DEFAULT false;
