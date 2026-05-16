import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { clients, companySettings } from "../db/schema";
import { INDIAN_STATES } from "../lib/gst/state-codes";

/**
 * Walk every row that stores a state name and normalise it to the
 * canonical Title-Case from INDIAN_STATES (e.g. "DELHI" → "Delhi").
 * Prevents the StateSelect from being handed a value that doesn't
 * match any of its SelectItem options, which crashed Base UI.
 */
async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING!;
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  function canonical(s: string | null): string | null {
    if (!s) return null;
    const lower = s.trim().toLowerCase();
    const match = INDIAN_STATES.find((x) => x.name.toLowerCase() === lower);
    return match?.name ?? null;
  }

  // Settings
  const settings = await db.select().from(companySettings);
  for (const s of settings) {
    const c = canonical(s.state);
    if (c && c !== s.state) {
      await db.update(companySettings).set({ state: c }).where(eq(companySettings.id, s.id));
      console.log(`settings: "${s.state}" → "${c}"`);
    }
  }

  // Clients
  const cls = await db.select({ id: clients.id, state: clients.state, name: clients.name }).from(clients);
  for (const cl of cls) {
    const c = canonical(cl.state);
    if (c && c !== cl.state) {
      await db.update(clients).set({ state: c }).where(eq(clients.id, cl.id));
      console.log(`client ${cl.name}: "${cl.state}" → "${c}"`);
    }
  }

  console.log("done.");
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
