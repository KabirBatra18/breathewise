import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull } from "drizzle-orm";
import { auditLog, products, productCosts, quoteLineItems } from "../db/schema";

/**
 * One-shot migration: collapse the 6 AST- legacy product duplicates
 * onto their canonical Astberg-seeded twins.
 *
 * For each legacy product:
 *   1. Re-point any quote_line_items.product_id at the canonical id
 *   2. Backfill quote_line_items.cost_price_snapshot from the canonical
 *      product_costs.cost_price (so margin recomputes correctly on
 *      existing quotes that referenced the legacy SKU).
 *   3. Soft-deactivate the legacy product (is_active=false). We DON'T
 *      hard-delete in case a future audit needs the row.
 *
 * Idempotent: running twice does nothing on the second run because
 * legacy rows are already inactive and quote_line_items already point
 * at canonical ids.
 */

const LEGACY_TO_CANONICAL: Record<string, string> = {
  "AST-AEE-150": "AEE-150",
  "AST-AHT15-34": "AHT-15-34",
  "AST-COWL-100": "ASC-100-P",
  "AST-COWL-150": "ASC-150-P",
  "AST-DIFF-100": "ADD-100",
  "AST-ERV-AHE50": "AHE-50THP",
};

async function main() {
  const url =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  let totalLineMigrations = 0;
  let totalDeactivations = 0;

  for (const [legacySku, canonicalSku] of Object.entries(LEGACY_TO_CANONICAL)) {
    const legacy = await db
      .select({ id: products.id, isActive: products.isActive })
      .from(products)
      .where(and(eq(products.sku, legacySku), isNull(products.deletedAt)));
    if (legacy.length === 0) {
      console.log(`  · ${legacySku}: not found, skipping`);
      continue;
    }
    const canonical = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.sku, canonicalSku), isNull(products.deletedAt)));
    if (canonical.length === 0) {
      console.warn(
        `  ⚠ ${legacySku}: canonical ${canonicalSku} not found, skipping`,
      );
      continue;
    }
    const legacyId = legacy[0].id;
    const canonicalId = canonical[0].id;

    const cost = await db
      .select({ costPrice: productCosts.costPrice })
      .from(productCosts)
      .where(eq(productCosts.productId, canonicalId));
    const canonCost = cost[0]?.costPrice ?? null;

    // 1 + 2: re-point references and backfill snapshot.
    const linesToMove = await db
      .select({ id: quoteLineItems.id })
      .from(quoteLineItems)
      .where(eq(quoteLineItems.productId, legacyId));
    if (linesToMove.length > 0) {
      await db
        .update(quoteLineItems)
        .set({
          productId: canonicalId,
          ...(canonCost ? { costPriceSnapshot: canonCost } : {}),
        })
        .where(eq(quoteLineItems.productId, legacyId));
      totalLineMigrations += linesToMove.length;
      console.log(
        `  ✓ ${legacySku} → ${canonicalSku}: re-pointed ${linesToMove.length} line(s)` +
          (canonCost ? ` + cost snapshot ₹${canonCost}` : ""),
      );
    } else {
      console.log(`  · ${legacySku} → ${canonicalSku}: no references, just deactivating`);
    }

    // 3: deactivate the legacy product.
    if (legacy[0].isActive) {
      await db
        .update(products)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(products.id, legacyId));
      totalDeactivations++;
    }
  }

  // Audit log entry capturing the migration. Acts as the durable
  // record of what we did, who did it (script — actorId null), when,
  // and counts.
  await db.insert(auditLog).values({
    actorId: null,
    action: "PRODUCT_LEGACY_AST_MIGRATION",
    entityType: "product",
    entityId: null,
    metadata: {
      mappings: LEGACY_TO_CANONICAL,
      lineMigrations: totalLineMigrations,
      deactivations: totalDeactivations,
    },
  });

  console.log("\nDone.");
  console.log(`  Total quote-line references re-pointed: ${totalLineMigrations}`);
  console.log(`  Total legacy products deactivated:      ${totalDeactivations}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
