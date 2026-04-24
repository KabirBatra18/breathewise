import { ComingSoon } from "@/components/app/coming-soon";
import { requireAuth } from "@/lib/auth/server";

export const metadata = { title: "Quotes" };

export default async function QuotesPage() {
  await requireAuth();
  return (
    <ComingSoon
      title="Quotes"
      description="Rough and precise quotation builder, PDF generation, send history."
    />
  );
}
