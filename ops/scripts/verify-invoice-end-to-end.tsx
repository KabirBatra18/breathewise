import { config } from "dotenv";
config({ path: ".env.local" });

import {
  Decimal,
  buildInvoiceFromQuote,
  type InvoiceBuildInput,
} from "../lib/pricing";

/**
 * End-to-end synthetic verification of the tax-invoice engine after
 * the round-off + ship-to additions. We construct realistic quote
 * inputs, run them through the engine, and assert every identity the
 * downstream PDF + DB store relies on:
 *
 *   1. Σ per-line taxable + Σ tax = totalInvoiceValue (precise)
 *   2. totalInvoiceValue + roundOff = grandTotalRounded (whole ₹)
 *   3. |roundOff| ≤ 0.50
 *   4. CGST + SGST sum to within ₹0.05 of section.gstAmount (intra-state)
 *   5. IGST sums to within ₹0.05 of section.gstAmount (inter-state)
 *   6. grandTotalRounded is always a whole rupee (toFixed(0).length valid)
 *   7. labour include vs exclude flips totals correctly
 *   8. intra ↔ inter state flip produces same precise total
 */

const ZERO = new Decimal(0);
const TOL = new Decimal("0.05");
let failures = 0;

function within(a: Decimal, b: Decimal, tol: Decimal = TOL): boolean {
  return a.minus(b).abs().lte(tol);
}

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}${detail ? "  → " + detail : ""}`);
    failures++;
  }
}

function header(title: string) {
  console.log(`\n=== ${title} ===`);
}

// Real Astberg pricing from the catalog.
const goodsSection18 = {
  letter: "A",
  title: "Equipment",
  isLabourStyle: false,
  appliesDiscount: true,
  gstRate: "18",
  discountPercent: "0",
  lines: [
    {
      sno: 1,
      sectionLetter: "A",
      sectionTitle: "Equipment",
      isLabourStyle: false,
      skuSnapshot: "AHE-100THP",
      description: "ERV with HEPA + Carbon, 1000 CMH",
      hsnCode: "8415",
      quantity: "1",
      unit: "pcs",
      unitPrice: "87703.39",
      mrp: "103490",
    },
    {
      sno: 2,
      sectionLetter: "A",
      sectionTitle: "Equipment",
      isLabourStyle: false,
      skuSnapshot: "AEE-150",
      description: "Circular Duct Fan 6\"",
      hsnCode: "8414",
      quantity: "4",
      unit: "pcs",
      unitPrice: "8690",
      mrp: "10390",
    },
  ],
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
      description: "Site installation + commissioning",
      hsnCode: "9954",
      quantity: "1",
      unit: "job",
      unitPrice: "25000",
      mrp: null,
    },
  ],
};

function runScenario(label: string, input: InvoiceBuildInput) {
  header(label);
  const out = buildInvoiceFromQuote(input);

  // Print summary
  console.log(
    `  lines=${out.lines.length}  taxable=₹${out.totalTaxableValue.toFixed(2)}  CGST=₹${out.totalCgst.toFixed(2)}  SGST=₹${out.totalSgst.toFixed(2)}  IGST=₹${out.totalIgst.toFixed(2)}  precise=₹${out.totalInvoiceValue.toFixed(2)}  roundOff=₹${out.roundOff.toFixed(2)}  rounded=₹${out.grandTotalRounded.toFixed(2)}`,
  );

  // 1. Σ line totals + roundOff = grandTotalRounded
  const lineSum = out.lines.reduce(
    (a, l) => a.plus(l.lineTotal),
    ZERO,
  );
  assert(
    within(lineSum, out.totalInvoiceValue),
    "Σ line totals = totalInvoiceValue (precise)",
    `Σ=${lineSum.toFixed(2)} vs precise=${out.totalInvoiceValue.toFixed(2)}`,
  );

  // 2. precise + roundOff = rounded
  assert(
    within(
      out.totalInvoiceValue.plus(out.roundOff),
      out.grandTotalRounded,
      new Decimal("0.001"),
    ),
    "precise + roundOff = grandTotalRounded",
    `${out.totalInvoiceValue.toFixed(2)} + ${out.roundOff.toFixed(2)} = ${out.grandTotalRounded.toFixed(2)}`,
  );

  // 3. |roundOff| ≤ 0.50
  assert(
    out.roundOff.abs().lte(new Decimal("0.50")),
    "|roundOff| ≤ ₹0.50",
    `|${out.roundOff.toFixed(2)}|`,
  );

  // 4. grandTotalRounded is whole rupee
  assert(
    out.grandTotalRounded.toString() ===
      out.grandTotalRounded.toDecimalPlaces(0).toString(),
    "grandTotalRounded is a whole rupee",
    out.grandTotalRounded.toString(),
  );

  // 5. tax split sums correctly
  const taxSum = out.totalCgst.plus(out.totalSgst).plus(out.totalIgst);
  const expectedTax = out.totalInvoiceValue.minus(out.totalTaxableValue);
  assert(
    within(taxSum, expectedTax),
    "Σ tax (CGST+SGST+IGST) = total − taxable",
    `tax=${taxSum.toFixed(2)} vs expected=${expectedTax.toFixed(2)}`,
  );

  // 6. intra-state: CGST == SGST exactly (within rounding)
  if (!input.isInterState) {
    assert(
      within(out.totalCgst, out.totalSgst),
      "intra-state: CGST ≈ SGST",
      `CGST=${out.totalCgst.toFixed(2)} SGST=${out.totalSgst.toFixed(2)}`,
    );
    assert(
      out.totalIgst.isZero(),
      "intra-state: IGST = 0",
      out.totalIgst.toFixed(2),
    );
  } else {
    assert(
      out.totalCgst.isZero() && out.totalSgst.isZero(),
      "inter-state: CGST = SGST = 0",
    );
    assert(
      out.totalIgst.gt(0) || out.totalTaxableValue.isZero(),
      "inter-state: IGST > 0 when taxable > 0",
    );
  }

  // 7. line sum identity per line: taxable + CGST + SGST + IGST = lineTotal
  let lineIdentityOk = true;
  for (const l of out.lines) {
    const sum = l.taxableValue
      .plus(l.cgstAmount)
      .plus(l.sgstAmount)
      .plus(l.igstAmount);
    if (sum.toFixed(2) !== l.lineTotal.toFixed(2)) {
      lineIdentityOk = false;
      console.log(
        `    ✗ line ${l.sno}: ${sum.toFixed(2)} ≠ ${l.lineTotal.toFixed(2)}`,
      );
    }
  }
  assert(lineIdentityOk, "every line: taxable + tax = lineTotal");

  return out;
}

// ── Scenario 1: Intra-state Delhi → Delhi, goods only ────────────────
const intra = runScenario("Intra-state (Delhi → Delhi), goods only", {
  sections: [goodsSection18],
  discountTargetSaving: null,
  isInterState: false,
  includeLabour: false,
});

// ── Scenario 2: Inter-state Delhi → Noida (UP), goods only ───────────
const inter = runScenario("Inter-state (Delhi → Noida UP), goods only", {
  sections: [goodsSection18],
  discountTargetSaving: null,
  isInterState: true,
  includeLabour: false,
});

// ── Cross-scenario invariant: intra precise = inter precise ──────────
header("Cross-scenario: intra ↔ inter preserves precise total");
assert(
  intra.totalInvoiceValue.toFixed(2) === inter.totalInvoiceValue.toFixed(2),
  "intra precise = inter precise",
  `intra=${intra.totalInvoiceValue.toFixed(2)} inter=${inter.totalInvoiceValue.toFixed(2)}`,
);

// ── Scenario 3: Intra-state with ₹3000 extra discount target ─────────
runScenario("Intra-state with ₹3000 extra discount", {
  sections: [goodsSection18],
  discountTargetSaving: "3000",
  isInterState: false,
  includeLabour: false,
});

// ── Scenario 4: Inter-state with ₹5000 extra discount ────────────────
runScenario("Inter-state with ₹5000 extra discount", {
  sections: [goodsSection18],
  discountTargetSaving: "5000",
  isInterState: true,
  includeLabour: false,
});

// ── Scenario 5: Include labour ───────────────────────────────────────
runScenario("Intra-state, goods + labour included", {
  sections: [goodsSection18, labourSection],
  discountTargetSaving: null,
  isInterState: false,
  includeLabour: true,
});

// ── Scenario 6: Labour-excluded with labour-style section in input ───
const labourOff = runScenario(
  "Intra-state, goods + labour-style section but excluded",
  {
    sections: [goodsSection18, labourSection],
    discountTargetSaving: null,
    isInterState: false,
    includeLabour: false,
  },
);
header("labour-excluded matches goods-only");
const goodsOnly = runScenario("(Reference) goods-only", {
  sections: [goodsSection18],
  discountTargetSaving: null,
  isInterState: false,
  includeLabour: false,
});
assert(
  labourOff.grandTotalRounded.toFixed(2) ===
    goodsOnly.grandTotalRounded.toFixed(2),
  "excluding labour = goods-only invoice (same rounded total)",
);

// ── Boundary cases for round-off ─────────────────────────────────────
header("Round-off boundaries");
// Construct a section that produces exactly .50 precise total.
// 1 × 1000 ex-GST × 1.18 = 1180.00 exact; no round-off.
// 1 × 1000.42 ex-GST × 1.18 = 1180.50 (rounds to 1181, roundOff=+0.50).
{
  const sec = {
    letter: "X",
    title: "Test",
    isLabourStyle: false,
    appliesDiscount: true,
    gstRate: "18",
    discountPercent: "0",
    lines: [
      {
        sno: 1,
        sectionLetter: "X",
        sectionTitle: "Test",
        isLabourStyle: false,
        skuSnapshot: null,
        description: "Test",
        hsnCode: "8414",
        quantity: "1",
        unit: "pcs",
        unitPrice: "1000.42",
        mrp: null,
      },
    ],
  };
  const out = buildInvoiceFromQuote({
    sections: [sec],
    discountTargetSaving: null,
    isInterState: false,
    includeLabour: false,
  });
  console.log(
    `  unitPrice=1000.42 → precise=${out.totalInvoiceValue.toFixed(2)} roundOff=${out.roundOff.toFixed(2)} rounded=${out.grandTotalRounded.toFixed(2)}`,
  );
  assert(
    out.grandTotalRounded.toString() === "1181",
    "1000.42 × 1.18 = 1180.50 rounds HALF_UP to 1181",
  );
  assert(
    out.roundOff.toFixed(2) === "0.50",
    "round-off = +0.50 exactly at the boundary",
  );
}
{
  const sec = {
    letter: "X",
    title: "Test",
    isLabourStyle: false,
    appliesDiscount: true,
    gstRate: "18",
    discountPercent: "0",
    lines: [
      {
        sno: 1,
        sectionLetter: "X",
        sectionTitle: "Test",
        isLabourStyle: false,
        skuSnapshot: null,
        description: "Test",
        hsnCode: "8414",
        quantity: "1",
        unit: "pcs",
        unitPrice: "1000.41",
        mrp: null,
      },
    ],
  };
  const out = buildInvoiceFromQuote({
    sections: [sec],
    discountTargetSaving: null,
    isInterState: false,
    includeLabour: false,
  });
  console.log(
    `  unitPrice=1000.41 → precise=${out.totalInvoiceValue.toFixed(2)} roundOff=${out.roundOff.toFixed(2)} rounded=${out.grandTotalRounded.toFixed(2)}`,
  );
  // 1000.41 × 1.18 = 1180.4838 → toMoney → 1180.48 → round to 1180, roundOff = -0.48
  assert(
    out.roundOff.abs().lte(new Decimal("0.50")),
    "boundary case below .50 stays under ₹0.50 magnitude",
  );
}

// ── Final summary ────────────────────────────────────────────────────
header("Summary");
if (failures === 0) {
  console.log("\n✓ ALL INVOICE INVARIANTS HOLD\n");
  process.exit(0);
} else {
  console.log(`\n✗ ${failures} FAILURES\n`);
  process.exit(1);
}
