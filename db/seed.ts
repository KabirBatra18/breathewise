import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql, eq } from "drizzle-orm";
import { users } from "./schema";

async function main() {
  const url = process.env.DATABASE_URL;
  const username = process.env.SEED_OWNER_USERNAME;
  const password = process.env.SEED_OWNER_PASSWORD;
  const fullName = process.env.SEED_OWNER_FULLNAME;

  if (!url || !username || !password || !fullName) {
    throw new Error(
      "DATABASE_URL, SEED_OWNER_USERNAME, SEED_OWNER_PASSWORD, and SEED_OWNER_FULLNAME must all be set in .env.local",
    );
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username));

    if (existing.length > 0) {
      console.log(`• owner '${username}' already exists — not touching`);
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await db.insert(users).values({
      username,
      passwordHash,
      fullName,
      role: "OWNER",
    });
    console.log(`✓ seeded OWNER user '${username}'`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
