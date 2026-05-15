import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { quotes } from "../db/schema";
import { asc } from "drizzle-orm";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING!;
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);
  const rows = await db
    .select({ n: quotes.quoteNumber, status: quotes.status })
    .from(quotes)
    .orderBy(asc(quotes.quoteNumber));
  for (const r of rows) console.log(`  ${r.n} → ${r.status}`);
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
