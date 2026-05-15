import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });

  // Confirm 0007 was applied
  const migs = (await sql`SELECT name FROM _bw_migrations ORDER BY name`) as {
    name: string;
  }[];
  console.log("Applied migrations:");
  for (const m of migs) console.log(`  ${m.name}`);

  // Confirm new columns exist on invoices
  const cols = (await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'invoices'
      AND column_name IN ('round_off', 'delivery_address', 'delivery_state', 'delivery_state_code', 'total_invoice_value')
    ORDER BY column_name
  `) as {
    column_name: string;
    data_type: string;
    is_nullable: string;
    column_default: string | null;
  }[];
  console.log("\ninvoices columns added by 0007:");
  for (const c of cols)
    console.log(
      `  ${c.column_name.padEnd(22)} ${c.data_type.padEnd(20)} null=${c.is_nullable} default=${c.column_default ?? "(none)"}`,
    );

  // Confirm next_invoice_number works
  const r = (await sql`SELECT next_invoice_number('BW', 2026) AS n`) as {
    n: string;
  }[];
  console.log(`\nnext_invoice_number('BW', 2026) → ${r[0]?.n}`);

  // Check that no existing invoice rows would be broken
  const count = (await sql`SELECT COUNT(*)::int AS n FROM invoices`) as {
    n: number;
  }[];
  console.log(`\nExisting invoices in DB: ${count[0]?.n ?? 0}`);

  await sql.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
