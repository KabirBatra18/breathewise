import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, like } from "drizzle-orm";
import { products } from "../db/schema";

/**
 * Reclassify Energy Recovery Ventilators (AHE-* SKUs) from HSN 8415
 * (air-conditioning machines) to HSN 8414 (fans/blowers/ventilation).
 * Same 18% GST rate, but 8414 matches the auditor expectation for
 * a ventilation device — auditors flag 8415 as inconsistent with
 * the rest of the catalog (which is already on 8414).
 *
 * Catalog-only change. Already-issued invoices keep their frozen
 * hsn_code snapshot — they're legally immutable.
 */
async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING!;
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  const before = await db
    .select({ id: products.id, sku: products.sku, name: products.name, hsnCode: products.hsnCode })
    .from(products)
    .where(and(like(products.sku, "AHE-%"), eq(products.hsnCode, "8415")));

  if (before.length === 0) {
    console.log("Nothing to update — no AHE-* products on 8415.");
    await sql.end();
    return;
  }

  console.log(`Will flip ${before.length} AHE-* products from 8415 → 8414:`);
  for (const p of before) console.log(`  ${p.sku} — ${p.name}`);

  await db
    .update(products)
    .set({ hsnCode: "8414" })
    .where(and(like(products.sku, "AHE-%"), eq(products.hsnCode, "8415")));

  console.log("done.");
  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
