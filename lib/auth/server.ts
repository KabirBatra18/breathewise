import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/db/schema";
import { SESSION_COOKIE, verifySession, type Role, type SessionPayload } from "./session";

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const row = await db.query.users.findFirst({
    where: eq(users.id, session.sub),
  });
  if (!row || !row.isActive) return null;
  return row;
}

// Route guards. In the invisibility model an authenticated user with the
// wrong role sees a 404, not a redirect — redirects would confirm the
// protected route exists.
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...allowed: Role[]) {
  const user = await requireAuth();
  if (!allowed.includes(user.role as Role)) notFound();
  return user;
}

export async function requireOwner() {
  return requireRole("OWNER");
}

export async function requireEmployeeOrAbove() {
  return requireRole("OWNER", "EMPLOYEE");
}

export async function requireViewerOrAbove() {
  return requireRole("OWNER", "EMPLOYEE", "VIEWER");
}
