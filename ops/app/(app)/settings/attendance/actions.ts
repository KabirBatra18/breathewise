"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { attendanceSettings } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

type ActionResult = { ok: true } | { ok: false; error: string };

// Loose IPv4 / IPv6 / hostname pattern — we don't want to lock OWNER
// out of typing a slightly unconventional value (CGN ranges, custom
// public IPs etc). Trim to 64 chars to bound storage.
const IP_PATTERN = /^[0-9a-fA-F.:]{3,64}$/;

const saveSchema = z.object({
  officeLatitude: z.coerce.number().min(-90).max(90).nullable(),
  officeLongitude: z.coerce.number().min(-180).max(180).nullable(),
  officeRadiusMeters: z.coerce.number().int().min(10).max(5000),
  accuracyRejectThresholdM: z.coerce.number().int().min(100).max(5000),
  expectedHoursPerDay: z.coerce.number().min(0.5).max(16),
  weeklyOffsPerWeek: z.coerce.number().int().min(0).max(7),
  paidLeavesPerMonth: z.coerce.number().min(0).max(31),
  // Anti-fraud commit 1 (2026-06-22): comma-or-newline-separated list
  // of trusted office public IPs. Empty = IP check disabled (geofence
  // still works). Each entry validated against IP_PATTERN; bad entries
  // are dropped silently so OWNER paste-from-anywhere doesn't error.
  trustedOfficeIps: z
    .string()
    .optional()
    .transform((s) => {
      if (!s) return [];
      return s
        .split(/[\s,]+/)
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0 && IP_PATTERN.test(ip));
    }),
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
    trustedOfficeIps: formData.get("trustedOfficeIps") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  // Audit-fix 2026-06-22: use INSERT ... ON CONFLICT UPDATE so this
  // works even if the singleton row is somehow missing (manual DB
  // cleanup, partial migration). Previously a bare UPDATE would
  // silently 0-rows-affected and the form would say "saved" while
  // nothing changed.
  const settingsValues = {
    officeLatitude:
      data.officeLatitude != null ? String(data.officeLatitude) : null,
    officeLongitude:
      data.officeLongitude != null ? String(data.officeLongitude) : null,
    officeRadiusMeters: data.officeRadiusMeters,
    accuracyRejectThresholdM: data.accuracyRejectThresholdM,
    expectedHoursPerDay: data.expectedHoursPerDay.toFixed(1),
    weeklyOffsPerWeek: data.weeklyOffsPerWeek,
    paidLeavesPerMonth: data.paidLeavesPerMonth.toFixed(1),
    trustedOfficeIps: data.trustedOfficeIps,
  };
  await db
    .insert(attendanceSettings)
    .values({ id: 1, ...settingsValues })
    .onConflictDoUpdate({
      target: attendanceSettings.id,
      set: settingsValues,
    });

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
