"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { termsClauses } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(4000),
  category: z.string().trim().min(1).max(80).default("General"),
  appliesTo: z.enum(["ROUGH", "PRECISE", "BOTH"]).default("BOTH"),
  isDefault: z.coerce.boolean().default(false),
});

export type UpsertTermResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function upsertTermAction(
  input: z.input<typeof upsertSchema>,
): Promise<UpsertTermResult> {
  const actor = await requireOwner();
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;

  if (data.id) {
    await db
      .update(termsClauses)
      .set({
        title: data.title,
        body: data.body,
        category: data.category,
        appliesTo: data.appliesTo,
        isDefault: data.isDefault,
        updatedAt: new Date(),
      })
      .where(eq(termsClauses.id, data.id));
    await audit({
      actorId: actor.id,
      action: "TERM_UPDATE",
      entityType: "term",
      entityId: data.id,
      metadata: { title: data.title },
    });
    revalidatePath("/terms");
    revalidatePath("/quotes/new");
    return { ok: true, id: data.id };
  }

  // Append at the bottom by default — sortOrder = max+1.
  const maxRow = await db
    .select({
      m: sql<number>`COALESCE(MAX(${termsClauses.sortOrder}), 0)`,
    })
    .from(termsClauses);
  const nextOrder = (maxRow[0]?.m ?? 0) + 1;

  const [row] = await db
    .insert(termsClauses)
    .values({
      title: data.title,
      body: data.body,
      category: data.category,
      appliesTo: data.appliesTo,
      isDefault: data.isDefault,
      sortOrder: nextOrder,
    })
    .returning({ id: termsClauses.id });

  await audit({
    actorId: actor.id,
    action: "TERM_CREATE",
    entityType: "term",
    entityId: row.id,
    metadata: { title: data.title },
  });
  revalidatePath("/terms");
  revalidatePath("/quotes/new");
  return { ok: true, id: row.id };
}

export async function deleteTermAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = z.string().uuid().parse(formData.get("id"));
  // Soft delete so existing quote snapshots don't lose their FK target.
  await db
    .update(termsClauses)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(termsClauses.id, id));
  await audit({
    actorId: actor.id,
    action: "TERM_DELETE",
    entityType: "term",
    entityId: id,
  });
  revalidatePath("/terms");
  revalidatePath("/quotes/new");
}

export async function reorderTermsAction(
  ids: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireOwner();
  // Re-rank by the supplied id order.
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(termsClauses)
        .set({ sortOrder: i + 1, updatedAt: new Date() })
        .where(eq(termsClauses.id, ids[i]));
    }
  });
  revalidatePath("/terms");
  return { ok: true };
}
