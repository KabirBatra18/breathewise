import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import {
  clients,
  companySettings,
  invoices,
  quotes,
} from "../db/schema";

async function main() {
  const url =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING!;
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  console.log("=== Company settings ===");
  const settings = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, 1));
  const s = settings[0];
  console.log(`  legalName: ${s?.legalName}`);
  console.log(`  state: ${s?.state ?? "(NULL)"}`);
  console.log(`  stateCode: ${s?.stateCode ?? "(NULL)"}`);
  console.log(`  gstin: ${s?.gstin ?? "(NULL)"}`);
  console.log(`  pan: ${s?.pan ?? "(NULL)"}`);
  console.log(`  bankName: ${s?.bankName ?? "(NULL)"}`);

  console.log("\n=== ACCEPTED quotes ===");
  const acceptedQuotes = await db
    .select()
    .from(quotes)
    .where(eq(quotes.status, "ACCEPTED"));
  for (const q of acceptedQuotes) {
    console.log(`\n  Quote ${q.quoteNumber}:`);
    console.log(`    discountTargetSaving: ${q.discountTargetSaving ?? "null"}`);
    console.log(`    roughDiscountPercent: ${q.roughDiscountPercent}`);
    const cl = await db.select().from(clients).where(eq(clients.id, q.clientId));
    const c = cl[0];
    if (c) {
      console.log(`    client.name: ${c.name}`);
      console.log(`    client.state: ${c.state ?? "(NULL)"}`);
      console.log(`    client.stateCode: ${c.stateCode ?? "(NULL)"}`);
      console.log(`    client.gstin: ${c.gstin ?? "(NULL)"}`);
    }
    // Check if invoice already exists for this quote
    const invs = await db.select().from(invoices).where(eq(invoices.quoteId, q.id));
    console.log(`    invoices already created: ${invs.length}`);
    for (const inv of invs) {
      console.log(`      - ${inv.id} status=${inv.status} number=${inv.invoiceNumber ?? "(none)"}`);
    }
  }

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
