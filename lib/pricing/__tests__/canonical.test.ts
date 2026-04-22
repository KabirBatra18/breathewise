import { describe, expect, test } from "vitest";
import { Decimal } from "../decimal";
import { computeSectionTotals } from "../section";
import { computeGrandTotal } from "../quote";
import { computePreciseTiers } from "../precise_tiers";
import { formatIndianNumber } from "../format";
import { amountInWords } from "../words";

// These fixtures are the invariant truth the engine must reproduce forever.
// They are derived from the Mohit Jain reference quotation (post-ERV price
// update), whose grand total is 1,67,217.74. Any change that fails these
// breaks a correctness guarantee and must not merge.

const SECTION_A = {
  lines: [
    { qty: "1", unitPrice: "87703.00" },
    { qty: "10", unitPrice: "410.00" },
    { qty: "2", unitPrice: "880.00" },
  ],
  discountPercent: "5.00",
  gstRate: "18.00",
  isLabourStyle: false,
};

const SECTION_B = {
  lines: [
    { qty: "1", unitPrice: "8805.00" },
    { qty: "1", unitPrice: "7990.00" },
    { qty: "6", unitPrice: "410.00" },
    { qty: "1", unitPrice: "680.00" },
    { qty: "1", unitPrice: "880.00" },
  ],
  discountPercent: "5.00",
  gstRate: "18.00",
  isLabourStyle: false,
};

const SECTION_C = {
  lines: [{ qty: "1", unitPrice: "39000.00" }],
  discountPercent: "0",
  gstRate: "0",
  isLabourStyle: true,
};

describe("ROUGH quote — Mohit Jain reference", () => {
  test("Section A — Fresh Air (ERV 87,703 + 5% disc + 18% GST)", () => {
    const r = computeSectionTotals(SECTION_A);
    expect(r.subtotal.toFixed(2)).toBe("93563.00");
    expect(r.discountAmount.toFixed(2)).toBe("4678.15");
    expect(r.netAfterDiscount.toFixed(2)).toBe("88884.85");
    expect(r.gstAmount.toFixed(2)).toBe("15999.27");
    expect(r.total.toFixed(2)).toBe("104884.12");
  });

  test("Section B — critical HALF_UP boundary (3559.365 → 3559.37)", () => {
    const r = computeSectionTotals(SECTION_B);
    expect(r.subtotal.toFixed(2)).toBe("20815.00");
    expect(r.discountAmount.toFixed(2)).toBe("1040.75");
    expect(r.netAfterDiscount.toFixed(2)).toBe("19774.25");
    // Banker's rounding would produce 3559.36 — that must be a failing test.
    expect(r.gstAmount.toFixed(2)).toBe("3559.37");
    expect(r.total.toFixed(2)).toBe("23333.62");
  });

  test("Section C — labour style, no discount, no GST", () => {
    const r = computeSectionTotals(SECTION_C);
    expect(r.subtotal.toFixed(2)).toBe("39000.00");
    expect(r.discountAmount.toFixed(2)).toBe("0.00");
    expect(r.gstAmount.toFixed(2)).toBe("0.00");
    expect(r.total.toFixed(2)).toBe("39000.00");
  });

  test("Grand total across A+B+C = 1,67,217.74", () => {
    expect(computeGrandTotal([SECTION_A, SECTION_B, SECTION_C]).toFixed(2)).toBe(
      "167217.74",
    );
  });
});

describe("Indian number formatting", () => {
  test("1,67,217.74 grouping", () => {
    expect(formatIndianNumber(new Decimal("167217.74"))).toBe("1,67,217.74");
  });

  test("negative as parentheses: (4,678.60)", () => {
    expect(
      formatIndianNumber(new Decimal("-4678.60"), { negativeAsParens: true }),
    ).toBe("(4,678.60)");
  });

  test("short numbers", () => {
    expect(formatIndianNumber(new Decimal("0"))).toBe("0.00");
    expect(formatIndianNumber(new Decimal("100"))).toBe("100.00");
    expect(formatIndianNumber(new Decimal("1000"))).toBe("1,000.00");
    expect(formatIndianNumber(new Decimal("99999.50"))).toBe("99,999.50");
    expect(formatIndianNumber(new Decimal("100000"))).toBe("1,00,000.00");
  });

  test("crore-scale numbers", () => {
    expect(formatIndianNumber(new Decimal("12345678.90"))).toBe("1,23,45,678.90");
    expect(formatIndianNumber(new Decimal("100000000"))).toBe("10,00,00,000.00");
  });
});

