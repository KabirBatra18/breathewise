import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients, companySettings, products, termsClauses } from "@/db/schema";
import { requireEmployeeOrAbove } from "@/lib/auth/server";
import { QuoteBuilder } from "@/components/quotes/quote-builder";

export const metadata = { title: "New rough quote" };

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: { type?: string };
}) {
  if (searchParams.type !== "rough") {
    redirect("/quotes/new?type=rough");
  }

  const me = await requireEmployeeOrAbove();

  const [clientRows, productRows, termsRows, settingsRow] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(isNull(clients.deletedAt))
      .orderBy(desc(clients.createdAt)),
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        category: products.category,
        subcategory: products.subcategory,
        mrp: products.mrp,
      })
      .from(products)
      .where(and(isNull(products.deletedAt), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
    db
      .select()
      .from(termsClauses)
      .where(isNull(termsClauses.deletedAt))
      .orderBy(asc(termsClauses.sortOrder)),
    db.select().from(companySettings).where(eq(companySettings.id, 1)),
  ]);

  const settings = settingsRow[0];

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/quotes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to quotes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            New rough quote
          </h1>
          <p className="text-sm text-muted-foreground">
            Tentative quotation. Single discount across the whole quote.
          </p>
        </div>
      </div>

      <QuoteBuilder
        role={me.role as "OWNER" | "EMPLOYEE" | "VIEWER"}
        clients={clientRows.map((c) => ({
          id: c.id,
          name: c.name,
          companyName: c.companyName,
          phone: c.phone,
        }))}
        products={productRows}
        defaultDiscount={settings?.defaultRoughDiscountPercent ?? "5.00"}
        defaultValidityDays={settings?.defaultValidityDays ?? 15}
        termsClauses={termsRows.map((t) => ({
          id: t.id,
          title: t.title,
          isDefault: t.isDefault,
        }))}
      />
    </div>
  );
}
