import { ComingSoon } from "@/components/app/coming-soon";
import { requireOwner } from "@/lib/auth/server";

export const metadata = { title: "Terms" };

export default async function TermsPage() {
  await requireOwner();
  return (
    <ComingSoon
      title="Terms & Conditions"
      description="Edit the T&C library that auto-fills on new quotations."
    />
  );
}
