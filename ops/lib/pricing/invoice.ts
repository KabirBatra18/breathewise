import { Decimal, ZERO, toMoney } from "./decimal";
import { computeQuoteTotals, computeQuoteTotalsForTarget } from "./quote";
import type { SectionInput } from "./section";

/**
 * Tax-invoice engine. Given a quote's sections + the user's discount
 * lever + an intra/inter-state flag, produces per-line GST breakdown
 * that satisfies Rule 46(j..l): each line carries its taxable value,
 * the rate, and the actual tax amount (CGST/SGST split for intra-state,
 * single IGST for inter-state).
 *
 * Discount allocation: the PI engine works at SECTION level (pro-rata
 * to subtotal). We carry that same allocation into the invoice by
 * scaling each line's pre-discount subtotal by the section's
 * net-after-discount / subtotal ratio. The last line in each section
 * absorbs rounding so Σ per-line taxable values = section.net exactly.
 *
 * The function is pure and engine-side only — it does no DB work. The
 * caller is responsible for resolving HSN / SKU snapshots and storing
 * the result.
 */

export interface InvoiceBuildLine {
  /** SNo as it should appear on the invoice (1-indexed across the whole quote, post-filter). */
  sno: number;
  sectionLetter: string;
  sectionTitle: string;
  isLabourStyle: boolean;
  skuSnapshot: string | null;
  description: string;
  hsnCode: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  mrp: string | null;
}

export interface InvoiceBuildSection {
  letter: string;
  title: string;
  isLabourStyle: boolean;
  appliesDiscount: boolean;
  gstRate: string;
  /** Legacy %-blanket discount. Pass "0" for new-model quotes. */
  discountPercent: string;
  lines: InvoiceBuildLine[];
}

export interface InvoiceBuildInput {
  sections: InvoiceBuildSection[];
  /** New-model lever (absolute saving from MRP). Null = legacy %. */
  discountTargetSaving: string | null;
  /** True = supplier and buyer in different states (IGST). False = intra-state (CGST+SGST). */
  isInterState: boolean;
  /** When false, labour sections are filtered out before building. */
  includeLabour: boolean;
}

export interface InvoiceBuiltLine {
  sno: number;
  sectionLetter: string;
  sectionTitle: string;
  isLabourStyle: boolean;
  skuSnapshot: string | null;
  description: string;
  hsnCode: string | null;
  quantity: Decimal;
  unit: string;
  unitPrice: Decimal;
  /** Full GST rate (e.g. 18) — for display. */
  gstRate: Decimal;
  /** Post-discount net for this line (ex-GST). */
  taxableValue: Decimal;
  cgstRate: Decimal;
  cgstAmount: Decimal;
  sgstRate: Decimal;
  sgstAmount: Decimal;
  igstRate: Decimal;
  igstAmount: Decimal;
  /** Line total = taxable + line-level tax components. */
  lineTotal: Decimal;
}

export interface InvoiceBuilt {
  lines: InvoiceBuiltLine[];
  totalTaxableValue: Decimal;
  totalCgst: Decimal;
  totalSgst: Decimal;
  totalIgst: Decimal;
  /** Precise sum of taxable + all tax components (may carry paisa). */
  totalInvoiceValue: Decimal;
  /** Round-off adjustment applied so the printed grand total is a whole
   *  rupee. Can be negative (when we round down) or positive (round up).
   *  Range: −0.50 < roundOff ≤ +0.50 (HALF_UP). */
  roundOff: Decimal;
  /** Whole-rupee grand total = totalInvoiceValue + roundOff. This is
   *  the figure that appears on the printed PDF. */
  grandTotalRounded: Decimal;
}

