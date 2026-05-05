import { Decimal, type DecimalInput, toMoney, ZERO } from "./decimal";
import {
  computeLineAmount,
  computeLineMrpAmount,
  type LineInput,
} from "./line";

export interface SectionInput {
  lines: LineInput[];
  discountPercent: DecimalInput;
  gstRate: DecimalInput;
  isLabourStyle: boolean;
  appliesDiscount?: boolean;
}

export interface SectionTotals {
  // Section maths (engine-internal): sum of qty × unitPrice, then
  // blanket discount, then GST.
  subtotal: Decimal;
  discountAmount: Decimal;
  netAfterDiscount: Decimal;
  gstAmount: Decimal;
  total: Decimal;
  lineAmounts: Decimal[];
  // Client-facing roll-up: anchors the totals to MRP so the customer
  // sees the *combined* saving (implicit Astberg DP markdown + the
  // blanket discount we layer on top). For labour / lines without
  // MRP, mrpSubtotal equals subtotal so they don't distort it.
  mrpSubtotal: Decimal;
  totalDiscountVsMrp: Decimal;
}

export function computeSectionTotals(section: SectionInput): SectionTotals {
  const lineAmounts = section.lines.map(computeLineAmount);
  const subtotal = toMoney(
    lineAmounts.reduce((acc, a) => acc.plus(a), ZERO),
  );
  const mrpAmounts = section.lines.map(computeLineMrpAmount);
  const mrpSubtotal = toMoney(
    mrpAmounts.reduce((acc, a) => acc.plus(a), ZERO),
  );

  if (section.isLabourStyle) {
    return {
      subtotal,
      discountAmount: ZERO,
      netAfterDiscount: subtotal,
      gstAmount: ZERO,
      total: subtotal,
      lineAmounts,
      mrpSubtotal: subtotal,
      totalDiscountVsMrp: ZERO,
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
  const totalDiscountVsMrp = toMoney(mrpSubtotal.minus(netAfterDiscount));

  return {
    subtotal,
    discountAmount,
    netAfterDiscount,
    gstAmount,
    total,
    lineAmounts,
    mrpSubtotal,
    totalDiscountVsMrp,
  };
}
