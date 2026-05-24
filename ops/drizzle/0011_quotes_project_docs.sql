-- Migration 0011 — capture the two pieces of info needed to print
-- the Project Services Agreement and the Handover Certificate.
--
-- project_site_address: when the work is at a site different from the
--   client's billing/registered address (very common in NCR: client's
--   home vs. their farmhouse / under-construction property). When set,
--   it prints on both the Agreement and the Handover Cert; when NULL
--   we fall back to printing the client's address as the site.
--
-- agreement_signed_date: the date the client signs the Project Services
--   Agreement. Prints as "Agreement Date" on the Handover Certificate.
--   Optional — leave NULL until you have a signed copy in hand.
--
-- Idempotent (IF NOT EXISTS) so re-running is a no-op.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS project_site_address TEXT,
  ADD COLUMN IF NOT EXISTS agreement_signed_date DATE;

COMMENT ON COLUMN quotes.project_site_address IS
  'Site address where the work is being executed when different from the client billing address. Prints on Services Agreement + Handover Certificate.';
COMMENT ON COLUMN quotes.agreement_signed_date IS
  'Date the client signed the Project Services Agreement. Used as Agreement Date on the Handover Certificate.';
