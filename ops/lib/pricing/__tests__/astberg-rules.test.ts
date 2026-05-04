import { describe, it, expect } from "vitest";
import { Decimal } from "../decimal";
import {
  computeCostPrice,
  computeDefaultUnitPrice,
  mrpExGst,
  suggestedSellRate,
  validateUnitPriceUnderMrp,
  type AstbergPricedSKU,
} from "../astberg-rules";

// Real numbers traced from /Users/kabir/Downloads/Sales_PI_26-27_196 (1).pdf
//   AHE-50THP MRP 103490 → ex-GST 87703.39, after 20% disc → 70162.71 taxable
//   AHT15-34 MRP 9790, DP-Basic 6771.19, DP 7990 → 20% off DP-Basic → 5416.95
const aheErv: AstbergPricedSKU = {
  sku: "AHE-50THP",
  name: "Astberg AHE 50 THP",
  isERV: true,
  mrp: new Decimal(103490),
  dpBasic: null,
  dp: null,
};

const ahtFan: AstbergPricedSKU = {
  sku: "AHT-15-34",
  name: "Astberg Kitchen Fan AHT 15-34",
  isERV: false,
  mrp: new Decimal(9790),
  dpBasic: new Decimal(6771.19),
  dp: new Decimal(7990),
};

// Reconciliation edge case: AEE-150's price list shows rounded dp_basic = 7364
// but Astberg's actual invoice computes ex-GST = 8690 / 1.18 = 7364.41.
// The cost should reconcile from `dp`, not from the rounded `dp_basic`.
const aeeFan: AstbergPricedSKU = {
  sku: "AEE-150",
  name: "Astberg AEE 150 Circular Duct Fan",
  isERV: false,
  mrp: new Decimal(10390),
  dpBasic: new Decimal(7364), // ← rounded in price list
  dp: new Decimal(8690),
};

describe("Astberg pricing rules", () => {
  describe("ERV item (AHE-50THP)", () => {
    it("cost = MRP/1.18 × 0.80 — matches Astberg PI taxable amount", () => {
      const cost = computeCostPrice(aheErv);
      // Expected: 87,703.39 × 0.80 = 70,162.71 (matches Astberg invoice line 1 exactly)
      expect(cost?.toFixed(2)).toBe("70162.71");
    });

    it("default sell = MRP / 1.18 — matches what we billed Samyak (87,703)", () => {
      const sell = computeDefaultUnitPrice(aheErv);
      expect(sell?.toFixed(2)).toBe("87703.39");
    });

    it("MRP ceiling × 1.18 = MRP exactly", () => {
      const ceiling = mrpExGst(aheErv);
      expect(ceiling?.mul(new Decimal(1.18)).toDecimalPlaces(0).toFixed(0)).toBe("103490");
    });

    it("Astberg-led and self-sourced both use MRP/1.18 for ERV", () => {
      const ledRate = suggestedSellRate(aheErv, "ASTBERG_LED");
      const selfRate = suggestedSellRate(aheErv, "SELF_SOURCED");
      expect(ledRate?.toFixed(2)).toBe(selfRate?.toFixed(2));
      expect(ledRate?.toFixed(2)).toBe("87703.39");
    });
  });

  describe("Non-ERV item (AHT 15-34)", () => {
    it("cost = (DP / 1.18) × 0.80 — matches Astberg PI taxable amount", () => {
      const cost = computeCostPrice(ahtFan);
      // Expected: 7,990 / 1.18 × 0.80 = 5,416.95 (matches Astberg invoice line 4)
      expect(cost?.toFixed(2)).toBe("5416.95");
    });

    it("default sell = DP — matches Astberg's quote line to Mohit Jain (₹7,990)", () => {
      const sell = computeDefaultUnitPrice(ahtFan);
      expect(sell?.toFixed(2)).toBe("7990.00");
    });

    it("DP × 1.18 stays sub-MRP (sanity: ₹9,428.20 < ₹9,790)", () => {
      const sellExGst = computeDefaultUnitPrice(ahtFan)!;
      const total = sellExGst.mul(new Decimal(1.18));
      expect(total.lt(ahtFan.mrp!)).toBe(true);
    });

    it("Astberg-led mode → suggests DP (₹7,990)", () => {
      expect(suggestedSellRate(ahtFan, "ASTBERG_LED")?.toFixed(2)).toBe("7990.00");
    });

    it("Self-sourced mode → suggests MRP/1.18 (₹8,296.61)", () => {
      expect(suggestedSellRate(ahtFan, "SELF_SOURCED")?.toFixed(2)).toBe("8296.61");
    });
  });

  describe("Reconciliation: AEE-150 (rounded dp_basic in price list)", () => {
    it("cost reconciles to Astberg's invoice using DP/1.18, not stored dp_basic", () => {
      const cost = computeCostPrice(aeeFan);
      // Astberg's actual invoice taxable per piece = 8690 / 1.18 × 0.80 = 5891.53
      // (using stored dp_basic = 7364 would give 5891.20, off by ₹0.33)
      expect(cost?.toFixed(2)).toBe("5891.53");
    });

    it("default sell = DP — matches what we billed Samyak (₹8,805 = MRP/1.18)", () => {
      // Note: DP for AEE-150 is 8690. We billed at 8805 in PI which is MRP/1.18
      // (this happened because AEE-150 was NOT in the original Astberg quote, so the
      // rep used the higher 'self-sourced' rate per-line override). Default stays DP.
      const sell = computeDefaultUnitPrice(aeeFan);
      expect(sell?.toFixed(2)).toBe("8690.00");
    });
  });

  describe("MRP ceiling validation", () => {
    it("accepts unit price equal to MRP/1.18", () => {
      const result = validateUnitPriceUnderMrp(new Decimal("8296.61"), ahtFan);
      expect(result.ok).toBe(true);
    });

    it("rejects unit price above MRP/1.18", () => {
      const result = validateUnitPriceUnderMrp(new Decimal("8500"), ahtFan);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.ceiling.toFixed(2)).toBe("8296.61");
      }
    });

    it("returns ok when SKU has no MRP (no constraint)", () => {
      const noMrpSku: AstbergPricedSKU = { ...ahtFan, mrp: null };
      const result = validateUnitPriceUnderMrp(new Decimal("999999"), noMrpSku);
      expect(result.ok).toBe(true);
    });
  });
});
