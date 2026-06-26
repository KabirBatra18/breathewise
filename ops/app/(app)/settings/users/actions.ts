"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  auditLog,
  clients,
  invoices,
  loginAttempts,
  payments,
  productCostHistory,
  productCosts,
  quotes,
  quoteSends,
  users,
} from "@/db/schema";
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

// ─────────────────────────────────────────────────────────────────────
// Emergency takeover — combines deactivate + password reset in one
// atomic action. The OWNER chooses the new password (we display it
// back exactly once so OWNER can record it). The user is also marked
// `isActive = false` so they cannot use the password to log in — it
// only becomes useful if OWNER later reactivates them, in which case
// `mustChangePassword = true` forces another reset.
//
// Threat model: a hostile employee. OWNER hits Emergency Takeover,
// types a new password, instantly the old credentials are dead AND
// the account is disabled. All historical work created by that user
// remains visible to OWNER as before — this app has no per-user data
// partition.
// ─────────────────────────────────────────────────────────────────────
const emergencySchema = z.object({
  userId: z.string().uuid(),
  newPassword: z.string().min(6, "At least 6 characters").max(256),
});

export async function emergencyTakeoverAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = emergencySchema.safeParse({
    userId: formData.get("userId"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (parsed.data.userId === actor.id) {
    return { ok: false, error: "You can't take over your own account." };
  }
  const target = await db.query.users.findFirst({
    where: eq(users.id, parsed.data.userId),
  });
  if (!target) return { ok: false, error: "User not found." };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await db
    .update(users)
    .set({
      passwordHash,
      isActive: false,
      mustChangePassword: true,
    })
    .where(eq(users.id, parsed.data.userId));

  await audit({
    actorId: actor.id,
    action: "USER_EMERGENCY_TAKEOVER",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: { username: target.username },
  });

  revalidatePath("/settings/users");
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Unblock login — clears failed login attempts for a user so the
// rate-limit lifts immediately. Replaces the old "shell into the DB
// and run a DELETE" workaround. We only ever touch failed rows tied
// to this user's username (succeeded=false). Successful login rows
// are preserved for audit. Crucially, we do NOT delete by IP across
// all usernames — that would clobber another user's failures on a
// shared IP and erase an attacker's footprint. Because the IP-based
// rate-limit just counts failures from an IP (regardless of username),
// removing this user's failed rows correctly drops that IP's tally
// too, with no collateral damage.
// ─────────────────────────────────────────────────────────────────────
export type UnblockLoginResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

const unblockLoginSchema = z.object({
  userId: z.string().uuid(),
});

export async function unblockLoginAttemptsAction(
  _prev: UnblockLoginResult | null,
  formData: FormData,
): Promise<UnblockLoginResult> {
  const actor = await requireOwner();
  const parsed = unblockLoginSchema.safeParse({
    userId: formData.get("userId"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const target = await db.query.users.findFirst({
    where: eq(users.id, parsed.data.userId),
  });
  if (!target) return { ok: false, error: "User not found." };
  if (target.id === actor.id) {
    return { ok: false, error: "You can't unblock yourself — the rate-limit on your own attempts is part of the security boundary." };
  }

  const deletedRows = await db
    .delete(loginAttempts)
    .where(
      and(
        eq(loginAttempts.username, target.username),
        eq(loginAttempts.succeeded, false),
      ),
    )
    .returning({ id: loginAttempts.id });
  const deleted = deletedRows.length;

  await audit({
    actorId: actor.id,
    action: "LOGIN_UNBLOCK",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: { deleted },
  });

  revalidatePath("/settings/users");
  return { ok: true, deleted };
}

// ─────────────────────────────────────────────────────────────────────
// Hard delete — only allowed when the user has touched NOTHING. The
// moment they've created a quote, invoice, payment, etc. the FK
// constraint would either fail outright or orphan the audit trail.
// In that case OWNER must use Deactivate / Block instead.
//
// Self-delete is also blocked; lockout-of-self is meaningless.
// ─────────────────────────────────────────────────────────────────────
export async function deleteUserAction(formData: FormData): Promise<ActionResult> {
  const actor = await requireOwner();
  const userId = z.string().uuid().parse(formData.get("userId"));
  if (userId === actor.id) {
    return { ok: false, error: "You can't delete your own account." };
  }
  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return { ok: false, error: "User not found." };
  if (target.role === "OWNER") {
    return { ok: false, error: "Owner accounts can't be deleted from the UI." };
  }

  // Count references across every table that points at users.id. Any
  // non-zero count means hard delete would break audit trails — refuse.
  // (auditLog.actorId is intentionally NOT counted: we null it below
  // so historical actions stay logged with an anonymised actor.)
  const counts = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(productCosts).where(eq(productCosts.updatedBy, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(productCostHistory).where(eq(productCostHistory.changedBy, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(clients).where(eq(clients.createdBy, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(quotes).where(eq(quotes.createdBy, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(quoteSends).where(eq(quoteSends.sentBy, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(payments).where(eq(payments.recordedBy, userId)),
    db.select({ n: sql<number>`count(*)::int` }).from(invoices).where(eq(invoices.createdBy, userId)),
  ]);
  const totalRefs = counts.reduce((s, c) => s + (c[0]?.n ?? 0), 0);
  if (totalRefs > 0) {
    return {
      ok: false,
      error: `${target.username} has created ${totalRefs} record${totalRefs === 1 ? "" : "s"} (quotes / invoices / clients / etc.). Hard delete would break the audit trail. Use "Block & lock out" instead — that disables the account permanently and keeps history intact.`,
    };
  }

  // Anonymise audit rows for THIS user before deletion (preserve the
  // history of what happened; just drop the actor pointer).
  await db
    .update(auditLog)
    .set({ actorId: null })
    .where(eq(auditLog.actorId, userId));

  await db.delete(users).where(eq(users.id, userId));

  await audit({
    actorId: actor.id,
    action: "USER_DELETE",
    entityType: "user",
    entityId: userId,
    metadata: { username: target.username, role: target.role },
  });

  revalidatePath("/settings/users");
  return { ok: true };
}
