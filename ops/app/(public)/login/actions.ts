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

// Two independent throttles, both with a 10-minute window:
//   IP_FAIL_LIMIT     — 5 failed attempts from one IP. Catches the
//                       simple brute-force from one source.
//   USER_FAIL_LIMIT   — 8 failed attempts on one username, regardless
//                       of source IP. Catches credential-stuffing
//                       across rotating residential proxies (cheap
//                       enough to defeat IP-only throttling).
const FAIL_WINDOW_MINUTES = 10;
const IP_FAIL_LIMIT = 5;
const USER_FAIL_LIMIT = 8;

function ipFromHeaders(): string {
  const h = headers();
  // Vercel sets `x-vercel-forwarded-for` from the platform edge and
  // strips client-supplied versions, so prefer it when present.
  // Falls back to x-forwarded-for in dev / non-Vercel hosting.
  const vercel = h.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]!.trim();
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

  // Count recent failures both by IP and by username (in parallel)
  // and reject if either exceeds its threshold.
  const windowStart = sql`NOW() - (${FAIL_WINDOW_MINUTES} || ' minutes')::interval`;
  const [ipFailRows, userFailRows] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.ipAddress, ip),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.attemptedAt, windowStart),
        ),
      ),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(
        and(
          eq(loginAttempts.username, parsed.data.username),
          eq(loginAttempts.succeeded, false),
          gt(loginAttempts.attemptedAt, windowStart),
        ),
      ),
  ]);
  const ipFailures = ipFailRows[0]?.n ?? 0;
  const userFailures = userFailRows[0]?.n ?? 0;
  if (ipFailures >= IP_FAIL_LIMIT || userFailures >= USER_FAIL_LIMIT) {
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
