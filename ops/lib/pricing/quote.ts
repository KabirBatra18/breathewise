import { Decimal, toMoney, ZERO } from "./decimal";
import { computeSectionTotals, type SectionInput, type SectionTotals } from "./section";

const ONE = new Decimal(1);

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

/**
 * New entry point: the user provides a target total discount (₹, vs
 * MRP) and the engine adjusts each goods section's pre-GST discount
 * so the grand-of-savings hits that target. Designed to replace the
 * blanket `discountPercent` field with a single "total discount from
 * MRP" lever that's expressed in rupees and auto-fills from line-mode
 * choices.
 *
 * Behaviour:
 * - target === null  → identical to computeQuoteTotals(sections).
 * - target ≤ autoSaving (the saving the lines naturally produce by
 *   being quoted at DP) → clamped UP to autoSaving. We never under-
 *   cut the natural savings.
 * - target > autoSaving → the extra delta is allocated to goods
 *   sections proportionally to their ex-GST subtotal, then converted
 *   to a pre-GST discount per section (dividing by 1+gstRate) so the
 *   grand total moves exactly by `target − autoSaving`.
 *
 * Invariant (verified by tests for uniform-GST goods sections):
 *   computeQuoteTotalsForTarget(sections, target).totalSavingsVsMrp
 *   ≈ target  (to the paisa, modulo proportional-rounding drift on
 *   mixed-GST quotes).
 */
export function computeQuoteTotalsForTarget(
  sections: SectionInput[],
  target: Decimal | null,
): QuoteTotals {
  // Always start from the auto path so we have section subtotals and
  // mrpSubtotals to work with. Sections' incoming discountPercent is
  // expected to be 0 in the new model — the section's own discount
  // setting compounds with the target adjustment if non-zero.
  const autoTotals = computeQuoteTotals(sections);

  if (target == null) return autoTotals;

  // Auto saving across goods only — labour contributes 0 by design.
  // Sections marked appliesDiscount=false still count: they can have
  // a natural DP→MRP markdown from their lines that the client sees
  // as "saving" even though the section opts out of *blanket* discount.
  const autoSavingGoods = autoTotals.sections.reduce((acc, s, i) => {
    if (sections[i].isLabourStyle) return acc;
    return acc.plus(s.totalDiscountVsMrp);
  }, ZERO);

  // Effective target: never less than autoSaving (no markups).
  const effectiveTarget = target.lt(autoSavingGoods) ? autoSavingGoods : target;
  const delta = effectiveTarget.minus(autoSavingGoods);
  if (delta.isZero()) return autoTotals;

  // Delta is allocated ONLY across sections that opt into discounts.
  // Labour + appliesDiscount=false sections are excluded so the user's
  // "no discount on this section" choice is respected — matches the
  // legacy blanket-% behaviour (which also skipped those sections).
  const allocableSubtotalSum = autoTotals.sections.reduce((acc, s, i) => {
    if (sections[i].isLabourStyle) return acc;
    if (sections[i].appliesDiscount === false) return acc;
    return acc.plus(s.subtotal);
  }, ZERO);

  if (allocableSubtotalSum.isZero()) {
    // Nothing to allocate against → target is meaningless. Return auto.
    return autoTotals;
  }

  // Re-build section totals with the per-section additional pre-GST
  // discount applied. We mutate by recomputing net / gst / total so
  // the engine's rounding behaviour stays consistent with the rest.
  const newSectionTotals: SectionTotals[] = autoTotals.sections.map(
    (s, idx) => {
      const input = sections[idx];
      if (input.isLabourStyle) return s;
      if (input.appliesDiscount === false) return s;
      // delta share on grand total (GST-incl) proportional to subtotal.
      const deltaShare = delta.mul(s.subtotal).div(allocableSubtotalSum);
      const gstFactor = ONE.plus(new Decimal(input.gstRate).div(100));
      // Pre-GST equivalent: this is the amount we add to discountAmount.
      const preGstAdjustment = toMoney(deltaShare.div(gstFactor));
      const newDiscount = toMoney(s.discountAmount.plus(preGstAdjustment));
      const newNet = s.subtotal.minus(newDiscount);
      const newGst = toMoney(newNet.mul(new Decimal(input.gstRate)).div(100));
      const newTotal = newNet.plus(newGst);
      return {
        ...s,
        discountAmount: newDiscount,
        netAfterDiscount: newNet,
        gstAmount: newGst,
        total: newTotal,
        // mrpSubtotal unchanged; savings re-derive.
        totalDiscountVsMrp: toMoney(s.mrpSubtotal.minus(newTotal)),
      };
    },
  );

  const grandTotal = toMoney(
    newSectionTotals.reduce((acc, s) => acc.plus(s.total), ZERO),
  );
  const totalSubtotal = toMoney(
    newSectionTotals.reduce((acc, s) => acc.plus(s.subtotal), ZERO),
  );
  const totalDiscount = toMoney(
    newSectionTotals.reduce((acc, s) => acc.plus(s.discountAmount), ZERO),
  );
  const totalGst = toMoney(
    newSectionTotals.reduce((acc, s) => acc.plus(s.gstAmount), ZERO),
  );
  const totalMrpSubtotal = toMoney(
    newSectionTotals.reduce((acc, s) => acc.plus(s.mrpSubtotal), ZERO),
  );
  const totalSavingsVsMrp = toMoney(
    newSectionTotals.reduce((acc, s) => acc.plus(s.totalDiscountVsMrp), ZERO),
  );

  return {
    sections: newSectionTotals,
    grandTotal,
    totalDiscount,
    totalGst,
    totalSubtotal,
    totalMrpSubtotal,
    totalSavingsVsMrp,
  };
}

/** Convenience: what would the auto-saving be (no override applied)? */
export function autoSavingFromLines(sections: SectionInput[]): Decimal {
  return computeQuoteTotals(sections).totalSavingsVsMrp;
}