describe("Amount in words (Indian, HALF_UP to rupees)", () => {
  test("Mohit Jain grand total rounds to 167218 rupees", () => {
    expect(amountInWords(new Decimal("167217.74"))).toBe(
      "Rupees One Lakh Sixty-Seven Thousand Two Hundred and Eighteen Only",
    );
  });

  test("zero", () => {
    expect(amountInWords(new Decimal("0"))).toBe("Rupees Zero Only");
  });

  test("small integers", () => {
    expect(amountInWords(new Decimal("1"))).toBe("Rupees One Only");
    expect(amountInWords(new Decimal("18"))).toBe("Rupees Eighteen Only");
    expect(amountInWords(new Decimal("100"))).toBe("Rupees One Hundred Only");
    expect(amountInWords(new Decimal("218"))).toBe(
      "Rupees Two Hundred and Eighteen Only",
    );
  });

  test("paise rounds HALF_UP before conversion", () => {
    // 0.50 rounds up to 1
    expect(amountInWords(new Decimal("0.50"))).toBe("Rupees One Only");
    // 99.49 rounds down to 99
    expect(amountInWords(new Decimal("99.49"))).toBe("Rupees Ninety-Nine Only");
  });

  test("crores", () => {
    expect(amountInWords(new Decimal("10000000"))).toBe("Rupees One Crore Only");
    expect(amountInWords(new Decimal("12345678"))).toBe(
      "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred and Seventy-Eight Only",
    );
  });
});

describe("PRECISE tier computation — same line items, three discount tiers", () => {
  const PRECISE_INPUT = {
    sections: [
      {
        lines: [
          { qty: "1", unitPrice: "87703.00" },
          { qty: "10", unitPrice: "410.00" },
          { qty: "2", unitPrice: "880.00" },
        ],
        gstRate: "18.00",
        isLabourStyle: false,
        appliesDiscount: true,
      },
    ],
    discountTiers: ["5.00", "10.00", "15.00"],
  } as const;

  test("grand totals at Q1/Q2/Q3 (5/10/15%)", () => {
    const tiers = computePreciseTiers(PRECISE_INPUT, "EMPLOYEE");
    expect(tiers).toHaveLength(3);
    expect(tiers[0].grandTotal.toFixed(2)).toBe("104884.12");
    expect(tiers[1].grandTotal.toFixed(2)).toBe("99363.91");
    expect(tiers[2].grandTotal.toFixed(2)).toBe("93843.69");
    tiers.forEach((t) => expect(t.financials).toBeUndefined());
  });

  test("OWNER sees margin fields; EMPLOYEE and VIEWER do not", () => {
    const withCosts = {
      sections: [
        {
          lines: [
            { qty: "1", unitPrice: "87703.00", costPriceSnapshot: "60000.00" },
            { qty: "10", unitPrice: "410.00", costPriceSnapshot: "250.00" },
            { qty: "2", unitPrice: "880.00", costPriceSnapshot: "550.00" },
          ],
          gstRate: "18.00",
          isLabourStyle: false,
          appliesDiscount: true,
        },
      ],
      discountTiers: ["5.00", "10.00", "15.00"],
    };

    const ownerView = computePreciseTiers(withCosts, "OWNER");
    expect(ownerView[0].financials).toBeDefined();
    expect(ownerView[0].financials!.costOfGoods.toFixed(2)).toBe("63600.00");
    // Revenue post-discount at 5%: 93563 - 4678.15 = 88884.85
    // Margin: 88884.85 - 63600 = 25284.85
    expect(ownerView[0].financials!.grossMargin.toFixed(2)).toBe("25284.85");

    const empView = computePreciseTiers(withCosts, "EMPLOYEE");
    expect(empView[0].financials).toBeUndefined();

    const viewerView = computePreciseTiers(withCosts, "VIEWER");
    expect(viewerView[0].financials).toBeUndefined();
  });
});