export function buildInvoiceFromQuote(input: InvoiceBuildInput): InvoiceBuilt {
  // 1. Filter sections to those included on this invoice.
  const sections = input.sections.filter(
    (s) => !s.isLabourStyle || input.includeLabour,
  );

  // 2. Convert to engine input. New-model quotes carry discount via
  //    the target; section-level discountPercent is forced to "0" so
  //    it doesn't compound.
  const isNewModel = input.discountTargetSaving != null;
  const calcInput: SectionInput[] = sections.map((s) => ({
    discountPercent: isNewModel ? "0" : s.discountPercent,
    gstRate: s.gstRate,
    isLabourStyle: s.isLabourStyle,
    appliesDiscount: s.appliesDiscount,
    lines: s.lines.map((l) => ({
      qty: l.quantity,
      unitPrice: l.unitPrice,
      mrp: l.mrp,
    })),
  }));

  // 3. Run the engine to get section-level net-after-discount.
  const target = isNewModel ? new Decimal(input.discountTargetSaving!) : null;
  const totals = target
    ? computeQuoteTotalsForTarget(calcInput, target)
    : computeQuoteTotals(calcInput);

  // 4. Walk lines, allocating each section's net pro-rata to line
  //    subtotal. Last line in each section absorbs rounding so the
  //    sum reconciles to section.net exactly.
  const lines: InvoiceBuiltLine[] = [];
  let sno = 1;

  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    const t = totals.sections[si];
    const gstRate = new Decimal(s.gstRate);
    const halfRate = gstRate.div(2);
    const subtotal = t.subtotal;
    const net = t.netAfterDiscount;
    const ratio = subtotal.isZero() ? new Decimal(1) : net.div(subtotal);

    let allocatedTaxable = ZERO;
    let allocatedCgst = ZERO;
    let allocatedSgst = ZERO;
    let allocatedIgst = ZERO;

    for (let li = 0; li < s.lines.length; li++) {
      const line = s.lines[li];
      const qty = new Decimal(line.quantity);
      const unitPrice = new Decimal(line.unitPrice);
      const lineSubtotal = toMoney(qty.mul(unitPrice));
      const isLast = li === s.lines.length - 1;

      let taxable: Decimal;
      if (isLast) {
        // Reconcile rounding: this line takes whatever remains.
        taxable = toMoney(net.minus(allocatedTaxable));
      } else {
        taxable = toMoney(lineSubtotal.mul(ratio));
        allocatedTaxable = allocatedTaxable.plus(taxable);
      }

      let cgstRate = ZERO;
      let cgstAmount = ZERO;
      let sgstRate = ZERO;
      let sgstAmount = ZERO;
      let igstRate = ZERO;
      let igstAmount = ZERO;

      if (input.isInterState) {
        igstRate = gstRate;
        if (isLast) {
          igstAmount = toMoney(t.gstAmount.minus(allocatedIgst));
        } else {
          igstAmount = toMoney(taxable.mul(gstRate).div(100));
          allocatedIgst = allocatedIgst.plus(igstAmount);
        }
      } else {
        cgstRate = halfRate;
        sgstRate = halfRate;
        if (isLast) {
          // Distribute remaining GST evenly across CGST+SGST so they
          // each end up at exactly section.gst / 2 (within a paisa).
          const remainingGst = t.gstAmount
            .minus(allocatedCgst)
            .minus(allocatedSgst);
          cgstAmount = toMoney(remainingGst.div(2));
          sgstAmount = toMoney(remainingGst.minus(cgstAmount));
        } else {
          cgstAmount = toMoney(taxable.mul(halfRate).div(100));
          sgstAmount = toMoney(taxable.mul(halfRate).div(100));
          allocatedCgst = allocatedCgst.plus(cgstAmount);
          allocatedSgst = allocatedSgst.plus(sgstAmount);
        }
      }

      const lineTotal = toMoney(
        taxable
          .plus(cgstAmount)
          .plus(sgstAmount)
          .plus(igstAmount),
      );

      lines.push({
        sno: sno++,
        sectionLetter: s.letter,
        sectionTitle: s.title,
        isLabourStyle: s.isLabourStyle,
        skuSnapshot: line.skuSnapshot,
        description: line.description,
        hsnCode: line.hsnCode,
        quantity: qty,
        unit: line.unit,
        unitPrice,
        gstRate,
        taxableValue: taxable,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate,
        igstAmount,
        lineTotal,
      });
    }
  }

  // 5. Roll up.
  const totalTaxableValue = toMoney(
    lines.reduce((acc, l) => acc.plus(l.taxableValue), ZERO),
  );
  const totalCgst = toMoney(
    lines.reduce((acc, l) => acc.plus(l.cgstAmount), ZERO),
  );
  const totalSgst = toMoney(
    lines.reduce((acc, l) => acc.plus(l.sgstAmount), ZERO),
  );
  const totalIgst = toMoney(
    lines.reduce((acc, l) => acc.plus(l.igstAmount), ZERO),
  );
  const totalInvoiceValue = toMoney(
    totalTaxableValue.plus(totalCgst).plus(totalSgst).plus(totalIgst),
  );
  // Round the printed grand total to a whole rupee — convention on
  // every Indian B2B/B2C invoice. roundOff captures the delta so the
  // PDF can display a transparent "Round Off" row.
  const grandTotalRounded = totalInvoiceValue.toDecimalPlaces(
    0,
    Decimal.ROUND_HALF_UP,
  );
  const roundOff = toMoney(grandTotalRounded.minus(totalInvoiceValue));

  return {
    lines,
    totalTaxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalInvoiceValue,
    roundOff,
    grandTotalRounded,
  };
}

