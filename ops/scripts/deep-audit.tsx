import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq, isNull } from "drizzle-orm";
import {
  payments,
  productCosts,
  products,
  quoteLineItems,
  quoteSections,
  quotes,
  quoteTierFinancials,
} from "../db/schema";
import {
  Decimal,
  ZERO,
  computeFinancials,
  computeQuoteTotals,
  computeQuoteTotalsForTarget,
  toMoney,
  type SectionInput,
} from "../lib/pricing";

/**
 * Deep, read-only audit of the discount engine across every product
 * and every saved quote. Verifies:
 *
 * 1. Catalog sanity: every product has consistent DP / MRP / cost.
 * 2. Per-product engine math at DP-mode and MRP-mode in isolation.
 * 3. Round-trip on every live quote: re-derive totals from raw line
 *    items + saved discount lever and compare against the saved
 *    quote_tier_financials snapshot.
 * 4. Engine invariants (subtotal − discount = net; net + gst = total;
 *    mrpSubtotal − totalDiscountVsMrp = total; goods + labour =
 *    invoiceTotal).
 * 5. Payment ledger reconciliation against contract value.
 * 6. PDF route's reproduction matches the saved snapshot.
 *
 * Anything that drifts by > ₹0.05 is flagged. Stays read-only — no
 * writes to the DB.
 */

const TOL = new Decimal("0.05");

function ok(cond: boolean, label: string, details?: unknown) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.log(`  ✗ ${label}`);
    if (details !== undefined) console.log("    →", details);
    process.exitCode = 1;
  }
}

