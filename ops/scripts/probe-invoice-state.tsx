import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, desc } from "drizzle-orm";
import { invoices, invoiceLines, clients, quotes, companySettings } from "../db/schema";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING!;
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  console.log("=== All invoices in DB ===");
  const invs = await db.select().from(invoices).orderBy(desc(invoices.createdAt));
  if (invs.length === 0) {
    console.log("  (none — convert action never persisted anything)");
  }
  for (const i of invs) {
    console.log(`\n  ${i.invoiceNumber ?? "(DRAFT no number)"}  status=${i.status}`);
    console.log(`    id: ${i.id}`);
    console.log(`    quote_id: ${i.quoteId}`);
    console.log(`    created_at: ${i.createdAt}`);
    console.log(`    updated_at: ${i.updatedAt ?? "(none)"}`);
    console.log(`    place_of_supply: ${i.placeOfSupply} (${i.placeOfSupplyCode}), interState=${i.isInterState}`);
    const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, i.id));
    console.log(`    invoice_lines: ${lines.length}`);
    for (const l of lines.slice(0, 5)) {
      console.log(`      [${l.sno}] ${l.description?.slice(0, 50)}  qty=${l.quantity} × ₹${l.unitPrice}`);
    }
  }

  console.log("\n=== Convert prerequisites for BW-2026-0001 ===");
  const qRows = await db.select().from(quotes).where(eq(quotes.quoteNumber, "BW-2026-0001"));
  const q = qRows[0];
  console.log(`  quote.status: ${q?.status}`);
  console.log(`  quote.clientId: ${q?.clientId}`);
  if (q) {
    const c = (await db.select().from(clients).where(eq(clients.id, q.clientId)))[0];
    console.log(`  client.name: ${c?.name}`);
    console.log(`  client.state: ${c?.state ?? "(NULL — blocks convert)"}`);
    console.log(`  client.stateCode: ${c?.stateCode ?? "(NULL — auto-derives from state if set)"}`);
  }
  const s = (await db.select().from(companySettings))[0];
  console.log(`  settings.state: ${s?.state}`);
  console.log(`  settings.stateCode: ${s?.stateCode}`);

  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
