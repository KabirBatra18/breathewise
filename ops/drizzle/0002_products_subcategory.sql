-- Add a free-form subcategory label so the product picker can group
-- products the way Astberg's PDF price-list groups them (e.g. "ABC —
-- Beam Crosser Lantel Device Adaptor", "AHE Series — D / THP / TH /
-- THB Models"). The existing `category` column stays a coarse
-- FRESH_AIR / EXHAUST / ACCESSORY bucket.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS subcategory TEXT;

CREATE INDEX IF NOT EXISTS idx_products_subcategory
  ON products (subcategory);
