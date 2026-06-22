"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  attendanceDays,
  attendancePunches,
  attendanceSettings,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";
import {
  computeHoursWorked,
  dayCredit,
} from "@/lib/attendance/credit";
import { evaluatePunchLocation } from "@/lib/attendance/geofence";
import { istDateString } from "@/lib/attendance/ist-date";

/**
 * Server actions for the attendance system. Two action functions:
 *
 *   • punchAction        — employee taps Check In / Check Out
 *   • recordConsentAction — employee accepts the DPDP location-capture
 *                          banner (one-time per account)
 *
 * The OWNER-side approval/rejection actions live in
 * /attendance/admin/actions.ts (Commit C).
 *
 * Architecture: memory/project_attendance_architecture.md
 */

// ─── punchAction ────────────────────────────────────────────────────────
const punchSchema = z.object({
  kind: z.enum(["CHECK_IN", "CHECK_OUT"]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  // Browser-reported GPS accuracy radius in meters. We reject anything
  // higher than the configured threshold (default 500m).
  accuracy: z.number().nonnegative(),
  // What the BROWSER thinks the wall-clock is. Stored as a forensic
  // signal — if it diverges wildly from captured_at, the device clock
  // may have been tampered with.
  clientLocalTime: z.string().datetime().optional(),
  // Required when the resulting status would be PENDING. UI enforces;
  // server defends.
  offsiteNote: z.string().trim().max(500).optional(),
  // Anonymised browser fingerprint (user-agent string). Helps OWNER
  // spot punches coming from unexpected devices.
  deviceFingerprint: z.string().max(500).optional(),
});

export type PunchInput = z.input<typeof punchSchema>;
export type PunchResult =
  | {
      ok: true;
      status: "AUTO_APPROVED" | "PENDING";
      distanceM: number | null;
      checkInAt: string | null;
      checkOutAt: string | null;
      hoursWorked: number | null;
      dayCredit: number | null;
    }
  | { ok: false; error: string };

export async function punchAction(input: PunchInput): Promise<PunchResult> {
  const actor = await requireAuth();
  // Audit-fix 2026-06-22: VIEWER role is a read-only account (cannot
  // legitimately punch). Reject server-side so even a crafted API
  // call from a stolen viewer session can't generate attendance.
  if (actor.role === "VIEWER") {
    return {
      ok: false,
      error: "Viewer accounts cannot record attendance.",
    };
  }

  // Task-log gate (2026-06-22): block CHECK_IN if there's any prior
  // completed day with no task log. CHECK_OUT is never blocked — the
  // log is filled AFTER check-out, so the gate would create an
  // unbreakable loop if it also blocked there.
  if (input.kind === "CHECK_IN") {
    const { findUnloggedDays } = await import("./task-log-actions");
    const todayIst = istDateString(new Date());
    const unlogged = await findUnloggedDays(actor.id, todayIst);
    if (unlogged.length > 0) {
      return {
        ok: false,
        error: `Please log your tasks for ${unlogged[0].date} before checking in today. Open it from the banner on /attendance.`,
      };
    }
  }
  const parsed = punchSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid punch payload",
    };
  }
  const data = parsed.data;

  // Block punching until the user has accepted the location-capture
  // consent banner (DPDP-Act requirement). UI gates this too but
  // defending server-side prevents bypassing via a crafted API call.
  if (!actor.attendanceConsentAt) {
    return {
      ok: false,
      error:
        "Please accept the location capture consent banner before checking in.",
    };
  }

  // Load settings — singleton row. We always insert id=1 in migration
  // 0017 so this select is guaranteed to find a row.
  const settingsRows = await db
    .select()
    .from(attendanceSettings)
    .where(eq(attendanceSettings.id, 1))
    .limit(1);
  const settings = settingsRows[0];
  if (!settings) {
    return {
      ok: false,
      error: "Attendance is not yet configured. Contact your administrator.",
    };
  }

  // Evaluate geofence. The pure function in lib/attendance/geofence.ts
  // returns one of three outcomes:
  //   AUTO_APPROVED  — inside the office radius, GPS accuracy OK
  //   PENDING        — outside the radius OR office not yet configured
  //   REJECT_UNCERTAIN — GPS accuracy exceeds the threshold (500m default)
  // Anti-fraud (2026-06-22): capture the client's public IP from
  // Vercel's request headers. x-forwarded-for is a comma-separated
  // list with the original client as the FIRST entry; x-real-ip is
  // the resolved single value Vercel adds. Prefer x-real-ip and
  // fall back to the first xff hop.
  const hdrs = headers();
  const xRealIp = hdrs.get("x-real-ip");
  const xff = hdrs.get("x-forwarded-for");
  const clientIp =
    xRealIp?.trim() || xff?.split(",")[0]?.trim() || null;

  // Server-vs-phone clock skew, in ms. >60s skew is a strong tampering
  // signal (mock-clock apps). Stored but not used to auto-reject; OWNER
  // sees it on the admin approval card.
  const clockSkewMs = data.clientLocalTime
    ? Math.abs(Date.now() - new Date(data.clientLocalTime).getTime())
    : null;

  const evaluation = evaluatePunchLocation({
    pointLat: data.lat,
    pointLng: data.lng,
    pointAccuracyM: data.accuracy,
    // Use != null (not truthiness) — an office at the equator (lat 0.0)
    // would otherwise be silently treated as unconfigured because 0 is
    // falsy. Audit-fix from 2026-06-22.
    officeLat:
      settings.officeLatitude != null
        ? Number(settings.officeLatitude)
        : null,
    officeLng:
      settings.officeLongitude != null
        ? Number(settings.officeLongitude)
        : null,
    officeRadiusM: settings.officeRadiusMeters,
    accuracyRejectThresholdM: settings.accuracyRejectThresholdM,
    clientIp,
    trustedOfficeIps: settings.trustedOfficeIps ?? [],
  });
  if (evaluation.status === "REJECT_UNCERTAIN") {
    return {
      ok: false,
      error: `GPS signal is too uncertain (accuracy: ${Math.round(data.accuracy)}m). Step outside or near a window and try again.`,
    };
  }

  // PENDING punches require an offsite note (UI enforces; this is the
  // server-side defence).
  if (evaluation.status === "PENDING") {
    const note = data.offsiteNote?.trim();
    if (!note) {
      return {
        ok: false,
        error:
          "You are outside the office geofence — please add a reason for the off-site punch (e.g. \"Sharma residence install\").",
      };
    }
  }

  // Compute today's IST date — what attendance_days.date should be.
  const today = istDateString(new Date());
  const expectedHoursPerDay = Number(settings.expectedHoursPerDay);

  // Single transaction:
  //   1. Find or insert the day row (atomic via ON CONFLICT — audit-fix).
  //   2. Validate the state machine for this kind of punch.
  //   3. Update the day row with the new check_in_* or check_out_*.
  //   4. Append an audit row in attendance_punches.
  //   5. Return the resulting day row fields.
  const result = await db.transaction(async (tx) => {
    // Atomic upsert via INSERT ... ON CONFLICT DO NOTHING. Audit-fix
    // 2026-06-22: the previous SELECT-then-INSERT pattern was vulnerable
    // to a race where two concurrent punches both see no row, both try
    // to insert, and the second fails with a unique-violation that
    // wasn't being caught. ON CONFLICT DO NOTHING + a follow-up SELECT
    // is atomic at the (user_id, date) unique-constraint level.
    await tx
      .insert(attendanceDays)
      .values({ userId: actor.id, date: today })
      .onConflictDoNothing({
        target: [attendanceDays.userId, attendanceDays.date],
      });
    const dayRows = await tx
      .select()
      .from(attendanceDays)
      .where(
        and(
          eq(attendanceDays.userId, actor.id),
          eq(attendanceDays.date, today),
        ),
      )
      .limit(1);
    const day = dayRows[0];
    if (!day) {
      // Shouldn't happen given the upsert above, but defensive.
      return {
        ok: false as const,
        error: "Couldn't locate today's attendance row. Please try again.",
      };
    }

    if (data.kind === "CHECK_IN") {
      if (day.checkInAt) {
        return {
          ok: false as const,
          error: `You've already checked in today at ${formatTimeIST(day.checkInAt)}. Tap Check Out when you're done.`,
        };
      }
      await tx
        .update(attendanceDays)
        .set({
          checkInAt: new Date(),
          checkInLat: String(data.lat),
          checkInLng: String(data.lng),
          checkInAccuracyM: Math.round(data.accuracy),
          checkInDistanceM: evaluation.distanceM,
          checkInStatus: evaluation.status,
          checkInOffsiteNote: data.offsiteNote?.trim() || null,
          // Anti-fraud forensic signals (commit 1, 2026-06-22)
          checkInIp: clientIp,
          checkInIpMatch: evaluation.ipMatch,
          checkInClockSkewMs: clockSkewMs,
        })
        .where(eq(attendanceDays.id, day.id));
    } else {
      // CHECK_OUT
      if (!day.checkInAt) {
        return {
          ok: false as const,
          error:
            "You can't check out without checking in first today. Tap Check In to start your shift.",
        };
      }
      if (day.checkOutAt) {
        return {
          ok: false as const,
          error: `You've already checked out today at ${formatTimeIST(day.checkOutAt)}.`,
        };
      }
      const now = new Date();
      const hours = computeHoursWorked(day.checkInAt, now);
      const credit =
        hours != null ? dayCredit(hours, expectedHoursPerDay) : null;
      await tx
        .update(attendanceDays)
        .set({
          checkOutAt: now,
          checkOutLat: String(data.lat),
          checkOutLng: String(data.lng),
          checkOutAccuracyM: Math.round(data.accuracy),
          checkOutDistanceM: evaluation.distanceM,
          checkOutStatus: evaluation.status,
          checkOutOffsiteNote: data.offsiteNote?.trim() || null,
          hoursWorked: hours != null ? hours.toFixed(2) : null,
          dayCredit: credit != null ? credit.toFixed(1) : null,
          // Anti-fraud forensic signals (commit 1, 2026-06-22)
          checkOutIp: clientIp,
          checkOutIpMatch: evaluation.ipMatch,
          checkOutClockSkewMs: clockSkewMs,
        })
        .where(eq(attendanceDays.id, day.id));
    }

    // Append audit log. This row is immutable — never updated or deleted
    // (except via day cascade, which only happens if OWNER nukes the day).
    await tx.insert(attendancePunches).values({
      dayId: day.id,
      userId: actor.id,
      kind: data.kind,
      capturedClientTime: data.clientLocalTime
        ? new Date(data.clientLocalTime)
        : null,
      lat: String(data.lat),
      lng: String(data.lng),
      accuracyM: Math.round(data.accuracy),
      distanceFromOfficeM: evaluation.distanceM,
      resultingStatus: evaluation.status,
      deviceFingerprint: data.deviceFingerprint ?? null,
      clientIp,
      ipMatch: evaluation.ipMatch,
      clockSkewMs,
    });

    // Re-read the row for the response.
    const [updated] = await tx
      .select()
      .from(attendanceDays)
      .where(eq(attendanceDays.id, day.id))
      .limit(1);
    return {
      ok: true as const,
      day: updated,
    };
  });

  if (!result.ok) return { ok: false, error: result.error };

  await audit({
    actorId: actor.id,
    action: `ATTENDANCE_${data.kind}`,
    entityType: "attendance_day",
    entityId: result.day.id,
    metadata: {
      status: evaluation.status,
      distanceM: evaluation.distanceM,
      accuracyM: Math.round(data.accuracy),
    },
  });

  revalidatePath("/attendance");
  revalidatePath("/attendance/admin");
  revalidatePath("/my-attendance");

  return {
    ok: true,
    status: evaluation.status,
    distanceM: evaluation.distanceM,
    checkInAt: result.day.checkInAt?.toISOString() ?? null,
    checkOutAt: result.day.checkOutAt?.toISOString() ?? null,
    hoursWorked:
      result.day.hoursWorked != null ? Number(result.day.hoursWorked) : null,
    dayCredit:
      result.day.dayCredit != null ? Number(result.day.dayCredit) : null,
  };
}

// ─── recordConsentAction ────────────────────────────────────────────────
// One-time-per-user action that records the user's acceptance of the
// DPDP-Act location capture banner.
export async function recordConsentAction(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const actor = await requireAuth();
  // Same rationale as punchAction — VIEWER accounts don't punch.
  if (actor.role === "VIEWER") {
    return {
      ok: false,
      error: "Viewer accounts cannot record attendance.",
    };
  }
  if (actor.attendanceConsentAt) {
    // Idempotent — they've already accepted. No-op.
    return { ok: true };
  }
  // The `users` table import is local to keep the action file tight.
  const { users } = await import("@/db/schema");
  await db
    .update(users)
    .set({ attendanceConsentAt: new Date() })
    .where(eq(users.id, actor.id));

  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_CONSENT",
    entityType: "user",
    entityId: actor.id,
    metadata: {},
  });
  revalidatePath("/attendance");
  return { ok: true };
}

// ─── helpers ────────────────────────────────────────────────────────────
function formatTimeIST(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
}
