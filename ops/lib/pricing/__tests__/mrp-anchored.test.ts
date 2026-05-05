import { describe, expect, test } from "vitest";
import { computeSectionTotals } from "../section";
import { computeQuoteTotals } from "../quote";

// Verifies the client-facing roll-up: mrpSubtotal anchors to MRP/1.18,
// totalDiscountVsMrp combines the implicit Astberg-DP markdown with
// the blanket extra discount we layer on top.
describe("mrp-anchored totals", () => {
  test("DP-mode line plus blanket discount: discount vs MRP combines both", () => {
    // AEE-150: MRP 10390 (GST-incl), DP 8690 (ex-GST). Quote at DP, 5% blanket.
    // mrp ex-GST per unit         = 10390 / 1.18 = 8805.08...
    // implicit discount per unit  = 8805.08 - 8690 = 115.08
    // blanket discount per unit   = 8690 * 5%      = 434.50
    // total discount per unit     = 115.08 + 434.50 = 549.58
    // For qty 2:
    //   mrpSubtotal       = 17610.17 (rounded to 2dp)
    //   subtotal          = 17380.00
    //   blanket discount  = 869.00
    //   net               = 16511.00
    //   total saving      = 17610.17 - 16511.00 = 1099.17
    const t = computeSectionTotals({
      lines: [{ qty: "2", unitPrice: "8690", mrp: "10390" }],
      discountPercent: "5.00",
      gstRate: "18.00",
      isLabourStyle: false,
      appliesDiscount: true,
    });
    expect(t.subtotal.toFixed(2)).toBe("17380.00");
    expect(t.discountAmount.toFixed(2)).toBe("869.00");
    expect(t.netAfterDiscount.toFixed(2)).toBe("16511.00");
    expect(t.mrpSubtotal.toFixed(2)).toBe("17610.17");
    expect(t.totalDiscountVsMrp.toFixed(2)).toBe("1099.17");
  });

  test("MRP-mode line: no implicit markdown, only blanket discount counts", () => {
    // ERV at MRP/1.18 = 8805.08, qty 1, 5% blanket.
    // implicit discount = 0 (line rate already at list ex-GST)
    // blanket           = 8805.08 * 5% = 440.25
    // total saving      = 440.25
    const t = computeSectionTotals({
      lines: [{ qty: "1", unitPrice: "8805.08", mrp: "10390" }],
      discountPercent: "5.00",
      gstRate: "18.00",
      isLabourStyle: false,
      appliesDiscount: true,
    });
    // mrp ex-GST = 10390 / 1.18 = 8805.0847.. → 8805.08 to money
    expect(t.mrpSubtotal.toFixed(2)).toBe("8805.08");
    expect(t.subtotal.toFixed(2)).toBe("8805.08");
    expect(t.totalDiscountVsMrp.toFixed(2)).toBe("440.25");
  });

  test("line without MRP: mrpSubtotal equals subtotal, no implicit discount", () => {
    // Custom item with no MRP — falls back to its own subtotal so the
    // section's list total isn't distorted.
    const t = computeSectionTotals({
      lines: [{ qty: "1", unitPrice: "5000" }],
      discountPercent: "0",
      gstRate: "18.00",
      isLabourStyle: false,
      appliesDiscount: true,
    });
    expect(t.mrpSubtotal.toFixed(2)).toBe("5000.00");
    expect(t.totalDiscountVsMrp.toFixed(2)).toBe("0.00");
  });

  test("labour section: no list framing, totalDiscountVsMrp is zero", () => {
    const t = computeSectionTotals({
      lines: [{ qty: "1", unitPrice: "20000" }],
      discountPercent: "5.00",
      gstRate: "18.00",
      isLabourStyle: true,
      appliesDiscount: false,
    });
    expect(t.subtotal.toFixed(2)).toBe("20000.00");
    expect(t.mrpSubtotal.toFixed(2)).toBe("20000.00");
    expect(t.totalDiscountVsMrp.toFixed(2)).toBe("0.00");
  });

  test("quote-level roll-up sums section MRP figures", () => {
    const totals = computeQuoteTotals([
      {
        lines: [{ qty: "2", unitPrice: "8690", mrp: "10390" }],
        discountPercent: "5.00",
        gstRate: "18.00",
        isLabourStyle: false,
        appliesDiscount: true,
      },
      {
        lines: [{ qty: "1", unitPrice: "8805.08", mrp: "10390" }],
        discountPercent: "5.00",
        gstRate: "18.00",
        isLabourStyle: false,
        appliesDiscount: true,
      },
    ]);
    // Sum from the section-level expectations above.
    expect(totals.totalMrpSubtotal.toFixed(2)).toBe("26415.25");
    expect(totals.totalSavingsVsMrp.toFixed(2)).toBe("1539.42");
  });
});