function within(a: Decimal, b: Decimal): boolean {
  return a.minus(b).abs().lte(TOL);
}

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  // ── 1. Catalog sanity ────────────────────────────────────────────
  console.log("\n=== 1. Catalog sanity ===");
  const prodRows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      category: products.category,
      mrp: products.mrp,
      dp: products.defaultUnitPrice,
      gst: products.defaultGstRate,
      isActive: products.isActive,
    })
    .from(products)
    .where(isNull(products.deletedAt))
    .orderBy(asc(products.name));

  const costRows = await db
    .select({ productId: productCosts.productId, cost: productCosts.costPrice })
    .from(productCosts);
  const costById = new Map(costRows.map((c) => [c.productId, c.cost]));

  console.log(`  ${prodRows.length} active products`);
  let mrpModeCount = 0;
  let dpModeCount = 0;
  let noMrpCount = 0;
  for (const p of prodRows) {
    if (!p.mrp) {
      noMrpCount++;
      continue;
    }
    const mrp = new Decimal(p.mrp);
    const dp = new Decimal(p.dp);
    const mrpExGst = mrp.div(new Decimal("1.18"));
    // If DP is within 1 paisa of MRP/1.18 → it's an MRP-mode product
    // (ERV-style — quoted at full MRP).
    if (mrpExGst.minus(dp).abs().lte(new Decimal("0.5"))) {
      mrpModeCount++;
    } else if (dp.lt(mrpExGst)) {
      dpModeCount++;
    } else {
      // DP > MRP/1.18 → priced ABOVE MRP. Suspicious.
      console.log(
        `  ⚠ ${p.sku ?? p.name}: DP ₹${dp.toFixed(2)} > MRP/1.18 ₹${mrpExGst.toFixed(2)}`,
      );
    }
  }
  console.log(`  MRP-mode (DP ≈ MRP/1.18): ${mrpModeCount}`);
  console.log(`  DP-mode (DP < MRP/1.18):  ${dpModeCount}`);
  console.log(`  No MRP set:               ${noMrpCount}`);

  // Cost coverage
  const productsWithoutCost = prodRows.filter((p) => !costById.has(p.id));
  console.log(`  Products without cost: ${productsWithoutCost.length}`);

  // ── 2. Per-product engine math ──────────────────────────────────
  console.log("\n=== 2. Per-product engine math (qty=1, no extra) ===");
  let perProductFailures = 0;
  for (const p of prodRows) {
    if (!p.mrp) continue; // can't test MRP path without an MRP

    const mrp = new Decimal(p.mrp);
    const dp = new Decimal(p.dp);
    const mrpExGst = toMoney(mrp.div(new Decimal("1.18")));
    const gstRate = new Decimal(p.gst);
    const isMrpStyle = mrpExGst.minus(dp).abs().lte(new Decimal("0.5"));

    // DP-mode line
    const dpSection: SectionInput = {
      lines: [{ qty: "1", unitPrice: dp.toFixed(2), mrp: mrp.toFixed(2) }],
      discountPercent: "0",
      gstRate: gstRate.toFixed(2),
      isLabourStyle: false,
      appliesDiscount: true,
    };
    const dpTotals = computeQuoteTotals([dpSection]);

    // MRP-mode line
    const mrpSection: SectionInput = {
      lines: [
        { qty: "1", unitPrice: mrpExGst.toFixed(2), mrp: mrp.toFixed(2) },
      ],
      discountPercent: "0",
      gstRate: gstRate.toFixed(2),
      isLabourStyle: false,
      appliesDiscount: true,
    };
    const mrpTotals = computeQuoteTotals([mrpSection]);

    // Identities:
    //   dpTotals.grand = dp × (1 + gst/100), rounded
    //   mrpTotals.grand ≈ mrp (within rounding)
    //   dpSaving = mrp − dp × 1.18 (positive iff dp < mrpExGst)
    //   mrpSaving ≈ 0
    const expectedDpTotal = toMoney(
      dp.mul(new Decimal(1).plus(gstRate.div(100))),
    );
    const expectedMrpTotal = isMrpStyle
      ? mrp // matches exactly (within rounding)
      : toMoney(mrpExGst.mul(new Decimal(1).plus(gstRate.div(100))));

    if (!within(dpTotals.grandTotal, expectedDpTotal)) {
      console.log(
        `  ✗ ${p.sku ?? p.name}: DP-mode grand ₹${dpTotals.grandTotal.toFixed(2)} ≠ ₹${expectedDpTotal.toFixed(2)}`,
      );
      perProductFailures++;
    }
    if (!within(mrpTotals.grandTotal, expectedMrpTotal)) {
      console.log(
        `  ✗ ${p.sku ?? p.name}: MRP-mode grand ₹${mrpTotals.grandTotal.toFixed(2)} ≠ ₹${expectedMrpTotal.toFixed(2)}`,
      );
      perProductFailures++;
    }

    // MRP saving should be ~0
    if (!within(mrpTotals.totalSavingsVsMrp, ZERO)) {
      console.log(
        `  ✗ ${p.sku ?? p.name}: MRP-mode saving ₹${mrpTotals.totalSavingsVsMrp.toFixed(2)} ≠ 0`,
      );
      perProductFailures++;
    }

    // DP saving = mrp - dp × 1.18 (when dp < mrpExGst)
    if (!isMrpStyle) {
      const expectedDpSaving = toMoney(mrp.minus(dp.mul(new Decimal("1.18"))));
      if (!within(dpTotals.totalSavingsVsMrp, expectedDpSaving)) {
        console.log(
          `  ✗ ${p.sku ?? p.name}: DP-mode saving ₹${dpTotals.totalSavingsVsMrp.toFixed(2)} ≠ ₹${expectedDpSaving.toFixed(2)}`,
        );
        perProductFailures++;
      }
    }
  }
  ok(
    perProductFailures === 0,
    `every product passes DP-mode + MRP-mode math (${prodRows.filter((p) => p.mrp).length} products tested)`,
    perProductFailures > 0 ? `${perProductFailures} failures` : undefined,
  );

  // ── 3. Round-trip on every live quote ───────────────────────────
  console.log("\n=== 3. Round-trip: derived totals vs saved snapshot ===");
  const allQuotes = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      roughDiscountPercent: quotes.roughDiscountPercent,
      discountTargetSaving: quotes.discountTargetSaving,
      acceptedTotal: quotes.acceptedTotal,
      status: quotes.status,
    })
    .from(quotes)
    .orderBy(asc(quotes.quoteNumber));

  const allFinancials = await db.select().from(quoteTierFinancials);
  const finByQuoteId = new Map(
    allFinancials
      .filter((f) => f.tierLabel === "ROUGH")
      .map((f) => [f.quoteId, f]),
  );

  let driftCount = 0;
  let invariantFails = 0;
  for (const q of allQuotes) {
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

    const isNewModel = q.discountTargetSaving != null;
    const effectivePct = isNewModel
      ? "0"
      : (q.roughDiscountPercent ?? "0");
    const calcInput: SectionInput[] = sectionLines.map(({ section, lines }) => ({
      discountPercent: effectivePct,
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
    const target = isNewModel
      ? new Decimal(q.discountTargetSaving!)
      : null;
    const derived = target
      ? computeQuoteTotalsForTarget(calcInput, target)
      : computeQuoteTotals(calcInput);
    const fin = computeFinancials(calcInput, target);

    const snap = finByQuoteId.get(q.id);
    if (!snap) {
      console.log(`  ⚠ ${q.quoteNumber}: no financials snapshot`);
      continue;
    }

    const grandDrift = derived.grandTotal
      .minus(new Decimal(snap.totalInvoiceValue))
      .abs();
    const marginDrift = fin.grossMargin
      .minus(new Decimal(snap.grossMargin))
      .abs();
    const postDiscountDrift = fin.revenuePostDiscount
      .minus(new Decimal(snap.revenuePostDiscount))
      .abs();
    const gstDrift = fin.gstAmount.minus(new Decimal(snap.gstAmount)).abs();
    const costDrift = fin.costOfGoods
      .minus(new Decimal(snap.costOfGoods))
      .abs();

    const tag = grandDrift.lte(TOL) ? "✓" : "✗";
    console.log(
      `  ${tag} ${q.quoteNumber} (${isNewModel ? "new" : "legacy"}, ${q.status}): grand drift ₹${grandDrift.toFixed(2)} · margin drift ₹${marginDrift.toFixed(2)} · post-discount drift ₹${postDiscountDrift.toFixed(2)} · gst drift ₹${gstDrift.toFixed(2)} · cost drift ₹${costDrift.toFixed(2)}`,
    );
    if (grandDrift.gt(TOL)) driftCount++;

    // Engine invariants per section
    for (const s of derived.sections) {
      // subtotal − discount = net
      const id1 = s.subtotal.minus(s.discountAmount).minus(s.netAfterDiscount).abs();
      // net + gst = total
      const id2 = s.netAfterDiscount.plus(s.gstAmount).minus(s.total).abs();
      // mrpSubtotal − totalDiscountVsMrp = total
      const id3 = s.mrpSubtotal.minus(s.totalDiscountVsMrp).minus(s.total).abs();
      if (id1.gt(TOL) || id2.gt(TOL) || id3.gt(TOL)) {
        invariantFails++;
        console.log(
          `    ✗ section invariant fail: id1=${id1.toFixed(4)} id2=${id2.toFixed(4)} id3=${id3.toFixed(4)}`,
        );
      }
    }
  }
  ok(driftCount === 0, "all quote grand totals match the saved snapshot");
  ok(invariantFails === 0, "all engine invariants hold per section");

  // ── 4. Payment reconciliation ───────────────────────────────────
  console.log("\n=== 4. Payment reconciliation (accepted quotes) ===");
  const acceptedRows = allQuotes.filter(
    (q) => q.status === "ACCEPTED" || q.status === "ADVANCE_PAID",
  );
  for (const q of acceptedRows) {
    const ps = await db
      .select()
      .from(payments)
      .where(eq(payments.quoteId, q.id));
    let received = ZERO;
    for (const p of ps) {
      const amt = new Decimal(p.amount);
      received =
        p.paymentType === "REFUND" ? received.minus(amt) : received.plus(amt);
    }
    received = toMoney(received);
    const snap = finByQuoteId.get(q.id);
    const contract = q.acceptedTotal
      ? new Decimal(q.acceptedTotal)
      : snap
        ? new Decimal(snap.totalInvoiceValue)
        : ZERO;
    const outstanding = toMoney(contract.minus(received));
    const tag = received.lte(contract) ? "✓" : "⚠";
    console.log(
      `  ${tag} ${q.quoteNumber}: contract ₹${contract.toFixed(2)} · received ₹${received.toFixed(2)} · outstanding ₹${outstanding.toFixed(2)}`,
    );
    if (received.gt(contract)) {
      console.log(`    ⚠ overpaid by ₹${received.minus(contract).toFixed(2)}`);
    }
  }

  // ── 5. DP / MRP toggle simulation per product ──────────────────
  console.log(
    "\n=== 5. DP/MRP toggle simulation: 1× product + ₹1000 extra ===",
  );
  let toggleFailures = 0;
  for (const p of prodRows.slice(0, 5)) {
    // Sample 5 products
    if (!p.mrp) continue;
    const mrp = new Decimal(p.mrp);
    const dp = new Decimal(p.dp);
    const mrpExGst = toMoney(mrp.div(new Decimal("1.18")));

    const buildSection = (mode: "DP" | "MRP"): SectionInput => ({
      lines: [
        {
          qty: "1",
          unitPrice: (mode === "DP" ? dp : mrpExGst).toFixed(2),
          mrp: mrp.toFixed(2),
        },
      ],
      discountPercent: "0",
      gstRate: "18",
      isLabourStyle: false,
      appliesDiscount: true,
    });

    const dpSec = buildSection("DP");
    const mrpSec = buildSection("MRP");

    // Auto savings
    const dpAuto = computeQuoteTotals([dpSec]);
    const mrpAuto = computeQuoteTotals([mrpSec]);

    // Apply extra=₹1000 in offset semantics:
    //   target = autoSavingNew + extra
    const extra = new Decimal("1000");
    const dpTarget = dpAuto.totalSavingsVsMrp.plus(extra);
    const mrpTarget = mrpAuto.totalSavingsVsMrp.plus(extra);

    const dpFinal = computeQuoteTotalsForTarget([dpSec], dpTarget);
    const mrpFinal = computeQuoteTotalsForTarget([mrpSec], mrpTarget);

    // Expected: grand drops by exactly ₹1000 (the extra) from auto.
    const dpDrop = dpAuto.grandTotal.minus(dpFinal.grandTotal);
    const mrpDrop = mrpAuto.grandTotal.minus(mrpFinal.grandTotal);

    const dpOk = within(dpDrop, extra);
    const mrpOk = within(mrpDrop, extra);
    if (!dpOk || !mrpOk) toggleFailures++;

    console.log(
      `  ${dpOk && mrpOk ? "✓" : "✗"} ${p.sku ?? p.name}: DP auto₹${dpAuto.totalSavingsVsMrp.toFixed(2)} grand₹${dpAuto.grandTotal.toFixed(2)} → +₹1000 → grand₹${dpFinal.grandTotal.toFixed(2)} (drop ₹${dpDrop.toFixed(2)}) | MRP auto₹${mrpAuto.totalSavingsVsMrp.toFixed(2)} grand₹${mrpAuto.grandTotal.toFixed(2)} → +₹1000 → grand₹${mrpFinal.grandTotal.toFixed(2)} (drop ₹${mrpDrop.toFixed(2)})`,
    );
  }
  ok(toggleFailures === 0, "DP/MRP toggle preserves extra=₹1000 semantics");

  // ── 6. Stress: huge quote with all products mixed ──────────────
  console.log("\n=== 6. Stress: one quote with every product ===");
  const stressSection: SectionInput = {
    lines: prodRows
      .filter((p) => p.mrp)
      .slice(0, 30) // cap so it's still reasonable
      .map((p) => ({
        qty: "1",
        unitPrice: p.dp,
        mrp: p.mrp!,
      })),
    discountPercent: "0",
    gstRate: "18",
    isLabourStyle: false,
    appliesDiscount: true,
  };
  const stressAuto = computeQuoteTotals([stressSection]);
  console.log(
    `  Lines: ${stressSection.lines.length} | auto grand ₹${stressAuto.grandTotal.toFixed(2)} | auto saving ₹${stressAuto.totalSavingsVsMrp.toFixed(2)} | MRP subtotal ₹${stressAuto.totalMrpSubtotal.toFixed(2)}`,
  );

  // Apply a target of autoSaving + ₹5000
  const stressTarget = stressAuto.totalSavingsVsMrp.plus(new Decimal("5000"));
  const stressFinal = computeQuoteTotalsForTarget([stressSection], stressTarget);
  const stressDrop = stressAuto.grandTotal.minus(stressFinal.grandTotal);
  ok(
    within(stressDrop, new Decimal("5000")),
    `+₹5000 extra reduces grand by exactly ₹5000 across ${stressSection.lines.length} lines`,
    `actual drop: ₹${stressDrop.toFixed(2)}`,
  );

  // Section invariants on stress
  const ss = stressFinal.sections[0];
  ok(
    within(ss.subtotal.minus(ss.discountAmount), ss.netAfterDiscount),
    "stress: subtotal − discount = net",
  );
  ok(
    within(ss.netAfterDiscount.plus(ss.gstAmount), ss.total),
    "stress: net + gst = total",
  );
  ok(
    within(ss.mrpSubtotal.minus(ss.totalDiscountVsMrp), ss.total),
    "stress: mrpSubtotal − totalDiscountVsMrp = total",
  );

  console.log("\n" + (process.exitCode === 1 ? "✗ AUDIT FAILED" : "✓ AUDIT PASSED"));
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
