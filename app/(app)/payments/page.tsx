import { ComingSoon } from "@/components/app/coming-soon";
import { requireAuth } from "@/lib/auth/server";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  await requireAuth();
  return (
    <ComingSoon
      title="Payments"
      description="Log advance, interim, and labour-day payments against each quote."
    />
  );
}
