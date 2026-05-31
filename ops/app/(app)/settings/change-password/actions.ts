"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { audit } from "@/lib/audit/log";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "At least 8 characters").max(256),
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  });

export type ChangePasswordState = { ok: boolean; error?: string };

export async function changeOwnPasswordAction(
  _prev: ChangePasswordState | null,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireAuth();
  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const matches = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!matches) {
    return { ok: false, error: "Current password is incorrect." };
  }

  const newHash = await hashPassword(parsed.data.newPassword);
  await db
    .update(users)
    .set({ passwordHash: newHash, mustChangePassword: false })
    .where(eq(users.id, user.id));

  await audit({
    actorId: user.id,
    action: "USER_CHANGE_OWN_PW",
    entityType: "user",
    entityId: user.id,
    metadata: {},
  });

  redirect("/dashboard");
}
