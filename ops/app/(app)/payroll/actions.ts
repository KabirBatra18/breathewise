"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { employeePayrollSettings, users } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

type ActionResult = { ok: true } | { ok: false; error: string };

const saveSchema = z.object({
  userId: z.string().uuid(),
  monthlySalary: z.coerce.number().min(0).max(99_999_999),
  joinedOn: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)])
    .optional()
    .transform((v) => (v == null || v === "" ? null : v)),
  isActive: z.coerce.boolean().default(true),
  notes: z.string().trim().max(500).optional(),
});

export async function savePayrollSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = saveSchema.safeParse({
    userId: formData.get("userId"),
    monthlySalary: formData.get("monthlySalary"),
    joinedOn: formData.get("joinedOn") || undefined,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  // Target must be an active non-OWNER user.
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, data.userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "OWNER")
    return { ok: false, error: "OWNER accounts aren't payroll-tracked." };

  // Upsert: insert if no row, otherwise update.
  const existing = await db
    .select()
    .from(employeePayrollSettings)
    .where(eq(employeePayrollSettings.userId, data.userId))
    .limit(1);

  if (existing[0]) {
    await db
      .update(employeePayrollSettings)
      .set({
        monthlySalary: data.monthlySalary.toFixed(2),
        joinedOn: data.joinedOn,
        isActive: data.isActive,
        notes: data.notes ?? null,
      })
      .where(eq(employeePayrollSettings.userId, data.userId));
  } else {
    await db.insert(employeePayrollSettings).values({
      userId: data.userId,
      monthlySalary: data.monthlySalary.toFixed(2),
      joinedOn: data.joinedOn,
      isActive: data.isActive,
      notes: data.notes ?? null,
    });
  }

  await audit({
    actorId: actor.id,
    action: "PAYROLL_SETTINGS_UPDATE",
    entityType: "user",
    entityId: data.userId,
    metadata: {
      monthlySalary: data.monthlySalary,
      isActive: data.isActive,
    },
  });
  revalidatePath("/payroll");
  revalidatePath("/attendance/admin/grid");
  return { ok: true };
}
