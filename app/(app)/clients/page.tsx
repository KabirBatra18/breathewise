import { ComingSoon } from "@/components/app/coming-soon";
import { requireAuth } from "@/lib/auth/server";

export const metadata = { title: "Clients" };

export default async function ClientsPage() {
  await requireAuth();
  return (
    <ComingSoon
      title="Clients"
      description="Add, edit, and browse customer records. Wiring up next."
    />
  );
}
