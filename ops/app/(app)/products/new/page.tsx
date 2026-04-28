import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOwner } from "@/lib/auth/server";
import { ProductForm } from "@/components/products/product-form";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireOwner();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to products
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New product</h1>
      </div>
      <ProductForm isOwner={true} />
    </div>
  );
}
