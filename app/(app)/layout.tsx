import { Sidebar } from "@/components/app/sidebar";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();
  return (
    <div className="flex min-h-svh">
      <Sidebar role={user.role as "OWNER" | "EMPLOYEE" | "VIEWER"} name={user.fullName} />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
