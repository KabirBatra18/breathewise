import { Decimal, toMoney, ZERO } from "./decimal";
import { computeSectionTotals, type SectionInput } from "./section";

export interface QuoteTotals {
  sections: ReturnType<typeof computeSectionTotals>[];
  grandTotal: Decimal;
  totalDiscount: Decimal;
  totalGst: Decimal;
  totalSubtotal: Decimal;
  // Client-facing roll-up across all sections.
  totalMrpSubtotal: Decimal;
  totalSavingsVsMrp: Decimal;
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
  return {
    sections: sectionTotals,
    grandTotal,
    totalDiscount,
    totalGst,
    totalSubtotal,
    totalMrpSubtotal,
    totalSavingsVsMrp,
  };
}

export function computeGrandTotal(sections: SectionInput[]): Decimal {
  return computeQuoteTotals(sections).grandTotal;
}
