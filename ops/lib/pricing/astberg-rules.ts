/**
 * Astberg-specific pricing rules.
 *
 * Sourcing model:
 * - Astberg gives us 20% discount on the ex-GST list price for every item.
 * - For non-ERV items, the ex-GST list price is "DP Basic" (col 2 of the price list).
 *   - Cash invoice from Astberg = (DP Basic * 0.80) + 18% GST.
 *   - Our cost (post-ITC) = DP Basic * 0.80.
 * - For ERV / HRV "bigger machines", the only printed price is MRP (GST-inclusive).
 *   - Cash invoice from Astberg = (MRP / 1.18 * 0.80) + 18% GST.
 *   - Our cost (post-ITC) = MRP / 1.18 * 0.80 = MRP * 0.80 / 1.18.
 *
 * Resale model — two scenarios, override allowed in either:
 *
 *   ASTBERG_LED  — Astberg sourced the client and quoted them
 *     - Non-ERV → sell at DP as the ex-GST rate (so client total = DP * 1.18, sub-MRP).
 *     - ERV     → sell at MRP / 1.18 as the ex-GST rate (so client total = MRP).
 *
 *   SELF_SOURCED — we sourced the client ourselves
 *     - Non-ERV → sell at MRP / 1.18 as the ex-GST rate (max revenue, lands at MRP).
 *     - ERV     → sell at MRP / 1.18 as the ex-GST rate (lands at MRP, same as above).
 *     - Note: client invoice may NOT add GST on top of MRP — that's illegal.
 *
 * Defaults below mirror what's stored as `products.defaultUnitPrice`:
 * we use the conservative ASTBERG_LED default so quote builders never
 * accidentally exceed Astberg's commitments. Self-sourced quotes can
 * override per line up to MRP / 1.18.
 */

import { Decimal, toMoney } from "./decimal";

const GST_RATE_PCT = new Decimal(18);
const GST_DIVISOR = new Decimal("1.18"); // = 1 + 18/100, string form for exact precision
const SUPPLIER_DISCOUNT = new Decimal("0.80"); // we get 20% off ex-GST

export type SourcingMode = "ASTBERG_LED" | "SELF_SOURCED";

export interface AstbergPricedSKU {
  sku: string;
  name: string;
  isERV: boolean;
  mrp: Decimal | null;
  dpBasic: Decimal | null; // null for ERV (only MRP printed)
  dp: Decimal | null;       // null for ERV (only MRP printed)
}

/**
 * Cost we record on the product (ex-GST, post-ITC).
 *
 *   Non-ERV: (dp / 1.18) * 0.80
 *   ERV    : (mrp / 1.18) * 0.80
 *
 * NOTE: We deliberately derive the ex-GST base from `dp` (or `mrp` for ERV)
 * rather than the printed `dp_basic`. The price list rounds `dp_basic` to
 * an integer for inline fans (e.g. AEE-150 prints 7364, but Astberg's actual
 * invoice line-rate-ex-GST is 8690/1.18 = 7364.41). Astberg's invoices
 * always reconstruct ex-GST as DP/1.18; matching that gives 0.00 drift.
 */
export function computeCostPrice(sku: AstbergPricedSKU): Decimal | null {
  if (sku.isERV) {
    if (!sku.mrp) return null;
    return toMoney(sku.mrp.div(GST_DIVISOR).mul(SUPPLIER_DISCOUNT));
  }
  if (!sku.dp) return null;
  return toMoney(sku.dp.div(GST_DIVISOR).mul(SUPPLIER_DISCOUNT));
}

/**
 * Default ex-GST sell rate for the product record.
 *
 * Conservative default = the ASTBERG_LED rate. Self-sourced quotes
 * can override per line up to `mrpExGst(sku)`.
 *
 *   Non-ERV: dp        (lands at dp * 1.18 < MRP after GST is added)
 *   ERV    : mrp / 1.18 (lands at MRP after GST is added)
 */
export function computeDefaultUnitPrice(sku: AstbergPricedSKU): Decimal | null {
  if (sku.isERV) {
    if (!sku.mrp) return null;
    return toMoney(sku.mrp.div(GST_DIVISOR));
  }
  if (!sku.dp) return null;
  return toMoney(sku.dp);
}

/**
 * Maximum legal ex-GST sell rate for any line (MRP / 1.18).
 * Used to validate per-line overrides in the quote builder.
 */
export function mrpExGst(sku: AstbergPricedSKU): Decimal | null {
  if (!sku.mrp) return null;
  return toMoney(sku.mrp.div(GST_DIVISOR));
}

/**
 * Suggested ex-GST sell rate for a given sourcing mode.
 * Quote builder calls this when adding an SKU to a section; the user
 * can still override per line afterwards.
 */
export function suggestedSellRate(
  sku: AstbergPricedSKU,
  mode: SourcingMode,
): Decimal | null {
  if (sku.isERV) {
    return mrpExGst(sku); // ERV always at MRP / 1.18 regardless of mode
  }
  if (mode === "ASTBERG_LED") {
    return sku.dp ? toMoney(sku.dp) : null;
  }
  // SELF_SOURCED: max revenue at MRP / 1.18
  return mrpExGst(sku);
}

/**
 * Validate a quote line's ex-GST unit price doesn't breach the MRP ceiling.
 * Returns null if valid; returns a Decimal indicating the breach amount otherwise.
 */
export function validateUnitPriceUnderMrp(
  unitPrice: Decimal,
  sku: AstbergPricedSKU,
): { ok: true } | { ok: false; ceiling: Decimal; breachBy: Decimal } {
  const ceiling = mrpExGst(sku);
  if (!ceiling) return { ok: true }; // no MRP → no constraint
  // tiny rounding tolerance
  const tolerance = new Decimal("0.01");
  if (unitPrice.gt(ceiling.plus(tolerance))) {
    return { ok: false, ceiling, breachBy: unitPrice.minus(ceiling) };
  }
  return { ok: true };
}

export const ASTBERG_CONSTANTS = {
  gstRatePercent: GST_RATE_PCT,
  supplierDiscountPercent: new Decimal(20),
  supplier: "Astberg Ventilation Pvt Ltd",
} as const;
