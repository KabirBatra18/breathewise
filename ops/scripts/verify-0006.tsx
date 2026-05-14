import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, sql as drizzleSql } from "drizzle-orm";
import { products, clients, companySettings } from "../db/schema";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  // 1. HSN backfill spread
  const hsnGroups = await db
    .select({
      hsn: products.hsnCode,
      n: drizzleSql<number>`count(*)::int`,
    })
    .from(products)
    .groupBy(products.hsnCode)
    .orderBy(asc(products.hsnCode));
  console.log("Products by HSN:");
  for (const g of hsnGroups) console.log(`  ${g.hsn ?? "(null)"} → ${g.n}`);

  // 2. Spot-check some product HSN assignments
  const spotCheck = await db
    .select({ sku: products.sku, name: products.name, hsn: products.hsnCode })
    .from(products)
    .where(drizzleSql`hsn_code IN ('8415','8421')`)
    .orderBy(asc(products.sku))
    .limit(20);
  console.log("\nSample non-default HSN assignments:");
  for (const r of spotCheck)
    console.log(`  ${r.sku} | ${r.name} → ${r.hsn}`);

  // 3. Clients with state_code populated
  const clientCodes = await db
    .select({
      state: clients.state,
      code: clients.stateCode,
      n: drizzleSql<number>`count(*)::int`,
    })
    .from(clients)
    .groupBy(clients.state, clients.stateCode)
    .orderBy(asc(clients.state));
  console.log("\nClients by state → state_code:");
  for (const c of clientCodes)
    console.log(`  ${c.state ?? "(null)"} → ${c.code ?? "(null)"} | ${c.n}`);

  // 4. Company settings
  const cs = await db.select().from(companySettings);
  console.log("\nCompany settings (state + bank):");
  for (const c of cs) {
    console.log(`  state=${c.state} state_code=${c.stateCode} pan=${c.pan ?? "null"}`);
    console.log(`  bank=${c.bankName ?? "null"} | ac=${c.bankAccount ?? "null"} | ifsc=${c.bankIfsc ?? "null"}`);
  }

  // 5. Invoice number function smoke test
  const numRows = await sql`SELECT next_invoice_number('BW', 2026) AS n` as { n: string }[];
  console.log("\nnext_invoice_number('BW', 2026) →", numRows[0].n);
  // No commit so this rolls back. Just confirming the function works.

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
