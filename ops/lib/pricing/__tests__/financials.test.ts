import { describe, expect, test } from "vitest";
import { computeFinancials } from "../financials";

// Pin the goods-only margin behaviour against Astberg's actual PI
// PI/26-27/196 (22-Apr-26): every per-line cost in our seed matches
// the PI to the paisa for the SKUs that are in the catalog.
//
// All margin numbers below are EX-GST. IGST paid to Astberg is
// reclaimable (ITC), and IGST charged to client is collected and
// remitted; both flows zero out at margin.
describe("computeFinancials — goods-only margin", () => {
  test("ERV at MRP-mode lands at exactly 20% margin (the supplier discount)", () => {
    // AHE-50THP: MRP 103490, qty 1.
    // Quote at MRP/1.18 = 87703.39 ex-GST.
    // Cost ex-GST = 103490 / 1.18 × 0.80 = 70162.71  (matches PI line 1).
    // Margin = 87703.39 − 70162.71 = 17540.68  (= 20% of 87703.39).
    const f = computeFinancials([
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
      },
    ]);
    expect(f.goodsRevenuePostDiscount.toFixed(2)).toBe("87703.39");
    expect(f.costOfGoods.toFixed(2)).toBe("70162.71");
    expect(f.grossMargin.toFixed(2)).toBe("17540.68");
    expect(f.grossMarginPercent.toFixed(2)).toBe("20.00");
    expect(f.labourTotal.toFixed(2)).toBe("0.00");
  });

  test("non-ERV at DP-mode lands at ~32.2% margin", () => {
    // AEE-150: DP 8690, qty 1.
    // Quote at DP = 8690 ex-GST.
    // Cost ex-GST = 8690 / 1.18 × 0.80 = 5891.53  (matches PI line 5).
    // Margin = 8690 − 5891.53 = 2798.47  (≈ 32.2% of 8690).
    const f = computeFinancials([
      {
        lines: [
          {
            qty: "1",
            unitPrice: "8690",
            costPriceSnapshot: "5891.53",
            mrp: "10390",
          },
        ],
        discountPercent: "0",
        gstRate: "18",
        isLabourStyle: false,
      },
    ]);
    expect(f.grossMargin.toFixed(2)).toBe("2798.47");
    expect(f.grossMarginPercent.toFixed(2)).toBe("32.20");
  });

  test("labour section does NOT inflate margin", () => {
    // 1× ERV at MRP-mode (20% margin) + ₹50,000 labour.
    // If labour were included as zero-cost revenue, headline margin
    // would jump to (17540.68 + 50000) / (87703.39 + 50000) ≈ 49%.
    // We exclude labour so it stays at the true 20%.
    const f = computeFinancials([
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
      },
      {
        lines: [{ qty: "1", unitPrice: "50000" }],
        discountPercent: "0",
        gstRate: "0",
        isLabourStyle: true,
      },
    ]);
    expect(f.goodsRevenuePostDiscount.toFixed(2)).toBe("87703.39");
    expect(f.costOfGoods.toFixed(2)).toBe("70162.71");
    expect(f.grossMargin.toFixed(2)).toBe("17540.68");
    expect(f.grossMarginPercent.toFixed(2)).toBe("20.00");
    expect(f.labourTotal.toFixed(2)).toBe("50000.00");
    // Whole-quote totals still include labour (used for the saved
    // financials snapshot / client invoice value).
    expect(f.totalInvoiceValue.toFixed(2)).toBe("153490.00");
  });

  test("blanket 5% discount eats into margin", () => {
    // Same ERV, but with 5% blanket on goods.
    // Net revenue = 87703.39 × 0.95 = 83318.22
    // Cost stays at 70162.71
    // Margin = 13155.51 → 15.79%
    const f = computeFinancials([
      {
        lines: [
          {
            qty: "1",
            unitPrice: "87703.39",
            costPriceSnapshot: "70162.71",
            mrp: "103490",
          },
        ],
        discountPercent: "5",
        gstRate: "18",
        isLabourStyle: false,
      },
    ]);
    expect(f.goodsRevenuePostDiscount.toFixed(2)).toBe("83318.22");
    expect(f.grossMargin.toFixed(2)).toBe("13155.51");
    expect(f.grossMarginPercent.toFixed(2)).toBe("15.79");
  });
});
