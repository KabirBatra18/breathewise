-- New discount model: replaces the blanket `rough_discount_percent` knob
-- with a single rupee-amount "total discount from MRP" lever.
--
-- When NULL, the engine uses the legacy `rough_discount_percent` path
-- (unchanged for existing quotes).
-- When set, the engine uses computeQuoteTotalsForTarget — every line
-- still keeps its DP / MRP mode, and the target is hit by allocating
-- the delta above the auto-saving as pre-GST discount across goods
-- sections proportionally to their subtotal.
--
-- Verified equivalent to the legacy path to the paisa for uniform-
-- GST goods sections (see lib/pricing/__tests__/target-discount.test.ts).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS discount_target_saving NUMERIC(12, 2) NULL;
