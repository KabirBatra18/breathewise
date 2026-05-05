import { describe, expect, test } from "vitest";
import { computeSectionTotals } from "../section";
import { computeQuoteTotals } from "../quote";

// Verifies the client-facing roll-up:
//   mrpSubtotal       = Σ qty × mrp  for SKU lines (GST-inclusive)
//                     + each non-SKU line's own share of section.total
//   totalDiscountVsMrp = mrpSubtotal − total
// Rolls the implicit Astberg-DP markdown, the blanket discount, AND the
// GST recovered from the discount into a single "you save" figure that
// matches what a customer would mentally compare against retail.
describe("mrp-anchored totals (GST-inclusive)", () => {
  test("DP-mode line + 5% blanket: saving = MRP × qty − final total (incl GST)", () => {
    // AEE-150: MRP 10390 (GST-incl), DP 8690 (ex-GST). Quote at DP.
    // qty 2:
    //   subtotal_ex_gst   = 2 × 8690 = 17380.00
    //   blanket discount  = 17380 × 5% = 869.00
    //   net               = 16511.00
    //   GST 18%           = 16511 × 0.18 = 2971.98
    //   total (incl GST)  = 19482.98
    //   mrpSubtotal       = 2 × 10390 = 20780.00
    //   totalDiscountVsMrp = 20780.00 − 19482.98 = 1297.02
    const t = computeSectionTotals({
      lines: [{ qty: "2", unitPrice: "8690", mrp: "10390" }],
      discountPercent: "5.00",
      gstRate: "18.00",
      isLabourStyle: false,
      appliesDiscount: true,
    });
    expect(t.subtotal.toFixed(2)).toBe("17380.00");
    expect(t.netAfterDiscount.toFixed(2)).toBe("16511.00");
    expect(t.gstAmount.toFixed(2)).toBe("2971.98");
    expect(t.total.toFixed(2)).toBe("19482.98");
    expect(t.mrpSubtotal.toFixed(2)).toBe("20780.00");
    expect(t.totalDiscountVsMrp.toFixed(2)).toBe("1297.02");
  });

  test("MRP-mode line + 5% blanket: saving captures both the discount and the GST recovered", () => {
    // ERV at MRP/1.18 = 8805.08, qty 1, MRP 10390 incl, 5% blanket.
    //   subtotal     = 8805.08
    //   discount     = 440.25
    //   net          = 8364.83
    //   GST          = 8364.83 × 0.18 = 1505.67
    //   total        = 9870.50
    //   mrpSubtotal  = 10390
    //   saving       = 519.50  (discount 440.25 + GST recovery 79.25)
    const t = computeSectionTotals({
      lines: [{ qty: "1", unitPrice: "8805.08", mrp: "10390" }],
      discountPercent: "5.00",
      gstRate: "18.00",
      isLabourStyle: false,
      appliesDiscount: true,
    });
    expect(t.total.toFixed(2)).toBe("9870.50");
    expect(t.mrpSubtotal.toFixed(2)).toBe("10390.00");
    expect(t.totalDiscountVsMrp.toFixed(2)).toBe("519.50");
  });

  test("line without MRP: contributes its own share to mrpSubtotal, shows 0 saving", () => {
    // Custom item, no mrp, 5% blanket, 18% GST. Its mrp-inclusive
    // contribution = post-discount post-GST line value, so saving = 0.
    const t = computeSectionTotals({
      lines: [{ qty: "1", unitPrice: "5000" }],
      discountPercent: "5.00",
      gstRate: "18.00",
      isLabourStyle: false,
      appliesDiscount: true,
    });
    // subtotal 5000, discount 250, net 4750, GST 855, total 5605
    expect(t.total.toFixed(2)).toBe("5605.00");
    expect(t.mrpSubtotal.toFixed(2)).toBe("5605.00");
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
    expect(t.total.toFixed(2)).toBe("20000.00");
    expect(t.totalDiscountVsMrp.toFixed(2)).toBe("0.00");
  });

  test("quote-level roll-up sums mrpSubtotal and saving across sections", () => {
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
    expect(totals.totalMrpSubtotal.toFixed(2)).toBe("31170.00");
    expect(totals.grandTotal.toFixed(2)).toBe("29353.48");
    expect(totals.totalSavingsVsMrp.toFixed(2)).toBe("1816.52");
  });
});
