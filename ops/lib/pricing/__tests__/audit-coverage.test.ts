import { describe, expect, test } from "vitest";
import { Decimal } from "../decimal";
import {
  autoSavingFromLines,
  computeFinancials,
  computeQuoteTotals,
  computeQuoteTotalsForTarget,
} from "../index";
import type { SectionInput } from "../section";

/**
 * Regression suite for the bugs surfaced in the post-deploy audit.
 *
 * Naming the file after the audit (not the feature) so future me can
 * spot why each test exists. Each test maps to a numbered finding in
 * the audit report.
 */

// ── Shared fixtures ──────────────────────────────────────────────
// Two AEE-150 units at DP, ERV at MRP-mode + a non-MRP custom line
// in the same section. Mirrors a realistic mixed quote.
const GOODS_18: SectionInput = {
  lines: [
    { qty: "1", unitPrice: "87703.39", mrp: "103490" }, // ERV @ MRP-mode
    { qty: "2", unitPrice: "8690.00", mrp: "10390" }, // AEE-150 @ DP-mode
    { qty: "1", unitPrice: "1500.00" }, // custom, no MRP
  ],
  discountPercent: "0",
  gstRate: "18",
  isLabourStyle: false,
  appliesDiscount: true,
};
const LABOUR: SectionInput = {
  lines: [{ qty: "1", unitPrice: "25000.00" }],
  discountPercent: "0",
  gstRate: "0",
  isLabourStyle: true,
};

// ── BUG 2 regression: computeFinancials must honour target ──────
describe("BUG 2 — computeFinancials honours discountTargetSaving", () => {
  test("raising target above auto reduces goodsRevenuePostDiscount and grossMargin", () => {
    const sections: SectionInput[] = [
      {
        lines: [
          {
            qty: "1",
            unitPrice: "87703.39",
            costPriceSnapshot: "70162.71",
            mrp: "103490",
          },
        ],
        discountPercent: "0",
        gstRate: "18",
        isLabourStyle: false,
        appliesDiscount: true,
      },
    ];

    // No target → full goods revenue, full 20% margin.
    const fNoTarget = computeFinancials(sections);
    expect(fNoTarget.goodsRevenuePostDiscount.toFixed(2)).toBe("87703.39");
    expect(fNoTarget.grossMargin.toFixed(2)).toBe("17540.68");

    // Auto saving on this section = MRP − total = 103490 − 103490 = 0
    // (line is at MRP-mode, the unit price already equals MRP/1.18).
    // Set target = 5000 → engine applies ~₹4237.29 pre-GST discount.
    const fWithTarget = computeFinancials(sections, new Decimal("5000"));
    // goodsRevenuePostDiscount must drop by the pre-GST adjustment.
    const drop = fNoTarget.goodsRevenuePostDiscount.minus(
      fWithTarget.goodsRevenuePostDiscount,
    );
    // ₹5000 ÷ 1.18 ≈ ₹4237.29
    expect(drop.toFixed(2)).toBe("4237.29");
    // Margin must drop by the same amount (cost is unchanged).
    const marginDrop = fNoTarget.grossMargin.minus(fWithTarget.grossMargin);
    expect(marginDrop.toFixed(2)).toBe("4237.29");
  });

  test("target = null produces same financials as omitting target", () => {
    const fOmitted = computeFinancials([GOODS_18, LABOUR]);
    const fNull = computeFinancials([GOODS_18, LABOUR], null);
    expect(fNull.grossMargin.toFixed(2)).toBe(fOmitted.grossMargin.toFixed(2));
    expect(fNull.totalInvoiceValue.toFixed(2)).toBe(
      fOmitted.totalInvoiceValue.toFixed(2),
    );
  });
});

