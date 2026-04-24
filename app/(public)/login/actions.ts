"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { loginAttempts, users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSession,
} from "@/lib/auth/session";

const schema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export type LoginState = {
  ok: boolean;
  error?: string;
};

const FAIL_LIMIT = 5;
const FAIL_WINDOW_MINUTES = 10;

function ipFromHeaders(): string {
  const h = headers();
  const fwd = h.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "0.0.0.0";
}

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false, error: "Please enter a username and password." };
  }

  const ip = ipFromHeaders();

  // Opportunistically prune old rows, then count recent failures.
  await db.execute(sql`SELECT prune_login_attempts()`);

  const failRows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(
      and(
        eq(loginAttempts.ipAddress, ip),
        eq(loginAttempts.succeeded, false),
        gt(
          loginAttempts.attemptedAt,
          sql`NOW() - (${FAIL_WINDOW_MINUTES} || ' minutes')::interval`,
        ),
      ),
    );
  if ((failRows[0]?.n ?? 0) >= FAIL_LIMIT) {
    return { ok: false, error: "Too many attempts. Try again in a few minutes." };
  }

  const user = await db.query.users.findFirst({
    where: eq(users.username, parsed.data.username),
  });

  let succeeded = false;
  if (user && user.isActive) {
    succeeded = await verifyPassword(parsed.data.password, user.passwordHash);
  }

  await db.insert(loginAttempts).values({
    ipAddress: ip,
    username: parsed.data.username,
    succeeded,
  });

  if (!succeeded || !user) {
    return { ok: false, error: "Invalid username or password." };
  }

  const token = await signSession({
    sub: user.id,
    username: user.username,
    role: user.role as "OWNER" | "EMPLOYEE" | "VIEWER",
    name: user.fullName,
  });

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id));

  redirect("/dashboard");
}

export async function logoutAction() {
  cookies().delete(SESSION_COOKIE);
  redirect("/login");
}
