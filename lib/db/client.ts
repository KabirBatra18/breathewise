import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.local.example to .env.local.");
}

// Reuse a single pooled client across hot reloads in dev.
const globalForPg = globalThis as unknown as {
  __bw_pg?: ReturnType<typeof postgres>;
};

const client = globalForPg.__bw_pg ?? postgres(url, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForPg.__bw_pg = client;

export const db = drizzle(client, { schema });
