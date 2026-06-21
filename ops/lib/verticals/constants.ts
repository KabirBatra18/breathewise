/**
 * Stable seed UUIDs for the launch verticals, referenced from application
 * code that needs to default to a known vertical (e.g. fallback when a
 * legacy data path lacks a vertical_id). These MUST match the seed values
 * in migrations/0016_uths_verticals.sql.
 *
 * For any new vertical added via Settings → Verticals admin (Phase 4), the
 * UUID is `gen_random_uuid()`-allocated by Postgres at insert time — only
 * these two have hardcoded UUIDs because the migration backfills existing
 * rows to them.
 *
 * Architecture: memory/project_uths_verticals_architecture.md
 */

export const VERTICAL_IDS = {
  BREATHEWISE: "01000000-0000-4000-8000-000000000001",
  UTHS_SECURITY: "01000000-0000-4000-8000-000000000002",
} as const;

export const VERTICAL_SLUGS = {
  BREATHEWISE: "breathewise",
  UTHS_SECURITY: "uths_security",
} as const;

/**
 * Legal-block content that appears on every PDF regardless of vertical.
 * Lives at the UTHS layer, NOT the vertical layer — Rule 46 of CGST Rules
 * requires the registered legal name of the supplier on every tax invoice.
 * The brand on top of the PDF varies; this footer block does not.
 */
export const UTHS_LEGAL_NAME = "Urban Tech Home Solutions";
