import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * Vercel cron target — keeps the Supabase free-tier project from
 * auto-pausing after ~7 days of zero DB activity. Triggered daily by
 * the cron entry in vercel.json (path: /api/cron/db-ping).
 *
 * Auth: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to its
 * own cron calls in production. We verify the header to keep the
 * endpoint from being public — adversarial traffic isn't a big DoS
 * risk (it's literally a SELECT 1) but a public DB-ping is also a
 * fingerprint, and there's no reason to leave it open.
 *
 * Locally / in dev where CRON_SECRET is unset, we skip the check so
 * `curl localhost:3000/api/cron/db-ping` still works for testing.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
  } catch (err) {
    // If the ping itself fails the DB is already paused or unhealthy.
    // Returning 500 surfaces this in Vercel's cron logs so it's
    // visible at a glance.
    return NextResponse.json(
      {
        ok: false,
        error: (err as Error).message ?? "unknown",
        latencyMs: Date.now() - start,
      },
      { status: 500 },
    );
  }
  return NextResponse.json({
    ok: true,
    latencyMs: Date.now() - start,
    ts: new Date().toISOString(),
  });
}
