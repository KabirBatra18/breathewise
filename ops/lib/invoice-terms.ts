/**
 * Tax-invoice Terms & Conditions — printed on the client copy only,
 * not on the transporter/supplier copies.
 *
 * Temporary draft pending lawyer review. To update: just edit the
 * array below and ship — no schema changes needed. When the final
 * version lands, this constant becomes the source of truth across
 * every invoice; old ISSUED invoices regenerate with the new text
 * the next time someone clicks Download (we don't snapshot T&Cs
 * onto the invoice row — they're a static legal recital, not a
 * per-invoice term).
 *
 * Phase 2 of the multi-vertical work (commit 573d433): universal
 * clauses now reference "Urban Tech Home Solutions" (the legal
 * entity) rather than the BreatheWise brand. Ventilation-specific
 * clauses are gated via `verticalSlug` so they appear only on
 * BreatheWise invoices — a UTHS Security smart-lock invoice would
 * otherwise carry irrelevant fresh-air language.
 */

export const INVOICE_TERMS_HEADER =
  "Terms & Conditions (reference: Project Services Agreement dated _______ )";

export interface InvoiceTerm {
  title: string;
  body: string;
  // Restrict this clause to invoices whose primary vertical matches
  // this slug. Undefined = universal (appears on every invoice).
  verticalSlug?: string;
}

const ALL_INVOICE_TERMS: InvoiceTerm[] = [
  {
    title: "Payment",
    body: "Amounts payable as per the agreed payment schedule. Any payment delayed beyond 7 days from the invoice date attracts interest at 18% per annum.",
  },
  {
    title: "Scope",
    body: "This invoice covers services described in the referenced Quotation and Project Services Agreement. Unlisted fittings and installation consumables are billed separately at actuals.",
  },
  {
    title: "Equipment warranty",
    body:
      "All installed equipment is manufactured by third-party companies and carries the manufacturer's standard warranty, which passes through to the Client. Urban Tech Home Solutions does not manufacture, quality-control or independently warrant the equipment. Any product defect, malfunction or internal fault is the responsibility of the manufacturer or authorised importer; we coordinate claims.",
  },
  {
    // Ventilation-only: warranty language about fresh-air CMH at the
    // diffuser is meaningless for security or automation work.
    title: "Performance scope",
    verticalSlug: "breathewise",
    body:
      "The warranted deliverable is filtered fresh air supplied at the designed CMH at each diffuser. Overall indoor PM2.5 / AQI depends on the building envelope and occupant use (open doors, jaali, windows, etc.) and is not warranted.",
  },
  {
    title: "Out of scope",
    body:
      "Electrical work, false ceiling fabrication, plastering, painting, plumbing, fire alarm and BMS integration, and post-handover maintenance are excluded and are the Client's responsibility through their own contractors.",
  },
  {
    title: "Equipment access",
    body:
      "Installed equipment must remain accessible behind the false ceiling. Trap doors or access panels are required at each unit location. Costs of accessing sealed equipment for future repair are the Client's responsibility.",
  },
  {
    title: "Limitation of liability",
    body:
      "Urban Tech Home Solutions' aggregate liability is capped at the total engineering and labour fees received for the project. No liability for indirect, consequential or incidental damages.",
  },
  {
    title: "Maintenance",
    body:
      "Routine cleaning, inspection and consumable replacement (e.g. air filters, batteries) are the Client's responsibility after handover. An optional Annual Maintenance Contract is available on request.",
  },
  {
    title: "Goods once sold",
    body:
      "Goods sold are not returnable or refundable except under manufacturer warranty terms. Equipment risk passes to the Client upon delivery to the Project Site.",
  },
  {
    title: "GST",
    body:
      "GST charged as per applicable rates. ITC available subject to GST compliance by both parties.",
  },
  {
    title: "Force majeure & dispute resolution",
    body:
      "Neither party liable for delays beyond reasonable control. Disputes referred to arbitration at New Delhi (Arbitration and Conciliation Act, 1996). Courts at Delhi / Gautam Buddh Nagar have exclusive jurisdiction.",
  },
  {
    title: "Acceptance",
    body:
      "Payment of this invoice constitutes acceptance of these terms and the referenced Project Services Agreement in full.",
  },
];

/**
 * Returns the list of T&C clauses applicable to an invoice issued
 * under the given vertical. Universal clauses are always included;
 * vertical-scoped clauses (e.g. ventilation-specific Performance
 * scope) appear only when the slug matches.
 *
 * Pass undefined when the calling site doesn't yet have vertical
 * context — defensive: returns only the universal clauses, which
 * is a safe superset for any vertical.
 */
export function invoiceTermsForVertical(verticalSlug: string | undefined): InvoiceTerm[] {
  return ALL_INVOICE_TERMS.filter(
    (t) => t.verticalSlug == null || t.verticalSlug === verticalSlug,
  );
}

/**
 * Back-compat export for any consumer that hasn't switched to the
 * function form yet. Returns the universal-only set (no vertical
 * specifics). New consumers should use invoiceTermsForVertical().
 */
export const INVOICE_TERMS: InvoiceTerm[] = ALL_INVOICE_TERMS.filter(
  (t) => t.verticalSlug == null,
);