// ── BUG 3 already covered in target-discount.test.ts ────────────
// (`appliesDiscount=false section is excluded from delta allocation`).
// Adding the complement here: such a section still contributes natural
// DP→MRP saving to autoSavingGoods, so the floor stays correct.
describe("BUG 3 complement — appliesDiscount=false sections still count toward auto saving", () => {
  test("natural DP markdown contributes even when section opts out of blanket discount", () => {
    const optedOutWithMrp: SectionInput = {
      lines: [{ qty: "2", unitPrice: "8690", mrp: "10390" }], // DP < MRP/1.18
      discountPercent: "0",
      gstRate: "18",
      isLabourStyle: false,
      appliesDiscount: false,
    };
    // Natural saving for this line = 2×10390 − 2×8690×1.18 = 20780 − 20508.40 = 271.60
    const natural = autoSavingFromLines([optedOutWithMrp]);
    expect(natural.toFixed(2)).toBe("271.60");

    // Target equal to natural → engine returns auto (delta = 0).
    const targeted = computeQuoteTotalsForTarget([optedOutWithMrp], natural);
    expect(targeted.totalSavingsVsMrp.toFixed(2)).toBe("271.60");
    // Section total unchanged (no allocation possible).
    const auto = computeQuoteTotals([optedOutWithMrp]);
    expect(targeted.sections[0].total.toFixed(2)).toBe(
      auto.sections[0].total.toFixed(2),
    );
  });
});

// ── Mixed GST rates: target allocation must still hit the target ─
describe("mixed GST rates — target allocation across heterogeneous sections", () => {
  test("two goods sections at different GST rates: target met within 5 paise", () => {
    const goods18: SectionInput = {
      lines: [{ qty: "1", unitPrice: "10000" }],
      discountPercent: "0",
      gstRate: "18",
      isLabourStyle: false,
      appliesDiscount: true,
    };
    const goods5: SectionInput = {
      lines: [{ qty: "1", unitPrice: "10000" }],
      discountPercent: "0",
      gstRate: "5",
      isLabourStyle: false,
      appliesDiscount: true,
    };
    const auto = computeQuoteTotals([goods18, goods5]);
    // No MRP anywhere → natural saving is 0.
    expect(auto.totalSavingsVsMrp.toFixed(2)).toBe("0.00");

    const target = new Decimal("2000");
    const t = computeQuoteTotalsForTarget([goods18, goods5], target);
    // Grand total must drop by exactly the target (within rounding).
    const diff = auto.grandTotal.minus(t.grandTotal).minus(target).abs();
    expect(diff.lte(new Decimal("0.05"))).toBe(true);
    // savings = target.
    const savDiff = t.totalSavingsVsMrp.minus(target).abs();
    expect(savDiff.lte(new Decimal("0.05"))).toBe(true);
  });
});

// ── Section with no MRP lines at all ────────────────────────────
describe("sections without any MRP anchor", () => {
  test("autoSaving = 0; target delta lands as effective discount", () => {
    const noMrp: SectionInput = {
      lines: [
        { qty: "10", unitPrice: "1000" },
        { qty: "5", unitPrice: "2000" },
      ],
      discountPercent: "0",
      gstRate: "18",
      isLabourStyle: false,
      appliesDiscount: true,
    };
    expect(autoSavingFromLines([noMrp]).toFixed(2)).toBe("0.00");

    const auto = computeQuoteTotals([noMrp]);
    const target = new Decimal("5000");
    const t = computeQuoteTotalsForTarget([noMrp], target);
    const expectedDrop = target;
    const actualDrop = auto.grandTotal.minus(t.grandTotal);
    expect(actualDrop.minus(expectedDrop).abs().lte(new Decimal("0.05"))).toBe(
      true,
    );
  });
});

// ── All-labour quote: target irrelevant, totals unchanged ───────
describe("all-labour quote", () => {
  test("target ignored, autoSavingFromLines = 0", () => {
    expect(autoSavingFromLines([LABOUR]).toFixed(2)).toBe("0.00");
    const auto = computeQuoteTotals([LABOUR]);
    const t = computeQuoteTotalsForTarget([LABOUR], new Decimal("9999"));
    expect(t.grandTotal.toFixed(2)).toBe(auto.grandTotal.toFixed(2));
    expect(t.totalSavingsVsMrp.toFixed(2)).toBe("0.00");
  });
});

