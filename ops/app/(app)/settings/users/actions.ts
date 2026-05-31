"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { hashPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit/log";

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

const createSchema = z.object({
  username: z.string().regex(USERNAME_RE, "3-32 letters, digits, . _ -"),
  fullName: z.string().trim().min(1).max(100),
  role: z.enum(["EMPLOYEE", "VIEWER"]),
  password: z.string().min(6, "At least 6 characters").max(256),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function createUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = createSchema.safeParse({
    username: formData.get("username"),
    fullName: formData.get("fullName"),
    role: formData.get("role"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.username, parsed.data.username),
  });
  if (existing) {
    return { ok: false, error: "Username already exists." };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const inserted = await db
    .insert(users)
    .values({
      username: parsed.data.username,
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      passwordHash,
      mustChangePassword: true,
      createdBy: actor.id,
    })
    .returning({ id: users.id });

  await audit({
    actorId: actor.id,
    action: "USER_CREATE",
    entityType: "user",
    entityId: inserted[0]?.id ?? null,
    metadata: {
      username: parsed.data.username,
      role: parsed.data.role,
    },
  });

  revalidatePath("/settings/users");
  return { ok: true };
}

const resetSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6, "At least 6 characters").max(256),
});

export async function resetPasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = resetSchema.safeParse({
    userId: formData.get("userId"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  await db
    .update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, parsed.data.userId));

  await audit({
    actorId: actor.id,
    action: "USER_RESET_PW",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: {},
  });

  revalidatePath("/settings/users");
  return { ok: true };
}

export async function toggleActiveAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const userId = z.string().uuid().parse(formData.get("userId"));
  if (userId === actor.id) {
    // You can't deactivate yourself — that'd lock the only owner out.
    return;
  }
  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return;
  const nextActive = !target.isActive;
  await db
    .update(users)
    .set({ isActive: nextActive })
    .where(eq(users.id, userId));
  await audit({
    actorId: actor.id,
    action: nextActive ? "USER_REACTIVATE" : "USER_DEACTIVATE",
    entityType: "user",
    entityId: userId,
    metadata: { username: target.username },
  });
  revalidatePath("/settings/users");
}
