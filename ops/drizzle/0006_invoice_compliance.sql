-- Migration 0006 — tax-invoice infrastructure.
-- Adds HSN codes to products, GST state codes to clients & company,
-- bank details to company_settings, the `invoices` + `invoice_lines`
-- tables, and a per-FY invoice numbering function. Idempotent: every
-- ALTER uses IF NOT EXISTS / IF EXISTS so re-running is safe.
--
-- Does NOT touch any quote-side tables — the PI generator continues
-- to work exactly as before.

-- ============================================================
-- 1. HSN codes on products
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS hsn_code TEXT;

-- Smart backfill by category / subcategory:
--   AHE-* fresh-air units → 8415 (energy recovery ventilators, AC machines)
--   Filters / purifiers → 8421 (filtering machinery)
--   Everything else (fans, blowers, accessories) → 8414 (default)
-- This is a 4-digit fallback that satisfies the < ₹5 Cr turnover rule;
-- 6 of the ~207 products can be hand-refined later in the catalog UI.
UPDATE products
SET hsn_code = '8415'
WHERE hsn_code IS NULL
  AND category = 'FRESH_AIR'
  AND subcategory ILIKE 'AHE%';

UPDATE products
SET hsn_code = '8421'
WHERE hsn_code IS NULL
  AND (
    (category = 'ACCESSORY' AND subcategory ILIKE '%filter%')
    OR (category = 'FRESH_AIR' AND (subcategory ILIKE '%filter%' OR subcategory ILIKE '%purifier%' OR subcategory ILIKE '%IFD%'))
  );

UPDATE products
SET hsn_code = '8414'
WHERE hsn_code IS NULL;

-- ============================================================
-- 2. GST state code on clients
-- ============================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state_code TEXT;

-- Backfill from the existing free-text `state` column. Standard 2-digit
-- GST state codes per CBIC. NULL stays NULL for unparseable entries —
-- the invoice-conversion UI will surface those for manual entry.
UPDATE clients
SET state_code = CASE LOWER(TRIM(state))
  WHEN 'jammu and kashmir' THEN '01'
  WHEN 'himachal pradesh' THEN '02'
  WHEN 'punjab' THEN '03'
  WHEN 'chandigarh' THEN '04'
  WHEN 'uttarakhand' THEN '05'
  WHEN 'haryana' THEN '06'
  WHEN 'delhi' THEN '07'
  WHEN 'rajasthan' THEN '08'
  WHEN 'uttar pradesh' THEN '09'
  WHEN 'bihar' THEN '10'
  WHEN 'sikkim' THEN '11'
  WHEN 'arunachal pradesh' THEN '12'
  WHEN 'nagaland' THEN '13'
  WHEN 'manipur' THEN '14'
  WHEN 'mizoram' THEN '15'
  WHEN 'tripura' THEN '16'
  WHEN 'meghalaya' THEN '17'
  WHEN 'assam' THEN '18'
  WHEN 'west bengal' THEN '19'
  WHEN 'jharkhand' THEN '20'
  WHEN 'odisha' THEN '21'
  WHEN 'chhattisgarh' THEN '22'
  WHEN 'madhya pradesh' THEN '23'
  WHEN 'gujarat' THEN '24'
  WHEN 'dadra and nagar haveli and daman and diu' THEN '26'
  WHEN 'maharashtra' THEN '27'
  WHEN 'karnataka' THEN '29'
  WHEN 'goa' THEN '30'
  WHEN 'lakshadweep' THEN '31'
  WHEN 'kerala' THEN '32'
  WHEN 'tamil nadu' THEN '33'
  WHEN 'puducherry' THEN '34'
  WHEN 'andaman and nicobar islands' THEN '35'
  WHEN 'telangana' THEN '36'
  WHEN 'andhra pradesh' THEN '37'
  WHEN 'ladakh' THEN '38'
  ELSE NULL
END
WHERE state_code IS NULL AND state IS NOT NULL;

-- ============================================================
-- 3. Company settings — state, PAN, bank
-- ============================================================
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS state_code TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS pan TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_account TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_ifsc TEXT;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS bank_branch TEXT;

