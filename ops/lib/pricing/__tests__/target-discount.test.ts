import { describe, expect, test } from "vitest";
import { Decimal } from "../decimal";
import { computeQuoteTotals, computeQuoteTotalsForTarget } from "../quote";
import type { SectionInput } from "../section";

/**
 * The new "target saving" entry point must reproduce the legacy blanket
 * % path bit-identically when target = legacy.totalSavingsVsMrp AND
 * goods sections share a single GST rate (the common case). These
 * tests guarantee that migrating an existing quote from legacy
 * discountPercent → new discount_target_saving does not change a
 * single paise on the PDF.
 */

// BW-2026-0001 reference (line items + 5% blanket, all goods @ 18%).
const BW_GOODS_A: SectionInput = {
  lines: [
    { qty: "1", unitPrice: "87703.39", mrp: "103490" },
    { qty: "10", unitPrice: "410.00", mrp: "490" },
    { qty: "2", unitPrice: "880.00", mrp: "1090" },
    { qty: "2", unitPrice: "449.15", mrp: "530" },
    { qty: "4", unitPrice: "584.75", mrp: "690" },
  ],
  discountPercent: "5.00",
  gstRate: "18.00",
  isLabourStyle: false,
  appliesDiscount: true,
};

const BW_GOODS_B: SectionInput = {
  lines: [
    { qty: "1", unitPrice: "8805.08", mrp: "10390" },
    { qty: "1", unitPrice: "7990.00", mrp: "9790" },
    { qty: "4", unitPrice: "410.00", mrp: "490" },
    { qty: "2", unitPrice: "880.00", mrp: "1090" },
    { qty: "1", unitPrice: "449.15", mrp: "530" },
    { qty: "2", unitPrice: "576.27", mrp: "680" },
  ],
  discountPercent: "5.00",
  gstRate: "18.00",
  isLabourStyle: false,
  appliesDiscount: true,
};

const BW_LABOUR: SectionInput = {
  lines: [{ qty: "1", unitPrice: "39000.00" }],
  discountPercent: "0",
  gstRate: "0",
  isLabourStyle: true,
};

// Zero-blanket variants (what the new model receives — discountPercent 0
// at the section level, target applied via the new entry point).
const ZERO_A: SectionInput = { ...BW_GOODS_A, discountPercent: "0" };
const ZERO_B: SectionInput = { ...BW_GOODS_B, discountPercent: "0" };

describe("computeQuoteTotalsForTarget — migration equivalence", () => {
  test("target = null → identical to computeQuoteTotals", () => {
    const auto = computeQuoteTotals([ZERO_A, ZERO_B, BW_LABOUR]);
    const targeted = computeQuoteTotalsForTarget(
      [ZERO_A, ZERO_B, BW_LABOUR],
      null,
    );
    expect(targeted.grandTotal.toFixed(2)).toBe(auto.grandTotal.toFixed(2));
    expect(targeted.totalSavingsVsMrp.toFixed(2)).toBe(
      auto.totalSavingsVsMrp.toFixed(2),
    );
  });

  test("target = legacy's saving → grand total matches legacy to the paisa (all goods 18%)", () => {
    // Legacy reference: 5% blanket on goods sections, labour untouched.
    const legacy = computeQuoteTotals([BW_GOODS_A, BW_GOODS_B, BW_LABOUR]);
    const target = legacy.totalSavingsVsMrp;

    // New path: zero blanket at section level, target applied.
    const targeted = computeQuoteTotalsForTarget(
      [ZERO_A, ZERO_B, BW_LABOUR],
      target,
    );

    expect(targeted.grandTotal.toFixed(2)).toBe(legacy.grandTotal.toFixed(2));
    // Each goods section's total must match too (the PDF reads these).
    expect(targeted.sections[0].total.toFixed(2)).toBe(
      legacy.sections[0].total.toFixed(2),
    );
    expect(targeted.sections[1].total.toFixed(2)).toBe(
      legacy.sections[1].total.toFixed(2),
    );
    // Labour untouched.
    expect(targeted.sections[2].total.toFixed(2)).toBe(
      legacy.sections[2].total.toFixed(2),
    );
    // GST recomputed correctly on the new net.
    expect(targeted.sections[0].gstAmount.toFixed(2)).toBe(
      legacy.sections[0].gstAmount.toFixed(2),
    );
    expect(targeted.sections[1].gstAmount.toFixed(2)).toBe(
      legacy.sections[1].gstAmount.toFixed(2),
    );
  });

  test("target = exact autoSaving → no delta, identical to auto path", () => {
    const auto = computeQuoteTotals([ZERO_A, ZERO_B, BW_LABOUR]);
    const targeted = computeQuoteTotalsForTarget(
      [ZERO_A, ZERO_B, BW_LABOUR],
      auto.totalSavingsVsMrp,
    );
    expect(targeted.grandTotal.toFixed(2)).toBe(auto.grandTotal.toFixed(2));
  });

  test("target below autoSaving → clamped up (no markup ever)", () => {
    const auto = computeQuoteTotals([ZERO_A, ZERO_B, BW_LABOUR]);
    const below = auto.totalSavingsVsMrp.minus(new Decimal("5000"));
    const targeted = computeQuoteTotalsForTarget(
      [ZERO_A, ZERO_B, BW_LABOUR],
      below,
    );
    expect(targeted.grandTotal.toFixed(2)).toBe(auto.grandTotal.toFixed(2));
    expect(targeted.totalSavingsVsMrp.toFixed(2)).toBe(
      auto.totalSavingsVsMrp.toFixed(2),
    );
  });

  test("target above autoSaving → grand total drops by exactly delta", () => {
    const auto = computeQuoteTotals([ZERO_A, ZERO_B, BW_LABOUR]);
    const delta = new Decimal("2000.00");
    const target = auto.totalSavingsVsMrp.plus(delta);
    const targeted = computeQuoteTotalsForTarget(
      [ZERO_A, ZERO_B, BW_LABOUR],
      target,
    );
    const expectedGrand = auto.grandTotal.minus(delta);
    // Allow up to ₹0.02 drift from proportional rounding.
    const diff = targeted.grandTotal.minus(expectedGrand).abs();
    expect(diff.lte(new Decimal("0.02"))).toBe(true);
  });

  test("all-labour quote → target ignored (nothing to discount against)", () => {
    const auto = computeQuoteTotals([BW_LABOUR]);
    const targeted = computeQuoteTotalsForTarget(
      [BW_LABOUR],
      new Decimal("10000"),
    );
    expect(targeted.grandTotal.toFixed(2)).toBe(auto.grandTotal.toFixed(2));
  });
});
