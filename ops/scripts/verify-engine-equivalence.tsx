import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import {
  quoteLineItems,
  quoteSections,
  quotes,
} from "../db/schema";
import {
  computeQuoteTotals,
  computeQuoteTotalsForTarget,
  type SectionInput,
} from "../lib/pricing";

/**
 * Verifies — without mutating anything — that for every quote with
 * a non-zero `rough_discount_percent`, the new engine
 * (`computeQuoteTotalsForTarget`) reproduces the legacy engine's
 * (`computeQuoteTotals` with discountPercent on sections) section
 * totals and grand total to the paisa.
 *
 * If any drift > 0.05 is found we report and bail out — the
 * migration cannot proceed.
 */

async function main() {
  const url =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  const targetQuotes = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      discountPercent: quotes.roughDiscountPercent,
    })
    .from(quotes);

  console.log(`Inspecting ${targetQuotes.length} quotes…\n`);
  let allGood = true;

  for (const q of targetQuotes) {
    const sects = await db
      .select()
      .from(quoteSections)
      .where(eq(quoteSections.quoteId, q.id))
      .orderBy(asc(quoteSections.sortOrder));

    const sectionLines = await Promise.all(
      sects.map(async (s) => ({
        section: s,
        lines: await db
          .select()
          .from(quoteLineItems)
          .where(eq(quoteLineItems.quoteSectionId, s.id))
          .orderBy(asc(quoteLineItems.sortOrder)),
      })),
    );

    const dpct = q.discountPercent ?? "0";

    // Legacy path: discount applied per section.
    const legacyInputs: SectionInput[] = sectionLines.map(
      ({ section, lines }) => ({
        discountPercent: dpct,
        gstRate: section.gstRate,
        isLabourStyle: section.isLabourStyle,
        appliesDiscount: section.appliesDiscount,
        lines: lines.map((l) => ({
          qty: l.quantity,
          unitPrice: l.unitPrice,
          mrp: l.mrp ?? null,
        })),
      }),
    );
    const legacy = computeQuoteTotals(legacyInputs);

    // New path: zero blanket at section level, equivalent target applied.
    const newInputs: SectionInput[] = sectionLines.map(
      ({ section, lines }) => ({
        discountPercent: "0",
        gstRate: section.gstRate,
        isLabourStyle: section.isLabourStyle,
        appliesDiscount: section.appliesDiscount,
        lines: lines.map((l) => ({
          qty: l.quantity,
          unitPrice: l.unitPrice,
          mrp: l.mrp ?? null,
        })),
      }),
    );
    const target = legacy.totalSavingsVsMrp;
    const targeted = computeQuoteTotalsForTarget(newInputs, target);

    const grandDrift = legacy.grandTotal.minus(targeted.grandTotal).abs();
    console.log(
      `${q.quoteNumber}  dpct=${dpct}  legacy=₹${legacy.grandTotal.toFixed(2)}  new=₹${targeted.grandTotal.toFixed(2)}  drift=₹${grandDrift.toFixed(2)}`,
    );

    // Per-section
    for (let i = 0; i < legacy.sections.length; i++) {
      const ls = legacy.sections[i];
      const ns = targeted.sections[i];
      const d = ls.total.minus(ns.total).abs();
      const tag =
        d.lte("0.02") ? "✓" : d.lte("0.05") ? "≈" : "✗ DRIFT";
      console.log(
        `   §${i + 1} ${tag}  legacy ₹${ls.total.toFixed(2)}  new ₹${ns.total.toFixed(2)}  drift ₹${d.toFixed(2)}`,
      );
      if (d.gt("0.05")) allGood = false;
    }
    if (grandDrift.gt("0.05")) allGood = false;
  }

  console.log(
    `\n${allGood ? "✓ All quotes reproducible. Migration is safe." : "✗ Drift > 5 paise on at least one quote. DO NOT migrate."}`,
  );

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