-- Seed BreatheWise as Delhi (state code 07). Confirmed by user.
UPDATE company_settings
SET state = 'Delhi', state_code = '07'
WHERE id = 1 AND state IS NULL;

-- ============================================================
-- 4. invoices — frozen tax-invoice snapshots born from quotes
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  quote_id UUID NOT NULL REFERENCES quotes(id),
  client_id UUID NOT NULL REFERENCES clients(id),

  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Supply geography (frozen at generation time so a later change to
  -- buyer's address doesn't retroactively flip CGST/SGST ↔ IGST).
  supplier_state TEXT NOT NULL,
  supplier_state_code TEXT NOT NULL,
  place_of_supply TEXT NOT NULL,
  place_of_supply_code TEXT NOT NULL,
  is_inter_state BOOLEAN NOT NULL,

  -- Rule 46(p): reverse charge declaration. Defaults to No (forward
  -- charge — supplier remits the tax).
  reverse_charge BOOLEAN NOT NULL DEFAULT FALSE,
  -- User flag at generation time: include labour sections on this
  -- invoice (default OFF — labour is often cash-paid and off-invoice).
  include_labour BOOLEAN NOT NULL DEFAULT FALSE,

  -- Frozen supplier snapshot (company_settings as it was at issue).
  supplier_legal_name TEXT NOT NULL,
  supplier_address TEXT,
  supplier_gstin TEXT,
  supplier_pan TEXT,
  supplier_phone TEXT,
  supplier_email TEXT,

  -- Frozen buyer snapshot (client as it was at issue).
  buyer_name TEXT NOT NULL,
  buyer_company TEXT,
  buyer_address TEXT,
  buyer_gstin TEXT,
  buyer_phone TEXT,
  buyer_email TEXT,
  buyer_state TEXT,
  buyer_state_code TEXT,

  -- Bank snapshot (so changing your bank doesn't rewrite history).
  bank_name TEXT,
  bank_account TEXT,
  bank_ifsc TEXT,
  bank_branch TEXT,

  -- Totals — Rule 46(j..l)
  total_taxable_value NUMERIC(12, 2) NOT NULL,
  total_cgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_sgst NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_igst NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_invoice_value NUMERIC(12, 2) NOT NULL,

  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_quote_id ON invoices(quote_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON invoices(issue_date);

-- ============================================================
-- 5. invoice_lines — one row per line item, with HSN & tax split
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sno INT NOT NULL,
  section_letter TEXT,
  section_title TEXT,
  is_labour_style BOOLEAN NOT NULL DEFAULT FALSE,
  sku_snapshot TEXT,
  description TEXT NOT NULL,
  hsn_code TEXT,             -- nullable for custom lines without a product
  quantity NUMERIC(12, 2) NOT NULL,
  unit TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  gst_rate NUMERIC(5, 2) NOT NULL,
  taxable_value NUMERIC(12, 2) NOT NULL,
  cgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  cgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  sgst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  igst_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(12, 2) NOT NULL,
  sort_order INT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice_id ON invoice_lines(invoice_id);

-- ============================================================
-- 6. Per-FY invoice number sequence (BW/INV/2627/0001)
-- ============================================================
-- Rule 46(b): unique sequential, ≤ 16 chars, alphanumeric + - + /.
--   "BW/INV/2627/0001" = 16 chars exactly. fy_label is YYYY (start
--   year + end year concatenated without a dash) so we stay under
--   the cap while still encoding the FY 2026-27 unambiguously.
CREATE OR REPLACE FUNCTION next_invoice_number(prefix TEXT, fy_start_year INT) RETURNS TEXT AS $$
DECLARE
  fy_label TEXT;
  next_n INT;
BEGIN
  fy_label := LPAD((fy_start_year % 100)::TEXT, 2, '0')
           || LPAD(((fy_start_year + 1) % 100)::TEXT, 2, '0');
  PERFORM pg_advisory_xact_lock(hashtext('invoice_number_' || fy_label));
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(invoice_number, '/', 4) AS INT)
  ), 0) + 1 INTO next_n
  FROM invoices
  WHERE invoice_number LIKE prefix || '/INV/' || fy_label || '/%';
  RETURN prefix || '/INV/' || fy_label || '/' || LPAD(next_n::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
