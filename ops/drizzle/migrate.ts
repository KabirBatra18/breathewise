import { config } from "dotenv";
import fs from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

config({ path: ".env.local" });

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

/**
 * Auto-discover migration files in ./drizzle so adding a new
 * NNNN_*.sql file is enough — you don't have to also remember to
 * append to a hardcoded array (which was the silent-no-op trap we
 * hit shipping migration 0009 → 0011).
 *
 * Sort lexicographically on the leading sequence. The filename
 * format is fixed at NNNN_description.sql (zero-padded), so a plain
 * sort gives the right order through 9999 migrations.
 */
async function discoverMigrations(): Promise<string[]> {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries
    .filter((name) => /^\d{4}_[\w-]+\.sql$/.test(name))
    .sort();
}

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

    const migrations = await discoverMigrations();
    if (migrations.length === 0) {
      throw new Error(`No migration files found in ${MIGRATIONS_DIR}`);
    }

    for (const name of migrations) {
      if (applied.has(name)) {
        console.log(`• ${name} — already applied, skipping`);
        continue;
      }
      const file = await fs.readFile(path.join(MIGRATIONS_DIR, name), "utf8");
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
