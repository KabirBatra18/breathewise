-- Per-quote flag controlling whether the "You save ₹X vs list price"
-- bar renders on the Proforma / Tax Invoice PDFs. Default is false:
-- on small percentage savings (e.g. 0.2%) the bar reads as silly.
-- Toggle on per-quote when the saving is meaningful.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS show_savings_on_pdf BOOLEAN NOT NULL DEFAULT false;