// ── Edge: target = 0 (below autoSaving) clamps up ───────────────
describe("target = 0 with non-zero autoSaving", () => {
  test("engine clamps target up to autoSavingGoods", () => {
    const auto = computeQuoteTotals([GOODS_18]);
    const t = computeQuoteTotalsForTarget([GOODS_18], new Decimal("0"));
    // Result must equal autoTotals (target clamped to auto).
    expect(t.grandTotal.toFixed(2)).toBe(auto.grandTotal.toFixed(2));
    expect(t.totalSavingsVsMrp.toFixed(2)).toBe(
      auto.totalSavingsVsMrp.toFixed(2),
    );
  });
});

// ── Mixed MRP / non-MRP lines in same section ───────────────────
describe("mixed MRP and non-MRP lines in one section", () => {
  test("non-MRP lines absorb their share of the target delta", () => {
    const auto = computeQuoteTotals([GOODS_18]);
    const t = computeQuoteTotalsForTarget(
      [GOODS_18],
      auto.totalSavingsVsMrp.plus(new Decimal("1000")),
    );
    // Section total dropped by ~₹1000 (within rounding).
    const drop = auto.sections[0].total.minus(t.sections[0].total);
    expect(drop.minus(new Decimal("1000")).abs().lte(new Decimal("0.05"))).toBe(
      true,
    );
  });
});

// ── Sum-of-parts identity ───────────────────────────────────────
describe("internal identity: revenuePostDiscount + gst = totalInvoiceValue", () => {
  test("holds for legacy path", () => {
    const f = computeFinancials([
      { ...GOODS_18, discountPercent: "5" },
      LABOUR,
    ]);
    const sum = f.revenuePostDiscount.plus(f.gstAmount);
    expect(sum.toFixed(2)).toBe(f.totalInvoiceValue.toFixed(2));
  });

  test("holds for new-model path with target", () => {
    const target = new Decimal("8000");
    const f = computeFinancials([GOODS_18, LABOUR], target);
    const sum = f.revenuePostDiscount.plus(f.gstAmount);
    expect(sum.toFixed(2)).toBe(f.totalInvoiceValue.toFixed(2));
  });
});

// ── Quote-level identity: pre - discount = post ─────────────────
describe("revenuePreDiscount − discountAmount = revenuePostDiscount", () => {
  test("legacy path", () => {
    const f = computeFinancials([{ ...GOODS_18, discountPercent: "5" }]);
    const diff = f.revenuePreDiscount.minus(f.discountAmount);
    expect(diff.toFixed(2)).toBe(f.revenuePostDiscount.toFixed(2));
  });

  test("new-model path with elevated target", () => {
    const auto = computeQuoteTotals([GOODS_18]);
    const target = auto.totalSavingsVsMrp.plus(new Decimal("2500"));
    const f = computeFinancials([GOODS_18], target);
    const diff = f.revenuePreDiscount.minus(f.discountAmount);
    expect(diff.toFixed(2)).toBe(f.revenuePostDiscount.toFixed(2));
  });
});

// ── Sanity: empty/zero lines don't crash the engine ─────────────
describe("degenerate inputs", () => {
  test("zero-quantity line contributes nothing", () => {
    const section: SectionInput = {
      lines: [
        { qty: "0", unitPrice: "1000", mrp: "1180" },
        { qty: "1", unitPrice: "500" },
      ],
      discountPercent: "0",
      gstRate: "18",
      isLabourStyle: false,
      appliesDiscount: true,
    };
    const auto = computeQuoteTotals([section]);
    // Only the second line should contribute: 500 × 1.18 = 590
    expect(auto.sections[0].subtotal.toFixed(2)).toBe("500.00");
    expect(auto.sections[0].total.toFixed(2)).toBe("590.00");
  });
});
