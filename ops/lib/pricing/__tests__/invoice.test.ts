import { describe, expect, test } from "vitest";
import {
  buildInvoiceFromQuote,
  computeInvoiceLineTax,
  recomputeInvoiceTotalsFromLines,
} from "../invoice";
import type { InvoiceBuildInput } from "../invoice";
import { Decimal } from "../decimal";

/**
 * Tests pin the legal invariants the invoice has to satisfy:
 *
 *   • Σ taxable values = total taxable value
 *   • taxable + CGST + SGST + IGST = line total
 *   • Intra-state: CGST = SGST exactly (half of the section's GST)
 *   • Inter-state: CGST = SGST = 0; IGST = full rate
 *   • includeLabour=false strips labour-style sections from the invoice
 *   • Invoice grand total matches the engine's quote grand total when
 *     labour is excluded (= goods-only grand from the underlying
 *     computeQuoteTotals[ForTarget]).
 *   • New-model target gets honoured (delta lands as discount).
 */

const baseLines = [
  {
    sno: 1,
    sectionLetter: "A",
    sectionTitle: "Equipment",
    isLabourStyle: false,
    skuSnapshot: "AEE-150",
    description: "AEE-150 Circular Duct Fan",
    hsnCode: "8414",
    quantity: "1",
    unit: "pcs",
    unitPrice: "8690",
    mrp: "10390",
  },
  {
    sno: 2,
    sectionLetter: "A",
    sectionTitle: "Equipment",
    isLabourStyle: false,
    skuSnapshot: "AEE-100",
    description: "AEE-100 Circular Duct Fan",
    hsnCode: "8414",
    quantity: "2",
    unit: "pcs",
    unitPrice: "5800",
    mrp: "6890",
  },
];

const goodsSection = {
  letter: "A",
  title: "Equipment",
  isLabourStyle: false,
  appliesDiscount: true,
  gstRate: "18",
  discountPercent: "0",
  lines: baseLines,
};

const labourSection = {
  letter: "B",
  title: "Installation",
  isLabourStyle: true,
  appliesDiscount: false,
  gstRate: "0",
  discountPercent: "0",
  lines: [
    {
      sno: 1,
      sectionLetter: "B",
      sectionTitle: "Installation",
      isLabourStyle: true,
      skuSnapshot: null,
      description: "Installation labour",
      hsnCode: "9954",
      quantity: "1",
      unit: "job",
      unitPrice: "15000",
      mrp: null,
    },
  ],
};

describe("buildInvoiceFromQuote — intra-state (Delhi → Delhi)", () => {
  test("auto saving only, no extra discount: per-line taxable = qty × unit_price, CGST = SGST", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: null,
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);

    expect(out.lines).toHaveLength(2);
    // Line 1: 1 × 8690 = 8690 taxable
    expect(out.lines[0].taxableValue.toFixed(2)).toBe("8690.00");
    // Line 2: 2 × 5800 = 11600 taxable
    expect(out.lines[1].taxableValue.toFixed(2)).toBe("11600.00");
    // CGST = SGST = 9% on each line
    expect(out.lines[0].cgstAmount.toFixed(2)).toBe("782.10");
    expect(out.lines[0].sgstAmount.toFixed(2)).toBe("782.10");
    expect(out.lines[0].igstAmount.toFixed(2)).toBe("0.00");
    expect(out.lines[1].cgstAmount.toFixed(2)).toBe("1044.00");
    expect(out.lines[1].sgstAmount.toFixed(2)).toBe("1044.00");
    expect(out.totalCgst.toFixed(2)).toBe("1826.10");
    expect(out.totalSgst.toFixed(2)).toBe("1826.10");
    expect(out.totalIgst.toFixed(2)).toBe("0.00");
    expect(out.totalTaxableValue.toFixed(2)).toBe("20290.00");
    expect(out.totalInvoiceValue.toFixed(2)).toBe("23942.20");
  });

  test("with new-model discount target = 5000 over MRP: net drops by exactly 5000 from auto", () => {
    // Auto saving with just the natural DP→MRP markdown:
    //   line1: 10390 − 8690×1.18 = 10390 − 10254.20 = 135.80
    //   line2: 2×6890 − 2×5800×1.18 = 13780 − 13688 = 92.00
    //   autoSavingGoods = 227.80
    // Target = 227.80 + 4772.20 = 5000 → delta = 4772.20 GST-incl
    // Pre-GST delta = 4772.20 / 1.18 = 4044.24 (allocated as discount)
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: "5000",
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    // Total invoice value = (mrpSubtotal of goods) − target
    //   mrpSubtotal = 10390 + 2×6890 = 24170
    //   total = 24170 − 5000 = 19170
    expect(out.totalInvoiceValue.toFixed(2)).toBe("19170.00");
  });

  test("each line satisfies: taxable + CGST + SGST = line total", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: "5000",
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    for (const l of out.lines) {
      const sum = l.taxableValue
        .plus(l.cgstAmount)
        .plus(l.sgstAmount)
        .plus(l.igstAmount);
      expect(sum.toFixed(2)).toBe(l.lineTotal.toFixed(2));
    }
  });
});

