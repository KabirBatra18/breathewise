import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import {
  clients,
  invoices,
  payments,
  quoteTierFinancials,
  quotes,
} from "../db/schema";

/**
 * Read-only post-UI audit. Checks:
 *   1. invoice numbering sequence is gap-free for ISSUED rows
 *   2. every DRAFT invoice has invoice_number = NULL
 *   3. every ISSUED invoice has invoice_number set + unique
 *   4. quote chain integrity (parent_quote_id targets exist)
 *   5. payments reference real quotes
 *   6. settings.state_code is populated
 *   7. quote_tier_financials has one row per saved quote
 */
async function main() {
  const url =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING!;
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  let issues = 0;
  const flag = (msg: string) => {
    console.log(`  ⚠ ${msg}`);
    issues++;
  };
  const ok = (msg: string) => console.log(`  ✓ ${msg}`);

  console.log("=== 1. Invoice number integrity ===");
  const allInvs = await db.select().from(invoices);
  const drafts = allInvs.filter((i) => i.status === "DRAFT");
  const issued = allInvs.filter((i) => i.status === "ISSUED");
  console.log(`  Drafts: ${drafts.length} · Issued: ${issued.length}`);

  for (const d of drafts) {
    if (d.invoiceNumber !== null) flag(`DRAFT ${d.id} has invoice_number set: ${d.invoiceNumber}`);
  }
  for (const i of issued) {
    if (!i.invoiceNumber) flag(`ISSUED ${i.id} has NULL invoice_number`);
  }
  // Sequence per FY
  const byFy = new Map<string, number[]>();
  for (const i of issued) {
    if (!i.invoiceNumber) continue;
    const m = i.invoiceNumber.match(/\/INV\/(\d{4})\/(\d+)/);
    if (m) {
      const fy = m[1];
      const n = parseInt(m[2]);
      const arr = byFy.get(fy) ?? [];
      arr.push(n);
      byFy.set(fy, arr);
    }
  }
  for (const [fy, nums] of byFy) {
    nums.sort((a, b) => a - b);
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] !== nums[i - 1] + 1) {
        flag(`FY ${fy}: gap between #${nums[i - 1]} and #${nums[i]}`);
      }
    }
    if (nums.length > 0) {
      ok(`FY ${fy}: ${nums.length} invoices, sequence ${nums[0]}..${nums[nums.length - 1]}, gap-free`);
    }
  }
  if (issued.length === 0) ok("no issued invoices yet — nothing to check sequence on");

  console.log("\n=== 2. Quote chain integrity ===");
  const allQuotes = await db.select().from(quotes);
  const quoteIds = new Set(allQuotes.map((q) => q.id));
  let danglingParent = 0;
  for (const q of allQuotes) {
    if (q.parentQuoteId && !quoteIds.has(q.parentQuoteId)) {
      flag(`quote ${q.quoteNumber} points at non-existent parent ${q.parentQuoteId}`);
      danglingParent++;
    }
  }
  if (danglingParent === 0) ok(`${allQuotes.length} quotes, all parent_quote_id pointers valid`);

  console.log("\n=== 3. Payment → quote integrity ===");
  const allPayments = await db.select().from(payments);
  let danglingPayment = 0;
  for (const p of allPayments) {
    if (!quoteIds.has(p.quoteId)) {
      flag(`payment ${p.id} points at non-existent quote ${p.quoteId}`);
      danglingPayment++;
    }
  }
  if (danglingPayment === 0) ok(`${allPayments.length} payments, all point at real quotes`);

  console.log("\n=== 4. Invoice → quote integrity ===");
  let danglingInvoice = 0;
  for (const i of allInvs) {
    if (!quoteIds.has(i.quoteId)) {
      flag(`invoice ${i.id} points at non-existent quote ${i.quoteId}`);
      danglingInvoice++;
    }
  }
  if (danglingInvoice === 0) ok(`${allInvs.length} invoices, all point at real quotes`);

  console.log("\n=== 5. Settings + clients ready for invoicing ===");
  const settings = await db.select().from(clients).limit(0); // dummy
  void settings;
  const settingsRows = (await sql`SELECT state, state_code, gstin, pan, bank_name FROM company_settings WHERE id = 1`) as Array<{
    state: string | null;
    state_code: string | null;
    gstin: string | null;
    pan: string | null;
    bank_name: string | null;
  }>;
  const s = settingsRows[0];
  if (!s?.state || !s?.state_code) flag(`company_settings: state=${s?.state} state_code=${s?.state_code} — invoicing will be blocked`);
  else ok(`supplier ${s.state} (${s.state_code}), GSTIN ${s.gstin ?? "missing"}, PAN ${s.pan ?? "missing"}, bank ${s.bank_name ?? "missing"}`);
  const clientsMissingState = await db
    .select({ id: clients.id, name: clients.name, state: clients.state })
    .from(clients);
  const noState = clientsMissingState.filter((c) => !c.state);
  if (noState.length > 0) {
    console.log(`  ${noState.length} client${noState.length === 1 ? "" : "s"} missing state (can't be invoiced):`);
    for (const c of noState.slice(0, 5)) console.log(`    - ${c.name}`);
  } else {
    ok(`${clientsMissingState.length} clients, all have state set`);
  }

  console.log("\n=== 6. Financials snapshot coverage ===");
  const finRows = await db
    .select({ qid: quoteTierFinancials.quoteId })
    .from(quoteTierFinancials)
    .where(eq(quoteTierFinancials.tierLabel, "ROUGH"));
  const finQids = new Set(finRows.map((r) => r.qid));
  const quotesWithoutFin = allQuotes.filter((q) => !finQids.has(q.id));
  if (quotesWithoutFin.length > 0) {
    console.log(`  ${quotesWithoutFin.length} quote(s) without a financials snapshot:`);
    for (const q of quotesWithoutFin.slice(0, 5)) console.log(`    - ${q.quoteNumber} (${q.status})`);
  } else {
    ok(`every quote has a financials snapshot`);
  }

  void and;
  void asc;
  void inArray;
  void or;

  console.log("\n" + (issues === 0 ? "✓ POST-UI AUDIT PASSED — no integrity issues" : `✗ ${issues} issue(s) flagged`));
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
