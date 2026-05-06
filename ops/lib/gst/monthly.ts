import { Decimal, ZERO, toMoney } from "@/lib/pricing/decimal";

export interface GstMonthlyInput {
  // GST-incl revenue post-discount per sale recognised this month.
  // Use the saved tier financials (revenuePostDiscount + gstAmount) so
  // the math stays consistent with the actual quote PDF.
  taxableValue: Decimal; // Σ revenuePostDiscount across accepted quotes closed in the month
  outputGst: Decimal; // Σ gstAmount across accepted quotes closed in the month
  costOfGoods: Decimal; // Σ costOfGoods (ex-GST). Used to estimate input GST.
}

export interface GstMonthlySummary {
  taxableValue: Decimal;
  outputGst: Decimal;
  estInputGst: Decimal; // costOfGoods × 18% (Astberg's IGST rate)
  netLiability: Decimal; // outputGst − estInputGst, floored at 0
  netGstSplit: { cgst: Decimal; sgst: Decimal };
}

const INPUT_GST_RATE = new Decimal("0.18");

export function summariseGst(input: GstMonthlyInput): GstMonthlySummary {
  const estInputGst = toMoney(input.costOfGoods.mul(INPUT_GST_RATE));
  const diff = toMoney(input.outputGst.minus(estInputGst));
  const netLiability = diff.isNegative() ? ZERO : diff;
  // Intra-state sales are split CGST + SGST 9% each. We surface that
  // split as a hint on the dashboard — actual filing depends on
  // whether each invoice was intra- or inter-state.
  const half = toMoney(netLiability.div(2));
  return {
    taxableValue: input.taxableValue,
    outputGst: input.outputGst,
    estInputGst,
    netLiability,
    netGstSplit: { cgst: half, sgst: half },
  };
}

export interface FilingDeadline {
  form: "GSTR-1" | "GSTR-3B";
  forMonth: string; // YYYY-MM
  due: Date;
  daysAway: number; // negative if overdue
  status: "UPCOMING" | "DUE_SOON" | "OVERDUE";
}

/** GSTR-1 = 11th of next month; GSTR-3B = 20th of next month. */
export function nextDeadlines(now: Date): FilingDeadline[] {
  const out: FilingDeadline[] = [];
  for (let monthsBack = 0; monthsBack < 3; monthsBack++) {
    const target = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - monthsBack,
        1,
      ),
    );
    const ym = `${target.getUTCFullYear()}-${String(
      target.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    const gstr1Due = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 11),
    );
    const gstr3bDue = new Date(
      Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 20),
    );
    for (const [form, due] of [
      ["GSTR-1", gstr1Due] as const,
      ["GSTR-3B", gstr3bDue] as const,
    ]) {
      const daysAway = Math.floor(
        (due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );
      const status: FilingDeadline["status"] =
        daysAway < 0 ? "OVERDUE" : daysAway <= 7 ? "DUE_SOON" : "UPCOMING";
      out.push({ form, forMonth: ym, due, daysAway, status });
    }
  }
  return out
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .filter((d) => d.daysAway >= -30 && d.daysAway <= 45);
}

export function monthLabel(year: number, month: number): string {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return `${monthNames[month]} ${year}`;
}
