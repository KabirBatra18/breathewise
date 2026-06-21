"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { attendanceSettings } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

type ActionResult = { ok: true } | { ok: false; error: string };

const saveSchema = z.object({
  officeLatitude: z.coerce.number().min(-90).max(90).nullable(),
  officeLongitude: z.coerce.number().min(-180).max(180).nullable(),
  officeRadiusMeters: z.coerce.number().int().min(10).max(5000),
  accuracyRejectThresholdM: z.coerce.number().int().min(100).max(5000),
  expectedHoursPerDay: z.coerce.number().min(0.5).max(16),
  weeklyOffsPerWeek: z.coerce.number().int().min(0).max(7),
  paidLeavesPerMonth: z.coerce.number().min(0).max(31),
});

export async function saveAttendanceSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  // Empty strings for lat/lng → null (OWNER clearing the office config).
  const rawLat = formData.get("officeLatitude");
  const rawLng = formData.get("officeLongitude");
  const parsed = saveSchema.safeParse({
    officeLatitude: rawLat === "" || rawLat == null ? null : rawLat,
    officeLongitude: rawLng === "" || rawLng == null ? null : rawLng,
    officeRadiusMeters: formData.get("officeRadiusMeters"),
    accuracyRejectThresholdM: formData.get("accuracyRejectThresholdM"),
    expectedHoursPerDay: formData.get("expectedHoursPerDay"),
    weeklyOffsPerWeek: formData.get("weeklyOffsPerWeek"),
    paidLeavesPerMonth: formData.get("paidLeavesPerMonth"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  await db
    .update(attendanceSettings)
    .set({
      officeLatitude:
        data.officeLatitude != null ? String(data.officeLatitude) : null,
      officeLongitude:
        data.officeLongitude != null ? String(data.officeLongitude) : null,
      officeRadiusMeters: data.officeRadiusMeters,
      accuracyRejectThresholdM: data.accuracyRejectThresholdM,
      expectedHoursPerDay: data.expectedHoursPerDay.toFixed(1),
      weeklyOffsPerWeek: data.weeklyOffsPerWeek,
      paidLeavesPerMonth: data.paidLeavesPerMonth.toFixed(1),
    })
    .where(eq(attendanceSettings.id, 1));

  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_SETTINGS_UPDATE",
    entityType: "attendance_settings",
    entityId: null,
    metadata: { ...data },
  });
  revalidatePath("/settings/attendance");
  revalidatePath("/attendance");
  revalidatePath("/attendance/admin");
  return { ok: true };
}
