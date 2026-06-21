"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { attendancePublicHolidays } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

type ActionResult = { ok: true } | { ok: false; error: string };

const declareSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD"),
  name: z.string().trim().min(1).max(120),
  note: z.string().trim().max(500).optional(),
});

export async function declareHolidayAction(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = declareSchema.safeParse({
    date: formData.get("date"),
    name: formData.get("name"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  const existing = await db
    .select({ id: attendancePublicHolidays.id })
    .from(attendancePublicHolidays)
    .where(eq(attendancePublicHolidays.date, data.date))
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      error: `${data.date} is already declared as a public holiday.`,
    };
  }
  const [row] = await db
    .insert(attendancePublicHolidays)
    .values({
      date: data.date,
      name: data.name,
      note: data.note ?? null,
      declaredBy: actor.id,
    })
    .returning({ id: attendancePublicHolidays.id });

  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_HOLIDAY_DECLARE",
    entityType: "attendance_public_holiday",
    entityId: row?.id ?? null,
    metadata: { date: data.date, name: data.name },
  });
  revalidatePath("/attendance/admin");
  revalidatePath("/attendance/admin/grid");
  return { ok: true };
}

export async function deleteHolidayAction(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  // Audit-fix 2026-06-22: use safeParse to match every other action's
  // error-shape contract. Previously .parse() threw, which the calling
  // client component (HolidayManager) couldn't handle gracefully.
  const idParse = z.string().uuid().safeParse(formData.get("id"));
  if (!idParse.success) {
    return { ok: false, error: "Invalid holiday id." };
  }
  const id = idParse.data;

  // Look up the row first so we can include its details in the audit
  // metadata (useful when OWNER wonders why a credit total changed in
  // a prior month). Returns the row if found, undefined otherwise.
  const [row] = await db
    .select()
    .from(attendancePublicHolidays)
    .where(eq(attendancePublicHolidays.id, id))
    .limit(1);
  if (!row) {
    // Idempotent — treat as success so a double-click doesn't error.
    return { ok: true };
  }

  await db
    .delete(attendancePublicHolidays)
    .where(eq(attendancePublicHolidays.id, id));
  await audit({
    actorId: actor.id,
    action: "ATTENDANCE_HOLIDAY_DELETE",
    entityType: "attendance_public_holiday",
    entityId: id,
    metadata: { date: row.date as unknown as string, name: row.name },
  });
  revalidatePath("/attendance/admin");
  revalidatePath("/attendance/admin/grid");
  return { ok: true };
}
