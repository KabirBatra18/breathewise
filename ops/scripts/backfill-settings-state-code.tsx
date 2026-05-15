import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { companySettings } from "../db/schema";
import { deriveStateCode } from "../lib/gst/state-codes";

async function main() {
  const url =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING!;
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  const settings = await db
    .select()
    .from(companySettings)
    .where(eq(companySettings.id, 1));
  const s = settings[0];
  if (!s) {
    console.log("No company_settings row");
    await sql.end();
    return;
  }
  console.log(
    `Before: state=${s.state ?? "null"}, stateCode=${s.stateCode ?? "null"}`,
  );
  if (s.state && !s.stateCode) {
    const derived = deriveStateCode(s.state);
    if (derived) {
      await db
        .update(companySettings)
        .set({ stateCode: derived })
        .where(eq(companySettings.id, 1));
      console.log(`After: stateCode=${derived} ✓`);
    } else {
      console.log(`Could not derive state code from "${s.state}"`);
    }
  } else if (s.stateCode) {
    console.log("Already set — nothing to do");
  }
  await sql.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
