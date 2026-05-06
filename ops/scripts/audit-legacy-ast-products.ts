import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, isNull, like } from "drizzle-orm";
import { products, productCosts, quoteLineItems } from "../db/schema";

/**
 * Read-only audit of the 6 AST- legacy products vs the canonical
 * Astberg-seeded catalog. For each legacy product we look up:
 *  - its current mrp / unit price
 *  - the canonical SKU it shadows
 *  - the canonical SKU's cost (from product_costs)
 *  - how many quote_line_items still reference the legacy id
 *
 * Reports only — does not mutate. Run this first to see the picture
 * before deciding to backfill / merge.
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

  const all = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      mrp: products.mrp,
      defaultUnitPrice: products.defaultUnitPrice,
      isActive: products.isActive,
    })
    .from(products)
    .where(and(isNull(products.deletedAt), like(products.sku, "AST-%")));

  console.log(
    "SKU".padEnd(20) +
      "Status".padEnd(10) +
      "MRP".padStart(12) +
      "  ↔ Canonical".padEnd(20) +
      "Canon cost".padStart(14) +
      "Refs".padStart(8),
  );
  console.log("─".repeat(90));

  for (const legacy of all) {
    const sku = legacy.sku ?? "(no sku)";
    const canonicalSku = LEGACY_TO_CANONICAL[sku];
    let canonCost = "—";
    let canonExists = false;
    if (canonicalSku) {
      const c = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.sku, canonicalSku));
      if (c.length > 0) {
        canonExists = true;
        const cost = await db
          .select({ costPrice: productCosts.costPrice })
          .from(productCosts)
          .where(eq(productCosts.productId, c[0].id));
        if (cost.length > 0) canonCost = `₹${cost[0].costPrice}`;
      }
    }

    const refs = await db
      .select({ id: quoteLineItems.id })
      .from(quoteLineItems)
      .where(eq(quoteLineItems.productId, legacy.id));

    console.log(
      sku.padEnd(20) +
        (legacy.isActive ? "active" : "inactive").padEnd(10) +
        `₹${legacy.mrp ?? "—"}`.padStart(12) +
        `  ↔ ${canonExists ? canonicalSku : "(no match)"}`.padEnd(20) +
        canonCost.padStart(14) +
        String(refs.length).padStart(8),
    );
  }

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
