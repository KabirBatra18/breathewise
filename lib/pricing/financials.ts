import { Decimal, toMoney, ZERO } from "./decimal";
import { computeLineCost } from "./line";
import { computeSectionTotals, type SectionInput } from "./section";

export interface Financials {
  revenuePreDiscount: Decimal;
  discountAmount: Decimal;
  revenuePostDiscount: Decimal;
  gstAmount: Decimal;
  totalInvoiceValue: Decimal;
  costOfGoods: Decimal;
  grossMargin: Decimal;
  grossMarginPercent: Decimal;
}

export function computeFinancials(sections: SectionInput[]): Financials {
  const sectionTotals = sections.map(computeSectionTotals);

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

  const costOfGoods = toMoney(
    sections
      .flatMap((s) => s.lines)
      .reduce((acc, line) => acc.plus(computeLineCost(line)), ZERO),
  );

  const grossMargin = revenuePostDiscount.minus(costOfGoods);
  const grossMarginPercent = revenuePostDiscount.isZero()
    ? ZERO
    : toMoney(grossMargin.div(revenuePostDiscount).mul(100));

  return {
    revenuePreDiscount,
    discountAmount,
    revenuePostDiscount,
    gstAmount,
    totalInvoiceValue,
    costOfGoods,
    grossMargin,
    grossMarginPercent,
  };
}
