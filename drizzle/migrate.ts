import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });

const MIGRATIONS = [
  "0000_initial_schema.sql",
  "0001_seed_data.sql",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is missing. Copy .env.local.example to .env.local and fill it in.",
    );
  }

  const sql = postgres(url, { max: 1, onnotice: () => {} });

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
