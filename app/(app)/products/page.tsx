import { ComingSoon } from "@/components/app/coming-soon";
import { requireAuth } from "@/lib/auth/server";

export const metadata = { title: "Products" };

export default async function ProductsPage() {
  await requireAuth();
  return (
    <ComingSoon
      title="Products"
      description="Astberg catalog with supplier costs (owner-only) and unit prices."
    />
  );
}