// =============================================================
// DRAFT-invoice editing helpers
// =============================================================
// `buildInvoiceFromQuote` (above) is used at conversion time —
// translates a quote's PI-engine output into invoice form. Once the
// invoice exists in DRAFT, the user adds / edits / removes lines
// directly and the helpers below recompute per-line tax + invoice
// totals from the raw user inputs. The math matches the quote engine
// at the per-line level (qty × unitPrice = taxable, no section-level
// discount allocation) because at DRAFT-edit time there is no longer
// a quote-target to allocate against — the user is hand-curating
// each line's price.

export interface InvoiceLineTax {
  taxableValue: Decimal;
  cgstRate: Decimal;
  cgstAmount: Decimal;
  sgstRate: Decimal;
  sgstAmount: Decimal;
  igstRate: Decimal;
  igstAmount: Decimal;
  lineTotal: Decimal;
}

/**
 * Compute taxable value + per-line tax breakdown from raw qty / unit
 * price / GST rate / intra-vs-inter-state. Used when the user edits
 * a DRAFT invoice line. Pure function, no IO.
 */
export function computeInvoiceLineTax(
  qty: Decimal,
  unitPrice: Decimal,
  gstRate: Decimal,
  isInterState: boolean,
): InvoiceLineTax {
  const taxableValue = toMoney(qty.mul(unitPrice));
  let cgstRate = ZERO;
  let cgstAmount = ZERO;
  let sgstRate = ZERO;
  let sgstAmount = ZERO;
  let igstRate = ZERO;
  let igstAmount = ZERO;
  if (isInterState) {
    igstRate = gstRate;
    igstAmount = toMoney(taxableValue.mul(gstRate).div(100));
  } else {
    cgstRate = gstRate.div(2);
    sgstRate = gstRate.div(2);
    cgstAmount = toMoney(taxableValue.mul(cgstRate).div(100));
    sgstAmount = toMoney(taxableValue.mul(sgstRate).div(100));
  }
  const lineTotal = toMoney(
    taxableValue.plus(cgstAmount).plus(sgstAmount).plus(igstAmount),
  );
  return {
    taxableValue,
    cgstRate,
    cgstAmount,
    sgstRate,
    sgstAmount,
    igstRate,
    igstAmount,
    lineTotal,
  };
}

export interface InvoiceTotals {
  totalTaxableValue: Decimal;
  totalCgst: Decimal;
  totalSgst: Decimal;
  totalIgst: Decimal;
  totalInvoiceValue: Decimal;
  roundOff: Decimal;
  grandTotalRounded: Decimal;
}

/**
 * Sum across an already-computed set of invoice lines + apply the
 * whole-rupee round-off. Used at Finalize and on every DRAFT edit
 * to keep the totals row in sync with the lines.
 */
export function recomputeInvoiceTotalsFromLines(
  lines: ReadonlyArray<{
    taxableValue: Decimal;
    cgstAmount: Decimal;
    sgstAmount: Decimal;
    igstAmount: Decimal;
  }>,
): InvoiceTotals {
  const totalTaxableValue = toMoney(
    lines.reduce((acc, l) => acc.plus(l.taxableValue), ZERO),
  );
  const totalCgst = toMoney(
    lines.reduce((acc, l) => acc.plus(l.cgstAmount), ZERO),
  );
  const totalSgst = toMoney(
    lines.reduce((acc, l) => acc.plus(l.sgstAmount), ZERO),
  );
  const totalIgst = toMoney(
    lines.reduce((acc, l) => acc.plus(l.igstAmount), ZERO),
  );
  const totalInvoiceValue = toMoney(
    totalTaxableValue.plus(totalCgst).plus(totalSgst).plus(totalIgst),
  );
  const grandTotalRounded = totalInvoiceValue.toDecimalPlaces(
    0,
    Decimal.ROUND_HALF_UP,
  );
  const roundOff = toMoney(grandTotalRounded.minus(totalInvoiceValue));
  return {
    totalTaxableValue,
    totalCgst,
    totalSgst,
    totalIgst,
    totalInvoiceValue,
    roundOff,
    grandTotalRounded,
  };
}
