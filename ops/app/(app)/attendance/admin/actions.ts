"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { attendanceDays } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

/**
 * OWNER-side actions for the attendance system: approve/reject off-site
 * punches, manually edit a missed checkout, and override a day's credit
 * for an approved leave or correction.
 *
 * Employee-side actions are in app/(app)/attendance/actions.ts. The
 * client-side employee punch never reaches these endpoints; they're
 * gated by requireOwner().
 */

type ActionResult = { ok: true } | { ok: false; error: string };

// ─── approveDayPunchAction ──────────────────────────────────────────────
// Flips a PENDING check_in or check_out to OWNER_APPROVED. If both punches
// on a day are pending, OWNER can approve them independently or together.
const approveSchema = z.object({
  dayId: z.string().uuid(),
  scope: z.enum(["CHECK_IN", "CHECK_OUT", "BOTH"]),
  note: z.string().trim().max(500).optional(),
});

export async function approveDayPunchAction(
  input: z.input<typeof approveSchema>,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  const [day] = await db
    .select()
    .from(attendanceDays)
    .where(eq(attendanceDays.id, data.dayId))
    .limit(1);
  if (!day) return { ok: false, error: "Day not found." };

  // Audit-fix 2026-06-22: refuse to approve a punch that's already
  // OWNER_REJECTED (would silently no-op + write a misleading audit
  // log entry). If OWNER changed their mind, they should explicitly
  // re-open the day via a different action; auto-flipping rejected
  // → approved is a workflow ambiguity we don't want.
  const scopeTargets: Array<"CHECK_IN" | "CHECK_OUT"> =
    data.scope === "BOTH" ? ["CHECK_IN", "CHECK_OUT"] : [data.scope];
  for (const target of scopeTargets) {
    const currentStatus =
      target === "CHECK_IN" ? day.checkInStatus : day.checkOutStatus;
    if (currentStatus === "OWNER_REJECTED") {
      return {
        ok: false,
        error: `This ${target.toLowerCase().replace("_", " ")} is already rejected. To re-open, ask the employee to re-punch (currently no UI for un-rejecting — by design).`,
      };
    }
    if (currentStatus === "OWNER_APPROVED") {
      return {
        ok: false,
        error: `This ${target.toLowerCase().replace("_", " ")} is already approved.`,
      };
    }
    if (currentStatus !== "PENDING") {
      return {
        ok: false,
        error: `Nothing to approve — ${target.toLowerCase().replace("_", " ")} status is ${currentStatus ?? "not set"}.`,
      };
    }
  }

  const patch: Record<string, unknown> = {
    approvedBy: actor.id,
    approvedAt: new Date(),
    approvalNote: data.note ?? null,
  };
  if (data.scope === "CHECK_IN" || data.scope === "BOTH") {
    patch.checkInStatus = "OWNER_APPROVED";
  }
  if (data.scope === "CHECK_OUT" || data.scope === "BOTH") {
    patch.checkOutStatus = "OWNER_APPROVED";
  }

  await db
    .update(attendanceDays)
    .set(patch)
    .where(eq(attendanceDays.id, data.dayId));

  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_APPROVE",
    entityType: "attendance_day",
    entityId: data.dayId,
    metadata: { scope: data.scope, note: data.note ?? null },
  });
  revalidatePath("/attendance/admin");
  revalidatePath("/attendance");
  return { ok: true };
}

// ─── rejectDayPunchAction ───────────────────────────────────────────────
// Marks the punch as OWNER_REJECTED. The day_credit math at month-end
// will skip rejected days (they don't count toward salary).
const rejectSchema = z.object({
  dayId: z.string().uuid(),
  scope: z.enum(["CHECK_IN", "CHECK_OUT", "BOTH"]),
  note: z.string().trim().min(1).max(500),
});