describe("buildInvoiceFromQuote — inter-state (Delhi → Maharashtra)", () => {
  test("CGST + SGST = 0, IGST = full rate, sums match", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: null,
      isInterState: true,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    for (const l of out.lines) {
      expect(l.cgstAmount.toFixed(2)).toBe("0.00");
      expect(l.sgstAmount.toFixed(2)).toBe("0.00");
      expect(l.igstRate.toFixed(2)).toBe("18.00");
    }
    expect(out.totalCgst.toFixed(2)).toBe("0.00");
    expect(out.totalSgst.toFixed(2)).toBe("0.00");
    // 20290 × 18% = 3652.20
    expect(out.totalIgst.toFixed(2)).toBe("3652.20");
    expect(out.totalInvoiceValue.toFixed(2)).toBe("23942.20");
  });
});

describe("buildInvoiceFromQuote — labour handling", () => {
  test("includeLabour=false strips labour sections, totals = goods only", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection, labourSection],
      discountTargetSaving: null,
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    // Should have only the 2 goods lines.
    expect(out.lines).toHaveLength(2);
    expect(out.lines.every((l) => !l.isLabourStyle)).toBe(true);
    expect(out.totalInvoiceValue.toFixed(2)).toBe("23942.20");
  });

  test("includeLabour=true keeps labour with zero GST", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection, labourSection],
      discountTargetSaving: null,
      isInterState: false,
      includeLabour: true,
    };
    const out = buildInvoiceFromQuote(input);
    expect(out.lines).toHaveLength(3);
    const labour = out.lines[2];
    expect(labour.isLabourStyle).toBe(true);
    expect(labour.gstRate.toFixed(2)).toBe("0.00");
    expect(labour.cgstAmount.toFixed(2)).toBe("0.00");
    expect(labour.sgstAmount.toFixed(2)).toBe("0.00");
    expect(labour.taxableValue.toFixed(2)).toBe("15000.00");
    expect(labour.lineTotal.toFixed(2)).toBe("15000.00");
    // Total = goods 23942.20 + labour 15000 = 38942.20
    expect(out.totalInvoiceValue.toFixed(2)).toBe("38942.20");
  });
});

describe("buildInvoiceFromQuote — rounding reconciliation", () => {
  test("Σ per-line taxable = totalTaxableValue (no drift)", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: "5000",
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    const sumTaxable = out.lines.reduce(
      (a, l) => a.plus(l.taxableValue),
      new Decimal(0),
    );
    expect(sumTaxable.toFixed(2)).toBe(out.totalTaxableValue.toFixed(2));
  });

  test("Σ per-line CGST = totalCgst (no drift)", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: "5000",
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    const sumCgst = out.lines.reduce(
      (a, l) => a.plus(l.cgstAmount),
      new Decimal(0),
    );
    expect(sumCgst.toFixed(2)).toBe(out.totalCgst.toFixed(2));
  });
});

describe("buildInvoiceFromQuote — round-off", () => {
  test("paisa is absorbed into a Round Off line; rounded total is whole rupee", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: null,
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    // Precise: 23942.20 → rounded down to 23942 → roundOff = −0.20
    expect(out.totalInvoiceValue.toFixed(2)).toBe("23942.20");
    expect(out.grandTotalRounded.toFixed(2)).toBe("23942.00");
    expect(out.roundOff.toFixed(2)).toBe("-0.20");
    // Identity: rounded = precise + roundOff
    expect(out.totalInvoiceValue.plus(out.roundOff).toFixed(2)).toBe(
      out.grandTotalRounded.toFixed(2),
    );
  });

  test("whole-rupee total → roundOff = 0", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: "5000",
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    // 5000 target → MRP 24170 − 5000 = 19170 exact
    expect(out.totalInvoiceValue.toFixed(2)).toBe("19170.00");
    expect(out.grandTotalRounded.toFixed(2)).toBe("19170.00");
    expect(out.roundOff.toFixed(2)).toBe("0.00");
  });

  test("round-off magnitude is always ≤ ₹0.50", () => {
    const input: InvoiceBuildInput = {
      sections: [goodsSection],
      discountTargetSaving: null,
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    expect(out.roundOff.abs().lte(new Decimal("0.50"))).toBe(true);
  });
});

describe("buildInvoiceFromQuote — empty / labour-only edge cases", () => {
  test("labour-only quote, labour excluded → empty invoice", () => {
    const input: InvoiceBuildInput = {
      sections: [labourSection],
      discountTargetSaving: null,
      isInterState: false,
      includeLabour: false,
    };
    const out = buildInvoiceFromQuote(input);
    expect(out.lines).toHaveLength(0);
    expect(out.totalInvoiceValue.toFixed(2)).toBe("0.00");
  });

  test("labour-only quote, labour included → just the labour line, no tax", () => {
    const input: InvoiceBuildInput = {
      sections: [labourSection],
      discountTargetSaving: null,
      isInterState: false,
      includeLabour: true,
    };
    const out = buildInvoiceFromQuote(input);
    expect(out.lines).toHaveLength(1);
    expect(out.totalInvoiceValue.toFixed(2)).toBe("15000.00");
    expect(out.totalCgst.toFixed(2)).toBe("0.00");
    expect(out.totalSgst.toFixed(2)).toBe("0.00");
    expect(out.totalIgst.toFixed(2)).toBe("0.00");
  });
});

