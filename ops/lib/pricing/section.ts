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
  // Engine-internal section maths: sum of qty × unitPrice (ex-GST),
  // then blanket discount, then GST.
  subtotal: Decimal;
  discountAmount: Decimal;
  netAfterDiscount: Decimal;
  gstAmount: Decimal;
  total: Decimal;
  lineAmounts: Decimal[];
  // Client-facing roll-up — what the customer thinks of as the
  // "list price" vs what they actually pay, both GST-inclusive:
  //   mrpSubtotal      = Σ qty × mrp  for SKU lines (sticker price)
  //                    + each non-SKU line's own share of section.total
  //                      (no MRP → no fake saving)
  //   totalDiscountVsMrp = mrpSubtotal − total
  // This rolls the Astberg-DP markdown, the blanket discount, AND the
  // GST recovery from the discount into a single "you save" figure.
  mrpSubtotal: Decimal;
  totalDiscountVsMrp: Decimal;
}

export function computeSectionTotals(section: SectionInput): SectionTotals {
  const lineAmounts = section.lines.map(computeLineAmount);
  const subtotal = toMoney(
    lineAmounts.reduce((acc, a) => acc.plus(a), ZERO),
  );

  if (section.isLabourStyle) {
    // Labour: face value, no list framing.
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
  const discountFactor = appliesDiscount
    ? new Decimal(1).minus(new Decimal(section.discountPercent).div(100))
    : new Decimal(1);
  const gstFactor = new Decimal(1).plus(
    new Decimal(section.gstRate).div(100),
  );

  const discountAmount = appliesDiscount
    ? toMoney(subtotal.mul(new Decimal(section.discountPercent)).div(100))
    : ZERO;
  const netAfterDiscount = subtotal.minus(discountAmount);
  const gstAmount = toMoney(
    netAfterDiscount.mul(new Decimal(section.gstRate)).div(100),
  );
  const total = netAfterDiscount.plus(gstAmount);

  // GST-inclusive list value per line:
  //   - line has mrp:  qty × mrp  (the sticker)
  //   - line has none: its post-discount post-GST share of section.total,
  //                    so the line shows 0 saving (we don't fake markdown
  //                    on custom items / labour lines that snuck into a
  //                    Goods section).
  const mrpInclusivePerLine = section.lines.map((line) => {
    if (line.mrp != null) {
      return toMoney(new Decimal(line.qty).mul(new Decimal(line.mrp)));
    }
    const lineSubtotal = new Decimal(line.qty).mul(new Decimal(line.unitPrice));
    return toMoney(lineSubtotal.mul(discountFactor).mul(gstFactor));
  });
  const mrpSubtotal = toMoney(
    mrpInclusivePerLine.reduce((acc, a) => acc.plus(a), ZERO),
  );
  const totalDiscountVsMrp = toMoney(mrpSubtotal.minus(total));

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
