import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { asc, sql as drizzleSql } from "drizzle-orm";
import { products } from "../db/schema";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  const rows = await db
    .select({
      category: products.category,
      subcategory: products.subcategory,
      count: drizzleSql<number>`count(*)::int`,
    })
    .from(products)
    .groupBy(products.category, products.subcategory)
    .orderBy(asc(products.category), asc(products.subcategory));

  console.log("category | subcategory | count");
  console.log("---");
  for (const r of rows) {
    console.log(`${r.category} | ${r.subcategory ?? "(null)"} | ${r.count}`);
  }

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
