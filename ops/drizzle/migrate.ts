import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });

const MIGRATIONS = [
  "0000_initial_schema.sql",
  "0001_seed_data.sql",
  "0002_products_subcategory.sql",
  "0003_quotes_accepted_total.sql",
  "0004_quotes_show_savings_on_pdf.sql",
  "0005_quotes_discount_target_saving.sql",
  "0006_invoice_compliance.sql",
  "0007_invoice_round_off_and_ship_to.sql",
  "0008_invoice_drafts.sql",
  "0009_invoice_date_of_removal.sql",
  "0010_invoice_cancel.sql",
  "0011_quotes_project_docs.sql",
];

async function main() {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error(
      "No Postgres URL set. Provide DATABASE_URL (local) or POSTGRES_URL_NON_POOLING (Vercel).",
    );
  }

  const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });

  try {
    await sql`CREATE TABLE IF NOT EXISTS _bw_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    const applied = new Set<string>(
      (await sql`SELECT name FROM _bw_migrations`).map((row) => row.name as string),
    );

    for (const name of MIGRATIONS) {
      if (applied.has(name)) {
        console.log(`• ${name} — already applied, skipping`);
        continue;
      }
      const file = await fs.readFile(
        path.resolve(process.cwd(), "drizzle", name),
        "utf8",
      );
      console.log(`→ applying ${name}`);
      await sql.begin(async (tx) => {
        await tx.unsafe(file);
        await tx`INSERT INTO _bw_migrations (name) VALUES (${name})`;
      });
      console.log(`✓ ${name}`);
    }

    console.log("\nAll migrations applied.");
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
