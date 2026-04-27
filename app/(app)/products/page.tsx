import Link from "next/link";
import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db/client";
import { products, productCosts } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PRODUCT_CATEGORIES } from "@/lib/constants";
import { formatIndianNumber } from "@/lib/pricing/format";
import { Decimal } from "@/lib/pricing/decimal";

export const metadata = { title: "Products" };

interface SearchParams {
  q?: string;
  category?: string;
  inactive?: string;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const me = await requireAuth();
  const isOwner = me.role === "OWNER";
  const showInactive = searchParams.inactive === "1";
  const q = searchParams.q?.trim();
  const category = searchParams.category;

  const where = and(
    isNull(products.deletedAt),
    showInactive ? undefined : eq(products.isActive, true),
    category && category !== "all" ? eq(products.category, category) : undefined,
    q
      ? or(
          ilike(products.name, `%${q}%`),
          ilike(products.sku, `%${q}%`),
          ilike(products.description, `%${q}%`),
        )
      : undefined,
  );

  const rows = isOwner
    ? await db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          category: products.category,
          unit: products.unit,
          mrp: products.mrp,
          defaultUnitPrice: products.defaultUnitPrice,
          defaultGstRate: products.defaultGstRate,
          isActive: products.isActive,
          costPrice: productCosts.costPrice,
        })
        .from(products)
        .leftJoin(productCosts, eq(productCosts.productId, products.id))
        .where(where)
        .orderBy(desc(products.createdAt))
    : await db
        .select({
          id: products.id,
          sku: products.sku,
          name: products.name,
          category: products.category,
          unit: products.unit,
          mrp: products.mrp,
          defaultUnitPrice: products.defaultUnitPrice,
          defaultGstRate: products.defaultGstRate,
          isActive: products.isActive,
          costPrice: sql<string | null>`NULL`.as("cost_price"),
        })
        .from(products)
        .where(where)
        .orderBy(desc(products.createdAt));

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Catalog of items that can be added to quotes.
            {isOwner ? " Cost prices are visible to you only." : null}
          </p>
        </div>
        {isOwner ? (
          <Button render={<Link href="/products/new" />}>
            <Plus className="h-4 w-4" />
            New product
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            method="get"
            className="grid gap-3 sm:grid-cols-[1fr_220px_auto_auto]"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search name, SKU, description"
                className="pl-8"
              />
            </div>
            <select
              name="category"
              defaultValue={category ?? "all"}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="all">All categories</option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="inactive"
                value="1"
                defaultChecked={showInactive}
                className="h-4 w-4 rounded border-input"
              />
              Show inactive
            </label>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>{rows.length} product{rows.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-muted py-12 text-center text-sm text-muted-foreground">
              No products match your filters.
              {isOwner ? (
                <>
                  {" "}
                  <Link className="text-foreground underline" href="/products/new">
                    Add one
                  </Link>
                  .
                </>
              ) : null}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">MRP</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  {isOwner ? (
                    <TableHead className="text-right">Cost</TableHead>
                  ) : null}
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer">
                    <TableCell className="font-mono text-xs">
                      <Link href={`/products/${p.id}`} className="hover:underline">
                        {p.sku ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/products/${p.id}`} className="hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {PRODUCT_CATEGORIES.find((c) => c.value === p.category)?.label ?? p.category}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                      {p.mrp ? formatIndianNumber(new Decimal(p.mrp)) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatIndianNumber(new Decimal(p.defaultUnitPrice))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">
                      {Number(p.defaultGstRate).toFixed(0)}%
                    </TableCell>
                    {isOwner ? (
                      <TableCell className="text-right tabular-nums">
                        {p.costPrice ? (
                          formatIndianNumber(new Decimal(p.costPrice))
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      {p.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="destructive">Inactive</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
