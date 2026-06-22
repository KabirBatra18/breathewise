"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  employeePayrollSettings,
  payrollPayments,
  users,
} from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

type ActionResult = { ok: true } | { ok: false; error: string };

// ─── savePayrollSettingsAction ──────────────────────────────────────────
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

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, data.userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "OWNER")
    return { ok: false, error: "OWNER accounts aren't payroll-tracked." };

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
      joinedOn: data.joinedOn,
    },
  });
  revalidatePath("/payroll");
  revalidatePath("/attendance/admin/grid");
  return { ok: true };
}

// ─── markPayrollPaidAction ──────────────────────────────────────────────
// Locks the salary calc for an employee's pay cycle. Snapshots all the
// numbers as they were at the moment of payment so future retroactive
// overrides don't shift the recorded amount.
const markPaidSchema = z.object({
  userId: z.string().uuid(),
  payDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  expectedCredits: z.coerce.number().min(0),
  actualCredits: z.coerce.number().min(0),
  monthlySalary: z.coerce.number().min(0),
  computedAmount: z.coerce.number().min(0),
  paidAmount: z.coerce.number().min(0),
  notes: z.string().trim().max(500).optional(),
});

export async function markPayrollPaidAction(
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = markPaidSchema.safeParse({
    userId: formData.get("userId"),
    payDate: formData.get("payDate"),
    periodStart: formData.get("periodStart"),
    periodEnd: formData.get("periodEnd"),
    expectedCredits: formData.get("expectedCredits"),
    actualCredits: formData.get("actualCredits"),
    monthlySalary: formData.get("monthlySalary"),
    computedAmount: formData.get("computedAmount"),
    paidAmount: formData.get("paidAmount"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  // Idempotent — if a row already exists for this (user, payDate),
  // treat as success without overwriting (which would let OWNER
  // accidentally double-write a higher amount).
  const existing = await db
    .select({ id: payrollPayments.id })
    .from(payrollPayments)
    .where(
      and(
        eq(payrollPayments.userId, data.userId),
        eq(payrollPayments.payDate, data.payDate),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return {
      ok: false,
      error: "This cycle was already marked paid. To correct, delete the existing record first (Owner-only DB action).",
    };
  }

  await db.insert(payrollPayments).values({
    userId: data.userId,
    payDate: data.payDate,
    periodStart: data.periodStart,
    periodEnd: data.periodEnd,
    expectedCredits: data.expectedCredits.toFixed(2),
    actualCredits: data.actualCredits.toFixed(2),
    monthlySalaryAtPayment: data.monthlySalary.toFixed(2),
    computedAmount: data.computedAmount.toFixed(2),
    paidAmount: data.paidAmount.toFixed(2),
    notes: data.notes ?? null,
    paidBy: actor.id,
  });

  await audit({
    actorId: actor.id,
    action: "PAYROLL_PAID",
    entityType: "user",
    entityId: data.userId,
    metadata: {
      payDate: data.payDate,
      paidAmount: data.paidAmount,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
    },
  });
  revalidatePath("/payroll");
  return { ok: true };
}