export async function rejectDayPunchAction(
  input: z.input<typeof rejectSchema>,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  const [day] = await db
    .select()
    .from(attendanceDays)
    .where(eq(attendanceDays.id, data.dayId))
    .limit(1);
  if (!day) return { ok: false, error: "Day not found." };

  const patch: Record<string, unknown> = {
    approvedBy: actor.id,
    approvedAt: new Date(),
    approvalNote: data.note,
  };
  if (data.scope === "CHECK_IN" || data.scope === "BOTH") {
    patch.checkInStatus = "OWNER_REJECTED";
  }
  if (data.scope === "CHECK_OUT" || data.scope === "BOTH") {
    patch.checkOutStatus = "OWNER_REJECTED";
  }

  await db
    .update(attendanceDays)
    .set(patch)
    .where(eq(attendanceDays.id, data.dayId));

  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_REJECT",
    entityType: "attendance_day",
    entityId: data.dayId,
    metadata: { scope: data.scope, note: data.note },
  });
  revalidatePath("/attendance/admin");
  return { ok: true };
}

// ─── editDayCheckoutAction ──────────────────────────────────────────────
// When the employee forgot to punch out. OWNER types in the actual time
// they left and the system recomputes hours_worked + day_credit.
const editCheckoutSchema = z.object({
  dayId: z.string().uuid(),
  // ISO 8601 datetime string — OWNER's UI provides a datetime picker.
  checkOutAt: z.string().datetime(),
  note: z.string().trim().max(500).optional(),
});

export async function editDayCheckoutAction(
  input: z.input<typeof editCheckoutSchema>,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = editCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  const [day] = await db
    .select()
    .from(attendanceDays)
    .where(eq(attendanceDays.id, data.dayId))
    .limit(1);
  if (!day) return { ok: false, error: "Day not found." };
  if (!day.checkInAt) {
    return {
      ok: false,
      error: "Can't set checkout — this day has no check-in either.",
    };
  }

  const { computeHoursWorked, dayCredit } = await import(
    "@/lib/attendance/credit"
  );
  const { attendanceSettings } = await import("@/db/schema");
  const [settings] = await db
    .select()
    .from(attendanceSettings)
    .where(eq(attendanceSettings.id, 1))
    .limit(1);
  const expected = Number(settings?.expectedHoursPerDay ?? 4);
  const newCheckOut = new Date(data.checkOutAt);
  // Audit-fix 2026-06-22: reject futuristic checkouts. The OWNER could
  // otherwise type 2099-12-31, producing ~600,000 hours → 150,000 day
  // credit → numeric(3,1) truncation either errors or silently writes
  // 999.9.
  const now = new Date();
  if (newCheckOut.getTime() > now.getTime() + 5 * 60 * 1000) {
    return {
      ok: false,
      error:
        "Checkout time can't be in the future. Pick a time that's already passed.",
    };
  }
  // Reject checkouts more than 24h after check-in. A real worked day
  // is at most ~12-16 hours; anything beyond a day boundary is almost
  // certainly an OWNER typo + would produce an absurd credit value.
  const checkInMs = day.checkInAt.getTime();
  const maxCheckOutMs = checkInMs + 24 * 60 * 60 * 1000;
  if (newCheckOut.getTime() > maxCheckOutMs) {
    return {
      ok: false,
      error:
        "Checkout can't be more than 24 hours after check-in. Double-check the time you typed.",
    };
  }
  const hours = computeHoursWorked(day.checkInAt, newCheckOut);
  if (hours == null) {
    return {
      ok: false,
      error: "Checkout time must be after check-in time.",
    };
  }
  const credit = dayCredit(hours, expected);

  await db
    .update(attendanceDays)
    .set({
      checkOutAt: newCheckOut,
      // Status is set to OWNER_APPROVED — this was a manual entry, not
      // a captured punch, so we can't geofence it. Trust the OWNER.
      checkOutStatus: "OWNER_APPROVED",
      hoursWorked: hours.toFixed(2),
      dayCredit: credit.toFixed(1),
      approvedBy: actor.id,
      approvedAt: new Date(),
      approvalNote: data.note ?? "Manual checkout fix",
    })
    .where(eq(attendanceDays.id, data.dayId));

  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_MANUAL_CHECKOUT",
    entityType: "attendance_day",
    entityId: data.dayId,
    metadata: { checkOutAt: data.checkOutAt, note: data.note ?? null },
  });
  revalidatePath("/attendance/admin");
  return { ok: true };
}