// =============================================================
// DRAFT-edit helpers
// =============================================================
describe("computeInvoiceLineTax", () => {
  test("intra-state: CGST=SGST=half rate; sum identity holds", () => {
    const t = computeInvoiceLineTax(
      new Decimal("2"),
      new Decimal("8690"),
      new Decimal("18"),
      false,
    );
    expect(t.taxableValue.toFixed(2)).toBe("17380.00");
    expect(t.cgstRate.toFixed(2)).toBe("9.00");
    expect(t.sgstRate.toFixed(2)).toBe("9.00");
    expect(t.cgstAmount.toFixed(2)).toBe("1564.20");
    expect(t.sgstAmount.toFixed(2)).toBe("1564.20");
    expect(t.igstAmount.toFixed(2)).toBe("0.00");
    expect(t.lineTotal.toFixed(2)).toBe("20508.40");
  });

  test("inter-state: IGST=full rate; CGST and SGST = 0", () => {
    const t = computeInvoiceLineTax(
      new Decimal("1"),
      new Decimal("10000"),
      new Decimal("18"),
      true,
    );
    expect(t.taxableValue.toFixed(2)).toBe("10000.00");
    expect(t.cgstAmount.toFixed(2)).toBe("0.00");
    expect(t.sgstAmount.toFixed(2)).toBe("0.00");
    expect(t.igstRate.toFixed(2)).toBe("18.00");
    expect(t.igstAmount.toFixed(2)).toBe("1800.00");
    expect(t.lineTotal.toFixed(2)).toBe("11800.00");
  });

  test("zero gst rate (labour) → no tax", () => {
    const t = computeInvoiceLineTax(
      new Decimal("1"),
      new Decimal("15000"),
      new Decimal("0"),
      false,
    );
    expect(t.taxableValue.toFixed(2)).toBe("15000.00");
    expect(t.cgstAmount.toFixed(2)).toBe("0.00");
    expect(t.sgstAmount.toFixed(2)).toBe("0.00");
    expect(t.igstAmount.toFixed(2)).toBe("0.00");
    expect(t.lineTotal.toFixed(2)).toBe("15000.00");
  });

  test("fractional qty + price: rounding to paisa", () => {
    const t = computeInvoiceLineTax(
      new Decimal("1.5"),
      new Decimal("100.33"),
      new Decimal("18"),
      false,
    );
    // 1.5 × 100.33 = 150.495 → ₹150.50 (HALF_UP)
    expect(t.taxableValue.toFixed(2)).toBe("150.50");
  });
});

describe("recomputeInvoiceTotalsFromLines", () => {
  const dec = (v: string) => new Decimal(v);

  test("sums match Σ per-line + round-off lands on whole rupee", () => {
    const lines = [
      {
        taxableValue: dec("8690.00"),
        cgstAmount: dec("782.10"),
        sgstAmount: dec("782.10"),
        igstAmount: dec("0.00"),
      },
      {
        taxableValue: dec("11600.00"),
        cgstAmount: dec("1044.00"),
        sgstAmount: dec("1044.00"),
        igstAmount: dec("0.00"),
      },
    ];
    const t = recomputeInvoiceTotalsFromLines(lines);
    expect(t.totalTaxableValue.toFixed(2)).toBe("20290.00");
    expect(t.totalCgst.toFixed(2)).toBe("1826.10");
    expect(t.totalSgst.toFixed(2)).toBe("1826.10");
    expect(t.totalInvoiceValue.toFixed(2)).toBe("23942.20");
    // 23942.20 → 23942 (round down)
    expect(t.grandTotalRounded.toFixed(2)).toBe("23942.00");
    expect(t.roundOff.toFixed(2)).toBe("-0.20");
  });

  test("empty lines → all zeros", () => {
    const t = recomputeInvoiceTotalsFromLines([]);
    expect(t.totalTaxableValue.toFixed(2)).toBe("0.00");
    expect(t.totalInvoiceValue.toFixed(2)).toBe("0.00");
    expect(t.grandTotalRounded.toFixed(2)).toBe("0.00");
    expect(t.roundOff.toFixed(2)).toBe("0.00");
  });

  test("identity: grandTotalRounded = totalInvoiceValue + roundOff", () => {
    const lines = [
      {
        taxableValue: dec("12345.67"),
        cgstAmount: dec("1111.11"),
        sgstAmount: dec("1111.11"),
        igstAmount: dec("0.00"),
      },
    ];
    const t = recomputeInvoiceTotalsFromLines(lines);
    const reconstructed = t.totalInvoiceValue.plus(t.roundOff);
    expect(reconstructed.toFixed(2)).toBe(t.grandTotalRounded.toFixed(2));
  });
});
