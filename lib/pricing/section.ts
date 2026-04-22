import { Decimal, type DecimalInput, toMoney, ZERO } from "./decimal";
import { computeLineAmount, type LineInput } from "./line";

export interface SectionInput {
  lines: LineInput[];
  discountPercent: DecimalInput;
  gstRate: DecimalInput;
  isLabourStyle: boolean;
  appliesDiscount?: boolean;
}

export interface SectionTotals {
  subtotal: Decimal;
  discountAmount: Decimal;
  netAfterDiscount: Decimal;
  gstAmount: Decimal;
  total: Decimal;
  lineAmounts: Decimal[];
}

export function computeSectionTotals(section: SectionInput): SectionTotals {
  const lineAmounts = section.lines.map(computeLineAmount);
  const subtotal = toMoney(
    lineAmounts.reduce((acc, a) => acc.plus(a), ZERO),
  );

  if (section.isLabourStyle) {
    return {
      subtotal,
      discountAmount: ZERO,
      netAfterDiscount: subtotal,
      gstAmount: ZERO,
      total: subtotal,
      lineAmounts,
    };
  }

  const appliesDiscount = section.appliesDiscount ?? true;
  const discountAmount = appliesDiscount
    ? toMoney(
        subtotal.mul(new Decimal(section.discountPercent)).div(100),
      )
    : ZERO;
  const netAfterDiscount = subtotal.minus(discountAmount);
  const gstAmount = toMoney(
    netAfterDiscount.mul(new Decimal(section.gstRate)).div(100),
  );
  const total = netAfterDiscount.plus(gstAmount);

  return { subtotal, discountAmount, netAfterDiscount, gstAmount, total, lineAmounts };
}
