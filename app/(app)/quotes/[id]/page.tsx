import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clients,
  companySettings,
  productCosts,
  products,
  quoteLineItems,
  quoteSections,
  quoteSends,
  quoteTerms,
  quoteTierFinancials,
  quotes,
  termsClauses,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { QUOTE_STATUS_LABELS } from "@/lib/constants";
import { formatIndianNumber } from "@/lib/pricing/format";
import { amountInWords } from "@/lib/pricing/words";
import { Decimal } from "@/lib/pricing/decimal";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import { markQuoteStatusAction } from "../actions";

export const metadata = { title: "Quote" };

export default async function QuoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireAuth();
  const isOwner = me.role === "OWNER";

  const quote = await db.query.quotes.findFirst({
    where: eq(quotes.id, params.id),
  });
  if (!quote) notFound();

  const [client, sections, sends, financials, snapshotTerms] = await Promise.all([
    db.query.clients.findFirst({ where: eq(clients.id, quote.clientId) }),
    db
      .select()
      .from(quoteSections)
      .where(eq(quoteSections.quoteId, quote.id))
      .orderBy(asc(quoteSections.sortOrder)),
    db
      .select()
      .from(quoteSends)
      .where(eq(quoteSends.quoteId, quote.id))
      .orderBy(desc(quoteSends.sentAt)),
    isOwner
      ? db
          .select()
          .from(quoteTierFinancials)
          .where(eq(quoteTierFinancials.quoteId, quote.id))
      : Promise.resolve([]),
    db
      .select()
      .from(quoteTerms)
      .where(eq(quoteTerms.quoteId, quote.id))
      .orderBy(asc(quoteTerms.sortOrder)),
  ]);

  const lineRowsBySection = new Map<
    string,
    Array<typeof quoteLineItems.$inferSelect>
  >();
  for (const s of sections) {
    const lines = await db
      .select()
      .from(quoteLineItems)
      .where(eq(quoteLineItems.quoteSectionId, s.id))
      .orderBy(asc(quoteLineItems.sortOrder));
    lineRowsBySection.set(s.id, lines);
  }

  if (quote.status === "DRAFT" && (me.role === "OWNER" || me.role === "EMPLOYEE")) {
    const [allClients, allProducts, allTerms, settings] = await Promise.all([
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

    const initial = {
      id: quote.id,
      quoteNumber: quote.quoteNumber,
      clientId: quote.clientId,
      issueDate: quote.issueDate as unknown as string,
      validityDays: quote.validityDays,
      discountPercent: quote.roughDiscountPercent ?? "0.00",
      sections: sections.map((s) => ({
        id: s.id,
        letter: s.sectionLetter,
        title: s.title,
        gstRate: s.gstRate,
        isLabourStyle: s.isLabourStyle,
        appliesDiscount: s.appliesDiscount,
        lines: (lineRowsBySection.get(s.id) ?? []).map((l) => ({
          id: l.id,
          productId: l.productId,
          description: l.description,
          mrp: l.mrp ?? "",
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unit: l.unit,
          costPriceSnapshot: isOwner ? l.costPriceSnapshot : null,
        })),
      })),
      selectedTermIds: snapshotTerms.map((t) => t.clauseId).filter((id): id is string => Boolean(id)),
    };

    return (
      <div className="space-y-6 p-8">
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
              {quote.quoteNumber}
            </h1>
            <p className="text-sm text-muted-foreground">
              Editing draft. Save to update; sending will lock the quote.
            </p>
          </div>
          <Badge variant="secondary">Draft</Badge>
        </div>

        <QuoteBuilder
          role={me.role as "OWNER" | "EMPLOYEE" | "VIEWER"}
          clients={allClients.map((c) => ({
            id: c.id,
            name: c.name,
            companyName: c.companyName,
            phone: c.phone,
          }))}
          products={allProducts}
          defaultDiscount={settings[0]?.defaultRoughDiscountPercent ?? "5.00"}
          defaultValidityDays={settings[0]?.defaultValidityDays ?? 15}
          termsClauses={allTerms.map((t) => ({
            id: t.id,
            title: t.title,
            isDefault: t.isDefault,
          }))}
          initial={initial}
        />
      </div>
    );
  }

  // Read-only view for non-DRAFT quotes
  const grandTotal = financials.find((f) => f.tierLabel === "ROUGH")?.totalInvoiceValue;
  const grossMargin = financials.find((f) => f.tierLabel === "ROUGH")?.grossMargin;
  const grossMarginPercent = financials.find((f) => f.tierLabel === "ROUGH")?.grossMarginPercent;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            href="/quotes"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to quotes
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">
            {quote.quoteNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {client?.name} · Issued {quote.issueDate as unknown as string} ·
            Valid {quote.validityDays} days
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="default">
            {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
          </Badge>
        </div>
      </div>

      {sections.map((s) => {
        const lines = lineRowsBySection.get(s.id) ?? [];
        return (
          <Card key={s.id}>
            <CardHeader>
              <CardDescription>Section {s.sectionLetter}</CardDescription>
              <CardTitle>{s.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">SNo</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-20 text-right">Qty</TableHead>
                    <TableHead className="w-16">Unit</TableHead>
                    <TableHead className="w-32 text-right">Unit price</TableHead>
                    <TableHead className="w-32 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{l.sno}</TableCell>
                      <TableCell className="whitespace-pre-wrap text-sm">
                        {l.description}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(l.quantity)}
                      </TableCell>
                      <TableCell className="text-sm">{l.unit}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatIndianNumber(new Decimal(l.unitPrice))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatIndianNumber(
                          new Decimal(l.unitPrice).mul(new Decimal(l.quantity)),
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Grand total</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-semibold tabular-nums">
            ₹{grandTotal ? formatIndianNumber(new Decimal(grandTotal)) : "—"}
          </p>
          {grandTotal ? (
            <p className="mt-2 text-sm italic text-muted-foreground">
              {amountInWords(new Decimal(grandTotal))}
            </p>
          ) : null}
          {isOwner && grossMargin && grossMarginPercent ? (
            <>
              <Separator className="my-4" />
              <p className="text-sm text-muted-foreground">Owner only</p>
              <p className="text-base">
                Gross margin{" "}
                <span className="font-semibold tabular-nums">
                  ₹{formatIndianNumber(new Decimal(grossMargin))}
                </span>{" "}
                ({Number(grossMarginPercent).toFixed(2)}%)
              </p>
            </>
          ) : null}
        </CardContent>
      </Card>

      {snapshotTerms.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Terms &amp; conditions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {snapshotTerms.map((t, i) => (
              <div key={t.id}>
                <p className="font-medium">
                  {i + 1}. {t.titleSnapshot}
                </p>
                <p className="ml-4 text-muted-foreground">{t.bodySnapshot}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {sends.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Send history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead>Discount</TableHead>
                  <TableHead>Sent at</TableHead>
                  <TableHead>Method</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sends.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.tierLabel}</TableCell>
                    <TableCell className="tabular-nums">
                      {Number(s.discountPercent).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.sentAt.toISOString()}
                    </TableCell>
                    <TableCell className="text-sm">{s.sentVia ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(quote.status === "SENT" ||
            quote.status === "NEGOTIATING" ||
            quote.status === "DRAFT") &&
          (me.role === "OWNER" || me.role === "EMPLOYEE") ? (
            <>
              <form action={markQuoteStatusAction}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="status" value="ACCEPTED" />
                <Button type="submit" size="sm">
                  Mark accepted
                </Button>
              </form>
              <form action={markQuoteStatusAction}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="status" value="REJECTED" />
                <Button type="submit" size="sm" variant="destructive">
                  Mark rejected
                </Button>
              </form>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

// Suppress unused import warning for productCosts (referenced by drizzle schema).
void productCosts;
