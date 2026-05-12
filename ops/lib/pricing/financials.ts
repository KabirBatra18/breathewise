import { Decimal, toMoney, ZERO } from "./decimal";
import { computeLineCost } from "./line";
import { computeSectionTotals, type SectionInput } from "./section";
import { computeQuoteTotalsForTarget } from "./quote";

export interface Financials {
  // Whole-quote totals (kept for the saved snapshot row in
  // quote_tier_financials, where they represent the full invoice
  // BW issues to the client).
  revenuePreDiscount: Decimal;
  discountAmount: Decimal;
  revenuePostDiscount: Decimal;
  gstAmount: Decimal;
  totalInvoiceValue: Decimal;
  // Margin numbers are GOODS ONLY by design: labour sections have
  // no Astberg product cost (we don't model BW's installation
  // payroll), so summing them in would inflate margin %. We expose
  // labourTotal separately so the UI can show it alongside without
  // letting it leak into grossMargin.
  costOfGoods: Decimal;
  grossMargin: Decimal;
  grossMarginPercent: Decimal;
  goodsRevenuePostDiscount: Decimal;
  labourTotal: Decimal;
}

/**
 * Compute the financials snapshot.
 *
 * When `discountTargetSaving` is provided (new model), the section
 * totals are taken from `computeQuoteTotalsForTarget` so the saved
 * snapshot reflects the post-target reality. When null, falls back to
 * legacy per-section discountPercent.
 */
export function computeFinancials(
  sections: SectionInput[],
  discountTargetSaving?: Decimal | null,
): Financials {
  const sectionTotals =
    discountTargetSaving != null
      ? computeQuoteTotalsForTarget(sections, discountTargetSaving).sections
      : sections.map(computeSectionTotals);

  const revenuePreDiscount = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.subtotal), ZERO),
  );
  const discountAmount = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.discountAmount), ZERO),
  );
  const revenuePostDiscount = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.netAfterDiscount), ZERO),
  );
  const gstAmount = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.gstAmount), ZERO),
  );
  const totalInvoiceValue = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.total), ZERO),
  );

  // Goods-only revenue (ex-GST, post-discount). This is what we
  // compare to costOfGoods. Labour is excluded.
  const goodsRevenuePostDiscount = toMoney(
    sections.reduce(
      (acc, s, i) =>
        s.isLabourStyle ? acc : acc.plus(sectionTotals[i].netAfterDiscount),
      ZERO,
    ),
  );

  // Cost is also goods-only — labour lines never have a costPriceSnapshot
  // anyway, but be explicit so the intent is clear and stays right if a
  // labour section accidentally has a productId attached.
  const costOfGoods = toMoney(
    sections
      .filter((s) => !s.isLabourStyle)
      .flatMap((s) => s.lines)
      .reduce((acc, line) => acc.plus(computeLineCost(line)), ZERO),
  );

  const labourTotal = toMoney(
    sections.reduce(
      (acc, s, i) =>
        s.isLabourStyle ? acc.plus(sectionTotals[i].total) : acc,
      ZERO,
    ),
  );

  const grossMargin = goodsRevenuePostDiscount.minus(costOfGoods);
  const grossMarginPercent = goodsRevenuePostDiscount.isZero()
    ? ZERO
    : toMoney(grossMargin.div(goodsRevenuePostDiscount).mul(100));

  return {
    revenuePreDiscount,
    discountAmount,
    revenuePostDiscount,
    gstAmount,
    totalInvoiceValue,
    costOfGoods,
    grossMargin,
    grossMarginPercent,
    goodsRevenuePostDiscount,
    labourTotal,
  };
}
