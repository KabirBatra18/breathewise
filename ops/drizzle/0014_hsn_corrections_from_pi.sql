-- Migration 0014 — HSN code corrections for the 12 SKUs that appear on
-- Astberg PI 7026-27/282 (18-May-26).
--
-- Why: the 2026-05-31 audit found that the catalog had nearly every
-- product seeded with HSN "8414" generically, while Astberg's actual
-- supplier invoices use four distinct codes depending on what the
-- physical item is:
--
--   84145910 — ERVs (Energy Recovery Ventilators)
--   84145190 — fans (exhaust, cassette, mixflow, duct)
--   84149090 — steel cowls
--   39269099 — plastic items (ABS reducers, beam crossers, diffusers)
--
-- The mismatch is a Rule 46(g) compliance concern on our outgoing tax
-- invoices and a buyer-side ITC confusion risk (their accountant
-- expects supplier-pass-through HSN to match).
--
-- SCOPE: ONLY the 12 SKUs that physically appear on the PI screenshot
-- the user provided. We do NOT extend the corrections to "obviously
-- similar" siblings (e.g. ADD-75 / ADD-125 / ADD-200) even though
-- they are clearly the same product family — without direct evidence
-- from a supplier invoice line, we're not guessing. Future PIs that
-- add to coverage can be handled in separate migrations.
--
-- This migration is read/write of catalog metadata only. No price,
-- cost, or pricing-engine field is touched. Money math is unaffected.
--
-- Idempotent: each UPDATE specifies the target HSN so re-running is
-- a no-op.

UPDATE products SET hsn_code = '84145910' WHERE sku = 'AHC-800TH';
UPDATE products SET hsn_code = '39269099' WHERE sku = 'ADD-150';
UPDATE products SET hsn_code = '84149090' WHERE sku = 'ASC-150';
UPDATE products SET hsn_code = '39269099' WHERE sku = 'ARD-200-150';
UPDATE products SET hsn_code = '39269099' WHERE sku = 'ABC-150';
UPDATE products SET hsn_code = '39269099' WHERE sku = 'ADD-100';
UPDATE products SET hsn_code = '84145190' WHERE sku = 'AHT-20-65B';
UPDATE products SET hsn_code = '84145190' WHERE sku = 'APT-10-21S';
UPDATE products SET hsn_code = '84149090' WHERE sku = 'ASC-100';
UPDATE products SET hsn_code = '39269099' WHERE sku = 'ARD-150-100';
UPDATE products SET hsn_code = '84145190' WHERE sku = 'AF-150';
UPDATE products SET hsn_code = '84145190' WHERE sku = 'AEE-150';
