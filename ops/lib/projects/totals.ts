import { Decimal, ZERO, toMoney } from "@/lib/pricing/decimal";

/**
 * Project-level rollup helpers.
 *
 * A "project" is the parent quote plus any addendums (child quotes
 * whose `parent_quote_id` points at the parent). For tracking
 * collections, we treat the chain as one engagement: the project's
 * contract value is the sum of accepted totals across the chain, and
 * outstanding is contract value minus all payments recorded against
 * any quote in the chain.
 */

export interface ProjectQuoteRow {
  id: string;
  status: string;
  // Final negotiated total (GST-incl). Null until accepted.
  acceptedTotal: string | null;
  // Fallback used when acceptedTotal is null (the most recent
  // ROUGH-tier saved totalInvoiceValue, also GST-incl).
  fallbackTotal: string | null;
}

export interface ProjectPaymentRow {
  amount: string;
  paymentType: string; // includes REFUND which subtracts
}

const ACCEPTED_STATUSES = new Set(["ACCEPTED", "ADVANCE_PAID"]);

/**
 * Effective contract value for one quote in a project. We use
 * acceptedTotal when set, otherwise fall back to the last saved
 * ROUGH-tier total. Quotes that aren't in an accepted state contribute
 * ZERO so they don't inflate "booked" numbers.
 */
export function quoteContractValue(q: ProjectQuoteRow): Decimal {
  if (!ACCEPTED_STATUSES.has(q.status)) return ZERO;
  const raw = q.acceptedTotal ?? q.fallbackTotal;
  if (!raw) return ZERO;
  return toMoney(new Decimal(raw));
}

/**
 * Sum of contract values across the parent + addendums.
 */
export function projectContractValue(quotes: ProjectQuoteRow[]): Decimal {
  return toMoney(
    quotes.reduce((acc, q) => acc.plus(quoteContractValue(q)), ZERO),
  );
}

/**
 * Sum of payment receipts. Refunds subtract.
 */
export function totalReceived(rows: ProjectPaymentRow[]): Decimal {
  return toMoney(
    rows.reduce((acc, r) => {
      const v = new Decimal(r.amount);
      return r.paymentType === "REFUND" ? acc.minus(v) : acc.plus(v);
    }, ZERO),
  );
}

/**
 * Outstanding = contract value − received. Floors at zero so a small
 * over-payment doesn't show as negative.
 */
export function outstanding(
  contract: Decimal,
  received: Decimal,
): Decimal {
  const diff = contract.minus(received);
  return diff.isNegative() ? ZERO : toMoney(diff);
}
