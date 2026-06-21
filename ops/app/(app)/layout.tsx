import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app/sidebar";
import { CommandPalette } from "@/components/app/command-palette";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

const CHANGE_PASSWORD_PATH = "/settings/change-password";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Force the user to set a fresh password the first time they log in
  // after either: (a) being created by an OWNER, (b) having their
  // password reset. The flag is cleared by changeOwnPasswordAction
  // (see /settings/change-password). x-pathname is set by middleware
  // so we can avoid an infinite redirect loop on the change-password
  // page itself.
  if (user.mustChangePassword) {
    const path = headers().get("x-pathname") ?? "";
    if (!path.startsWith(CHANGE_PASSWORD_PATH)) {
      redirect(CHANGE_PASSWORD_PATH);
    }
  }

  // The Cmd+K search index used to be pre-fetched HERE (3 DB queries
  // on every page navigation, ~200-500ms TTFB cost). Moved to a
  // client-side lazy-fetch in CommandPalette — see /api/search-index.
  // This single change is the biggest contributor to the perceived
  // "snappy" behaviour the 2026-06-21 audit was after.

  return (
    <div className="flex min-h-svh">
      <Sidebar role={user.role as "OWNER" | "EMPLOYEE" | "VIEWER"} name={user.fullName} />
      <main className="flex-1 overflow-auto">{children}</main>
      <CommandPalette />
    </div>
  );
}
