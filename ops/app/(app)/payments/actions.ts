"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { payments, quotes } from "@/db/schema";
import { requireEmployeeOrAbove } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

const PAYMENT_TYPES = [
  "ADVANCE",
  "INTERIM",
  "FINAL",
  "FULL",
  "REFUND",
] as const;
const PAYMENT_MODES = [
  "BANK_TRANSFER",
  "UPI",
  "CHEQUE",
  "CASH",
  "CARD",
  "OTHER",
] as const;

export const PAYMENT_TYPE_LABELS: Record<(typeof PAYMENT_TYPES)[number], string> = {
  ADVANCE: "Advance",
  INTERIM: "Interim",
  FINAL: "Final",
  FULL: "Full payment",
  REFUND: "Refund",
};
export const PAYMENT_MODE_LABELS: Record<(typeof PAYMENT_MODES)[number], string> = {
  BANK_TRANSFER: "Bank transfer",
  UPI: "UPI",
  CHEQUE: "Cheque",
  CASH: "Cash",
  CARD: "Card",
  OTHER: "Other",
};

const addSchema = z.object({
  quoteId: z.string().uuid(),
  paymentType: z.enum(PAYMENT_TYPES),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be positive"),
  paymentMode: z.enum(PAYMENT_MODES).optional(),
  referenceNumber: z.string().trim().max(120).optional(),
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  notes: z.string().trim().max(2000).optional(),
});

export type AddPaymentResult = { ok: true; id: string } | { ok: false; error: string };

export async function addPaymentAction(
  input: z.input<typeof addSchema>,
): Promise<AddPaymentResult> {
  const actor = await requireEmployeeOrAbove();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const q = await db.query.quotes.findFirst({
    where: eq(quotes.id, data.quoteId),
  });
  if (!q) return { ok: false, error: "Quote not found" };

  const [row] = await db
    .insert(payments)
    .values({
      quoteId: data.quoteId,
      paymentType: data.paymentType,
      amount: data.amount,
      paymentMode: data.paymentMode ?? null,
      referenceNumber: data.referenceNumber || null,
      // The DB column is timestamp; coerce the YYYY-MM-DD form into a
      // date at IST start-of-day so the row sorts correctly per day.
      receivedAt: new Date(`${data.receivedAt}T00:00:00+05:30`),
      notes: data.notes || null,
      recordedBy: actor.id,
    })
    .returning({ id: payments.id });

  // Auto-bump status from ACCEPTED → ADVANCE_PAID on the first payment.
  if (q.status === "ACCEPTED" && data.paymentType === "ADVANCE") {
    await db
      .update(quotes)
      .set({ status: "ADVANCE_PAID" })
      .where(eq(quotes.id, q.id));
  }

  await audit({
    actorId: actor.id,
    action: "PAYMENT_ADD",
    entityType: "payment",
    entityId: row.id,
    metadata: {
      quoteId: data.quoteId,
      type: data.paymentType,
      amount: data.amount,
      mode: data.paymentMode ?? null,
    },
  });

  revalidatePath("/payments");
  revalidatePath(`/quotes/${data.quoteId}`);
  revalidatePath("/dashboard");
  return { ok: true, id: row.id };
}

export async function deletePaymentAction(formData: FormData): Promise<void> {
  const actor = await requireEmployeeOrAbove();
  const id = z.string().uuid().parse(formData.get("id"));
  const quoteId = z.string().uuid().parse(formData.get("quoteId"));
  await db.delete(payments).where(eq(payments.id, id));
  await audit({
    actorId: actor.id,
    action: "PAYMENT_DELETE",
    entityType: "payment",
    entityId: id,
    metadata: { quoteId },
  });
  revalidatePath("/payments");
  revalidatePath(`/quotes/${quoteId}`);
  revalidatePath("/dashboard");
}
