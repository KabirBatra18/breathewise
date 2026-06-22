"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  attendanceDays,
  attendanceTaskLogs,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * End-of-day task log server actions.
 *
 * Two functions:
 *   • saveTaskLogAction — employee submits the hourly entries for a
 *     specific day. Replace-all semantics: delete all existing rows
 *     for the day then re-insert the new set (atomic).
 *   • findUnloggedDays — server-side helper used by /attendance to
 *     gate the next Check In on prior days being logged.
 *
 * The gating logic: an attendance_day is "unlogged" if it has both
 * check_in_at AND check_out_at set, AND zero rows exist in
 * attendance_task_logs for that day_id. Days with no check-out (e.g.
 * forgotten checkouts) don't count — they're a separate problem
 * surfaced via the yesterday-banner.
 */

const bucketSchema = z.object({
  hourStart: z.string().datetime(),
  hourEnd: z.string().datetime(),
  description: z.string().trim().max(500).default(""),
});

const saveSchema = z.object({
  dayId: z.string().uuid(),
  buckets: z.array(bucketSchema).min(1).max(24),
});

export async function saveTaskLogAction(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult> {
  const actor = await requireAuth();
  if (actor.role === "VIEWER") {
    return { ok: false, error: "Viewer accounts cannot log tasks." };
  }
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  // Verify this day belongs to the calling user — otherwise an
  // employee could log tasks against another employee's day-id (got
  // from anywhere). Defensive.
  const [day] = await db
    .select()
    .from(attendanceDays)
    .where(eq(attendanceDays.id, data.dayId))
    .limit(1);
  if (!day) return { ok: false, error: "Day not found." };
  if (day.userId !== actor.id && actor.role !== "OWNER") {
    return { ok: false, error: "You can only log tasks for your own day." };
  }
  if (!day.checkInAt || !day.checkOutAt) {
    return {
      ok: false,
      error:
        "Day has no check-out yet. Finish the day first by tapping Check Out.",
    };
  }

  // Validate each bucket: hourStart < hourEnd, both inside the work
  // window. Bucket validation catches client-side bug or tampering.
  const checkInMs = day.checkInAt.getTime();
  const checkOutMs = day.checkOutAt.getTime();
  for (const b of data.buckets) {
    const startMs = new Date(b.hourStart).getTime();
    const endMs = new Date(b.hourEnd).getTime();
    if (startMs >= endMs) {
      return { ok: false, error: "Bucket start must be before bucket end." };
    }
    if (startMs < checkInMs - 60_000 || endMs > checkOutMs + 60_000) {
      return {
        ok: false,
        error: "Bucket falls outside the checked-in/checked-out window.",
      };
    }
  }

  // Atomic replace: delete existing rows + insert new ones in a
  // single transaction. The (day_id, hour_start) unique constraint
  // would otherwise refuse re-saves.
  await db.transaction(async (tx) => {
    await tx
      .delete(attendanceTaskLogs)
      .where(eq(attendanceTaskLogs.dayId, data.dayId));
    if (data.buckets.length > 0) {
      await tx.insert(attendanceTaskLogs).values(
        data.buckets.map((b) => ({
          dayId: data.dayId,
          userId: day.userId,
          hourStart: new Date(b.hourStart),
          hourEnd: new Date(b.hourEnd),
          description: b.description,
        })),
      );
    }
  });

  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_TASK_LOG_SAVE",
    entityType: "attendance_day",
    entityId: data.dayId,
    metadata: { bucketCount: data.buckets.length },
  });
  revalidatePath("/attendance");
  revalidatePath("/my-attendance");
  revalidatePath("/attendance/admin");
  revalidatePath("/attendance/admin/grid");
  return { ok: true };
}

/**
 * Returns the IDs + dates of completed days (have both punches) that
 * have ZERO task log entries. Caller scopes to a single user.
 *
 * The query uses LEFT JOIN + GROUP BY HAVING count(logs.id) = 0 — fast
 * enough at our scale (a single user has ~22 days/month), and
 * idx_attendance_task_logs_day covers the join side.
 */
export async function findUnloggedDays(
  userId: string,
  todayIstDate: string,
): Promise<
  Array<{
    dayId: string;
    date: string;
    checkInAt: string;
    checkOutAt: string;
  }>
> {
  // Pull completed days (have check_out) STRICTLY before today, with
  // no task logs.
  const completed = await db
    .select({
      id: attendanceDays.id,
      date: attendanceDays.date,
      checkInAt: attendanceDays.checkInAt,
      checkOutAt: attendanceDays.checkOutAt,
    })
    .from(attendanceDays)
    .where(
      and(
        eq(attendanceDays.userId, userId),
        isNotNull(attendanceDays.checkInAt),
        isNotNull(attendanceDays.checkOutAt),
        ne(attendanceDays.date, todayIstDate),
      ),
    )
    .orderBy(asc(attendanceDays.date));

  if (completed.length === 0) return [];

  // For each, check if task logs exist. N+1 query — fine at our scale
  // (a single user has ~22 days/month; unlogged subset is typically
  // 0-3). Optimise to a single GROUP BY HAVING when scale demands.
  const results: Array<{
    dayId: string;
    date: string;
    checkInAt: string;
    checkOutAt: string;
  }> = [];
  for (const d of completed) {
    const [row] = await db
      .select({ id: attendanceTaskLogs.id })
      .from(attendanceTaskLogs)
      .where(eq(attendanceTaskLogs.dayId, d.id))
      .limit(1);
    if (!row && d.checkInAt && d.checkOutAt) {
      results.push({
        dayId: d.id,
        date: d.date as unknown as string,
        checkInAt: d.checkInAt.toISOString(),
        checkOutAt: d.checkOutAt.toISOString(),
      });
    }
  }
  return results;
}

// Re-export isNull for the rare caller; we use it inside.
export { isNull };

/**
 * Returns this user's distinct task-log descriptions from the trailing
 * 14 days. Used to populate a <datalist> for autocomplete in the
 * TaskLogForm — typing 3 chars suggests recent entries so common tasks
 * ("Sharma residence install", "Office paperwork") are 1-tap to refill.
 *
 * Bounded to 50 suggestions; orders by recency. Empty strings excluded.
 */
export async function loadRecentTaskDescriptions(
  userId: string,
): Promise<string[]> {
  const { sql, gte, ne } = await import("drizzle-orm");
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      description: attendanceTaskLogs.description,
      hourStart: attendanceTaskLogs.hourStart,
    })
    .from(attendanceTaskLogs)
    .where(
      and(
        eq(attendanceTaskLogs.userId, userId),
        gte(attendanceTaskLogs.hourStart, fourteenDaysAgo),
        ne(attendanceTaskLogs.description, ""),
      ),
    )
    .orderBy(sql`${attendanceTaskLogs.hourStart} DESC`)
    .limit(200);
  // De-dupe while preserving recency order (the first occurrence wins).
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const d = r.description.trim();
    if (!d || seen.has(d.toLowerCase())) continue;
    seen.add(d.toLowerCase());
    out.push(d);
    if (out.length >= 50) break;
  }
  return out;
}
