import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

// Prefer DATABASE_URL_NON_POOLING for migrations / long-running scripts;
// fall back to POSTGRES_URL_NON_POOLING (Vercel's auto-injected name) and
// finally DATABASE_URL (local).
const url =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.POSTGRES_URL_NON_POOLING;

if (!url) {
  throw new Error(
    "No Postgres URL found. Set DATABASE_URL (local) or let Vercel Postgres inject POSTGRES_URL.",
  );
}

const globalForPg = globalThis as unknown as {
  __bw_pg?: ReturnType<typeof postgres>;
};

const client =
  globalForPg.__bw_pg ??
  postgres(url, {
    max: 5,
    idle_timeout: 20,
    // Vercel Postgres / Neon require SSL; postgres.js auto-detects from URL.
    prepare: false,
  });
if (process.env.NODE_ENV !== "production") globalForPg.__bw_pg = client;

export const db = drizzle(client, { schema });
