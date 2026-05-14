import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import {
  productCosts,
  quoteLineItems,
  quoteSections,
  quotes,
  quoteTierFinancials,
} from "../db/schema";
import {
  Decimal,
  ZERO,
  computeFinancials,
  toMoney,
  type SectionInput,
} from "../lib/pricing";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  const qRows = await db
    .select()
    .from(quotes)
    .where(eq(quotes.quoteNumber, "BW-2026-0001"));
  const q = qRows[0];
  if (!q) throw new Error("BW-2026-0001 not found");

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

  console.log("Quote:", q.quoteNumber, "status:", q.status);
  console.log("rough_discount_percent:", q.roughDiscountPercent);
  console.log("discount_target_saving:", q.discountTargetSaving);

  for (const { section, lines } of sectionLines) {
    console.log(
      `\nSection ${section.sectionLetter}: ${section.title} (labour=${section.isLabourStyle}, appliesDisc=${section.appliesDiscount}, gst=${section.gstRate})`,
    );
    for (const l of lines) {
      console.log(
        `  qty=${l.quantity} × ₹${l.unitPrice} | mrp=${l.mrp ?? "-"} | costSnap=${l.costPriceSnapshot ?? "NULL"} | productId=${l.productId ?? "-"}`,
      );
    }
  }

  const snapRows = await db
    .select()
    .from(quoteTierFinancials)
    .where(eq(quoteTierFinancials.quoteId, q.id));
  const snap = snapRows[0];
  console.log("\nSaved snapshot:");
  console.log("  revenuePreDiscount:    ₹", snap?.revenuePreDiscount);
  console.log("  discountAmount:        ₹", snap?.discountAmount);
  console.log("  revenuePostDiscount:   ₹", snap?.revenuePostDiscount);
  console.log("  gstAmount:             ₹", snap?.gstAmount);
  console.log("  totalInvoiceValue:     ₹", snap?.totalInvoiceValue);
  console.log("  costOfGoods:           ₹", snap?.costOfGoods);
  console.log("  grossMargin:           ₹", snap?.grossMargin);
  console.log("  grossMarginPercent:    ", snap?.grossMarginPercent + "%");

  // Fresh recompute
  const isNewModel = q.discountTargetSaving != null;
  const calcInput: SectionInput[] = sectionLines.map(({ section, lines }) => ({
    discountPercent: isNewModel ? "0" : (q.roughDiscountPercent ?? "0"),
    gstRate: section.gstRate,
    isLabourStyle: section.isLabourStyle,
    appliesDiscount: section.appliesDiscount,
    lines: lines.map((l) => ({
      qty: l.quantity,
      unitPrice: l.unitPrice,
      costPriceSnapshot: l.costPriceSnapshot ?? null,
      mrp: l.mrp ?? null,
    })),
  }));

  const target = isNewModel ? new Decimal(q.discountTargetSaving!) : null;
  const fin = computeFinancials(calcInput, target);

  console.log("\nFresh recompute:");
  console.log("  revenuePreDiscount:    ₹", fin.revenuePreDiscount.toFixed(2));
  console.log("  discountAmount:        ₹", fin.discountAmount.toFixed(2));
  console.log("  revenuePostDiscount:   ₹", fin.revenuePostDiscount.toFixed(2));
  console.log("  gstAmount:             ₹", fin.gstAmount.toFixed(2));
  console.log("  totalInvoiceValue:     ₹", fin.totalInvoiceValue.toFixed(2));
  console.log("  goodsRevenuePostDisc:  ₹", fin.goodsRevenuePostDiscount.toFixed(2));
  console.log("  costOfGoods:           ₹", fin.costOfGoods.toFixed(2));
  console.log("  grossMargin:           ₹", fin.grossMargin.toFixed(2));
  console.log("  grossMarginPercent:    ", fin.grossMarginPercent.toFixed(2) + "%");
  console.log("  labourTotal:           ₹", fin.labourTotal.toFixed(2));

  // Detect lines with null cost snapshot
  const allLines = sectionLines.flatMap(({ lines }) => lines);
  const missingCost = allLines.filter(
    (l) => l.productId && !l.costPriceSnapshot,
  );
  if (missingCost.length > 0) {
    console.log(
      "\n⚠ Lines with productId but no costPriceSnapshot:",
      missingCost.length,
    );
    for (const l of missingCost) {
      const cpRows = await db
        .select()
        .from(productCosts)
        .where(eq(productCosts.productId, l.productId!));
      const cp = cpRows[0];
      console.log(
        `  productId=${l.productId} qty=${l.quantity} | current cost=${cp?.costPrice ?? "null"}`,
      );
    }
  }

  // Detect drifts
  console.log("\nDrifts (saved − fresh):");
  if (snap) {
    const fields = [
      ["revenuePreDiscount", snap.revenuePreDiscount, fin.revenuePreDiscount],
      ["discountAmount", snap.discountAmount, fin.discountAmount],
      ["revenuePostDiscount", snap.revenuePostDiscount, fin.revenuePostDiscount],
      ["gstAmount", snap.gstAmount, fin.gstAmount],
      ["totalInvoiceValue", snap.totalInvoiceValue, fin.totalInvoiceValue],
      ["costOfGoods", snap.costOfGoods, fin.costOfGoods],
      ["grossMargin", snap.grossMargin, fin.grossMargin],
    ] as const;
    for (const [name, savedStr, fresh] of fields) {
      const saved = new Decimal(savedStr);
      const d = saved.minus(fresh);
      if (!d.isZero()) {
        console.log(
          `  ${name}: saved ₹${saved.toFixed(2)} − fresh ₹${fresh.toFixed(2)} = ${d.toFixed(2)}`,
        );
      }
    }
  }

  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
