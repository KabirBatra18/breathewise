import { Decimal, toMoney, ZERO } from "./decimal";
import { computeSectionTotals, type SectionInput } from "./section";

export interface QuoteTotals {
  sections: ReturnType<typeof computeSectionTotals>[];
  grandTotal: Decimal;
  totalDiscount: Decimal;
  totalGst: Decimal;
  totalSubtotal: Decimal;
  // Whole-quote MRP / saving (kept for compatibility — still summed
  // including labour where labour contributes its own face value).
  totalMrpSubtotal: Decimal;
  totalSavingsVsMrp: Decimal;
  // Goods-only roll-up (excludes labour-style sections). Use these
  // when computing the headline "you save X% off MRP" figure so
  // labour doesn't dilute the percentage.
  goodsMrpSubtotal: Decimal;
  goodsTotal: Decimal;
  goodsSavingsVsMrp: Decimal;
  // Labour-only total (sum of labour-section subtotals). Surfaced so
  // the UI / PDF can show installation as a separate trailing block.
  labourTotal: Decimal;
}

export function computeQuoteTotals(sections: SectionInput[]): QuoteTotals {
  const sectionTotals = sections.map(computeSectionTotals);
  const grandTotal = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.total), ZERO),
  );
  const totalSubtotal = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.subtotal), ZERO),
  );
  const totalDiscount = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.discountAmount), ZERO),
  );
  const totalGst = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.gstAmount), ZERO),
  );
  const totalMrpSubtotal = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.mrpSubtotal), ZERO),
  );
  const totalSavingsVsMrp = toMoney(
    sectionTotals.reduce((acc, s) => acc.plus(s.totalDiscountVsMrp), ZERO),
  );
  const goodsTotals = sectionTotals.filter((s) => !s.isLabourStyle);
  const labourTotals = sectionTotals.filter((s) => s.isLabourStyle);
  const goodsMrpSubtotal = toMoney(
    goodsTotals.reduce((acc, s) => acc.plus(s.mrpSubtotal), ZERO),
  );
  const goodsTotal = toMoney(
    goodsTotals.reduce((acc, s) => acc.plus(s.total), ZERO),
  );
  const goodsSavingsVsMrp = toMoney(
    goodsTotals.reduce((acc, s) => acc.plus(s.totalDiscountVsMrp), ZERO),
  );
  const labourTotal = toMoney(
    labourTotals.reduce((acc, s) => acc.plus(s.total), ZERO),
  );
  return {
    sections: sectionTotals,
    grandTotal,
    totalDiscount,
    totalGst,
    totalSubtotal,
    totalMrpSubtotal,
    totalSavingsVsMrp,
    goodsMrpSubtotal,
    goodsTotal,
    goodsSavingsVsMrp,
    labourTotal,
  };
}

export function computeGrandTotal(sections: SectionInput[]): Decimal {
  return computeQuoteTotals(sections).grandTotal;
}
