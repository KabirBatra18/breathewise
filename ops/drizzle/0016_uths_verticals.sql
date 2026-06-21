-- ============================================================================
-- Migration 0016 — UTHS multi-vertical foundation
-- ============================================================================
-- Architecture: see memory/project_uths_verticals_architecture.md
--
-- UTHS (Urban Tech Home Solutions) is the legal entity. BreatheWise and
-- UTHS Security are the first two "verticals" (brand layers) it operates
-- under. Verticals affect ONLY presentation (PDF header, logo, brand colour,
-- WhatsApp signature, default T&C set). The legal block on every invoice
-- ("Issued by Urban Tech Home Solutions, GSTIN 07XXX, …") is unchanged.
--
-- This migration is purely ADDITIVE and uses static seed UUIDs so the
-- migration is deterministic and the same UUIDs can be referenced from
-- application code as constants. All existing rows are backfilled to the
-- BreatheWise vertical so this migration is visually a no-op for the
-- existing data set.
--
-- After this migration is applied, Phase 2's PDF + WhatsApp wiring will
-- start reading vertical-specific branding, and the invoice number prefix
-- flips from BW to UTHS for all newly-finalized invoices. Pre-existing
-- BW/INV/2627/NNNN invoices remain as-issued (legally immutable).
-- ============================================================================

BEGIN;

-- ─── verticals table ──────────────────────────────────────────────────────
CREATE TABLE verticals (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  brand_name TEXT NOT NULL,
  tagline TEXT,
  logo_url TEXT,
  -- Hex with leading #. Used as the accent stripe / heading colour on the
  -- per-vertical PDF header. The legal block stays neutral grey regardless.
  brand_color TEXT,
  -- Signature appended to outgoing WhatsApp messages. Includes the
  -- "· Urban Tech Home Solutions" suffix because customers should always
  -- know which legal entity they are dealing with.
  whatsapp_signature TEXT NOT NULL,
  email_from_name TEXT NOT NULL,
  website_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER verticals_set_updated_at
  BEFORE UPDATE ON verticals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Seed the two launch verticals ────────────────────────────────────────
-- Stable UUIDs intentionally chosen so the application code can reference
-- these by constant (see lib/verticals/constants.ts). Do NOT regenerate
-- these UUIDs in dev — they are referenced by NOT-NULL FK columns below.
INSERT INTO verticals (
  id, slug, brand_name, tagline, brand_color,
  whatsapp_signature, email_from_name, website_url, display_order
) VALUES
  (
    '01000000-0000-4000-8000-000000000001',
    'breathewise',
    'BreatheWise',
    'Ventilation & Air Quality Solutions',
    '#0ea5e9',
    'BreatheWise · Urban Tech Home Solutions',
    'BreatheWise Team',
    'https://breathewise.in',
    1
  ),
  (
    '01000000-0000-4000-8000-000000000002',
    'uths_security',
    'UTHS Security',
    'Smart Locks · Access Control · Surveillance',
    '#dc2626',
    'UTHS Security · Urban Tech Home Solutions',
    'UTHS Security Team',
    NULL,
    2
  );

-- ─── Add vertical references to quotes / invoices / line items ────────────
-- Pattern for each NOT NULL column: (a) add nullable, (b) backfill to
-- BreatheWise, (c) set NOT NULL. This pattern lets the migration run
-- against a non-empty prod DB without violating constraints mid-way.

ALTER TABLE quotes ADD COLUMN primary_vertical_id UUID REFERENCES verticals(id);
UPDATE quotes
   SET primary_vertical_id = '01000000-0000-4000-8000-000000000001'
 WHERE primary_vertical_id IS NULL;
ALTER TABLE quotes ALTER COLUMN primary_vertical_id SET NOT NULL;

ALTER TABLE invoices ADD COLUMN primary_vertical_id UUID REFERENCES verticals(id);
UPDATE invoices
   SET primary_vertical_id = '01000000-0000-4000-8000-000000000001'
 WHERE primary_vertical_id IS NULL;
ALTER TABLE invoices ALTER COLUMN primary_vertical_id SET NOT NULL;

ALTER TABLE quote_line_items ADD COLUMN vertical_id UUID REFERENCES verticals(id);
UPDATE quote_line_items
   SET vertical_id = '01000000-0000-4000-8000-000000000001'
 WHERE vertical_id IS NULL;
ALTER TABLE quote_line_items ALTER COLUMN vertical_id SET NOT NULL;

-- Note: invoice line items live in the `invoice_lines` table, not
-- `invoice_line_items` (singular vs plural — see db/schema.ts:366).
ALTER TABLE invoice_lines ADD COLUMN vertical_id UUID REFERENCES verticals(id);
UPDATE invoice_lines
   SET vertical_id = '01000000-0000-4000-8000-000000000001'
 WHERE vertical_id IS NULL;
ALTER TABLE invoice_lines ALTER COLUMN vertical_id SET NOT NULL;

-- ─── Products get an optional default vertical (QoL hint) ─────────────────
-- A Yale lock product can carry default_vertical_id = UTHS Security so
-- the quote builder auto-tags the line when the user adds that product.
-- An ERV stays default_vertical_id = BreatheWise. A generic labour line
-- stays NULL (inherits the quote's primary vertical at line creation).
ALTER TABLE products ADD COLUMN default_vertical_id UUID REFERENCES verticals(id);

-- ─── Terms clauses scoped per vertical ────────────────────────────────────
-- vertical_id IS NULL → "universal" clause (e.g. payment-to-UTHS, GST
-- applicability, dispute resolution) — appears regardless of which
-- verticals the quote touches.
-- The existing is_default boolean is reused with vertical-aware semantics
-- in Phase 5's auto-assembly engine:
--   is_default=TRUE + vertical_id IS NULL    → universal auto-include
--   is_default=TRUE + vertical_id=<vertical> → auto-include when that
--                                              vertical is present on the
--                                              quote (primary or per-line)
--   is_default=FALSE                          → manual opt-in only
ALTER TABLE terms_clauses ADD COLUMN vertical_id UUID REFERENCES verticals(id);

-- ─── Tag existing terms clauses ───────────────────────────────────────────
-- All existing clauses were written for the ventilation-only business, so
-- they belong to the BreatheWise vertical. Default-include any clause
-- whose title suggests it should fire automatically (payment, validity,
-- GST, warranty terms). Manual opt-in clauses stay is_default = FALSE.
UPDATE terms_clauses
   SET vertical_id = '01000000-0000-4000-8000-000000000001'
 WHERE vertical_id IS NULL;

-- ─── Flip the invoice / quote number prefix from BW to UTHS ───────────────
-- Existing BW/INV/2627/NNNN invoices are unchanged (legally issued, frozen
-- by the application logic). From the moment the deploy goes live, the next
-- next_invoice_number(prefix, fy) call will receive 'UTHS' and start a
-- fresh series at UTHS/INV/2627/0001. The BW series effectively closes at
-- its last issued number. CA-clean: one prefix change, one cutover date,
-- fully documented.
--
-- The same prefix is used by quotes: BW-2026-NNNN → UTHS-2026-NNNN going
-- forward. Existing BW-2026-NNNN quotes are unchanged.
UPDATE company_settings
   SET quote_number_prefix = 'UTHS'
 WHERE id = 1;

COMMIT;
