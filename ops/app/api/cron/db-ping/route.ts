import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

/**
 * Vercel cron target — keeps the Supabase free-tier project from
 * auto-pausing after ~7 days of zero DB activity. Triggered daily by
 * the cron entry in vercel.json (path: /api/cron/db-ping).
 *
 * The query is intentionally trivial — a single SELECT 1 round-trip
 * is enough for Supabase to count as activity and reset its pause
 * timer. Endpoint is unauthenticated on purpose: the payload is
 * non-sensitive ({ok, latencyMs, ts}) and even adversarial traffic
 * just keeps the DB warm, which is what we want.
 *
 * Set `dynamic = "force-dynamic"` so Next doesn't try to statically
 * render this at build time.
 */
export const dynamic = "force-dynamic";

export async function GET() {
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
