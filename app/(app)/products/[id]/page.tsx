import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { productCosts, products } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { ProductForm, type ProductFormValues } from "@/components/products/product-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { softDeleteProductAction } from "../actions";

export const metadata = { title: "Edit product" };

export default async function ProductPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireAuth();
  const isOwner = me.role === "OWNER";

  const row = await db.query.products.findFirst({
    where: eq(products.id, params.id),
  });
  if (!row || row.deletedAt) notFound();

  const cost = isOwner
    ? await db.query.productCosts.findFirst({
        where: eq(productCosts.productId, row.id),
      })
    : null;

  const initial: ProductFormValues = {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    category: row.category,
    mrp: row.mrp,
    defaultUnitPrice: row.defaultUnitPrice,
    defaultGstRate: row.defaultGstRate,
    unit: row.unit,
    isActive: row.isActive,
    costPrice: cost?.costPrice ?? null,
    supplier: cost?.supplier ?? null,
    costNotes: cost?.notes ?? null,
  };

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
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {row.name}
        </h1>
      </div>

      {isOwner ? (
        <ProductForm initial={initial} isOwner={isOwner} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Read-only</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Only the owner can edit catalog entries.
          </CardContent>
        </Card>
      )}

      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={softDeleteProductAction}>
              <input type="hidden" name="id" value={row.id} />
              <Button
                type="submit"
                variant="destructive"
                size="sm"
              >
                Archive product
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Archived products are hidden from the catalog and can&apos;t be
                added to new quotes. Existing quotes are unaffected.
              </p>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
