import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Copy, Download, Plus } from "lucide-react";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clients,
  companySettings,
  invoices,
  payments,
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
import {
  outstanding,
  projectContractValue,
  quoteContractValue,
  totalReceived,
  type ProjectQuoteRow,
} from "@/lib/projects/totals";
import { AcceptDialog } from "@/components/quotes/accept-dialog";
import { ConvertToInvoiceDialog } from "@/components/invoices/convert-dialog";
import { PaymentLedger } from "@/components/quotes/payment-ledger";
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
import { Decimal, toMoney } from "@/lib/pricing/decimal";
import { QuoteBuilder } from "@/components/quotes/quote-builder";
import {
  createAddendumAction,
  duplicateQuoteAction,
  markQuoteStatusAction,
} from "../actions";
import { QuoteSendActions } from "@/components/quotes/send-actions";

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

  // The project chain is: the root quote + all addendums of the root.
  // (Parent of a parent doesn't exist; we don't model multi-level chains.)
  const rootQuoteId = quote.parentQuoteId ?? quote.id;

  const [
    client,
    sections,
    sends,
    financials,
    snapshotTerms,
    chain,
    thisPayments,
    existingInvoices,
  ] = await Promise.all([
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
      // Always fetched — used for the contract-value fallback in the
      // payment ledger (not just owner-side margin).
      db
        .select()
        .from(quoteTierFinancials)
        .where(eq(quoteTierFinancials.quoteId, quote.id)),
      db
        .select()
        .from(quoteTerms)
        .where(eq(quoteTerms.quoteId, quote.id))
        .orderBy(asc(quoteTerms.sortOrder)),
      db
        .select()
        .from(quotes)
        .where(
          or(
            eq(quotes.id, rootQuoteId),
            eq(quotes.parentQuoteId, rootQuoteId),
          ),
        )
        .orderBy(asc(quotes.createdAt)),
      db
        .select()
        .from(payments)
        .where(eq(payments.quoteId, quote.id))
        .orderBy(desc(payments.receivedAt)),
      db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          issueDate: invoices.issueDate,
          totalInvoiceValue: invoices.totalInvoiceValue,
        })
        .from(invoices)
        .where(eq(invoices.quoteId, quote.id))
        .orderBy(desc(invoices.createdAt)),
    ]);

  // Tier financials per chain quote so the project-roll-up below can
  // fall back when accepted_total wasn't captured.
  const chainIds = chain.map((c) => c.id);
  const chainFinancials =
    chainIds.length > 0
      ? await db
          .select()
          .from(quoteTierFinancials)
          .where(
            and(
              inArray(quoteTierFinancials.quoteId, chainIds),
              eq(quoteTierFinancials.tierLabel, "ROUGH"),
            ),
          )
      : [];
  const fallbackByQuoteId = new Map<string, string>();
  for (const f of chainFinancials) {
    fallbackByQuoteId.set(f.quoteId, f.totalInvoiceValue);
  }

  const projectRows: ProjectQuoteRow[] = chain.map((c) => ({
    id: c.id,
    status: c.status,
    acceptedTotal: c.acceptedTotal,
    fallbackTotal: fallbackByQuoteId.get(c.id) ?? null,
  }));
  const thisProjectRow = projectRows.find((r) => r.id === quote.id) ?? {
    id: quote.id,
    status: quote.status,
    acceptedTotal: quote.acceptedTotal,
    fallbackTotal: fallbackByQuoteId.get(quote.id) ?? null,
  };
  const thisContractValue = quoteContractValue(thisProjectRow);
  const thisReceived = totalReceived(thisPayments);
  const thisOutstanding = outstanding(thisContractValue, thisReceived);

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

  // SKU lookup — used by the read-only view to render the model
  // number (e.g. "AEE-150", "ARD-150-100") next to each line.
  const allLineProductIds = Array.from(
    new Set(
      [...lineRowsBySection.values()]
        .flat()
        .map((l) => l.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const skuByProductId = new Map<string, string>();
  if (allLineProductIds.length > 0) {
    const rows = await db
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(inArray(products.id, allLineProductIds));
    for (const r of rows) {
      if (r.sku) skuByProductId.set(r.id, r.sku);
    }
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
          subcategory: products.subcategory,
          mrp: products.mrp,
          // Used below to backfill dpRate / mrpRate snapshots on existing
          // lines so the DP / MRP toggle stays visible when editing a draft.
          defaultUnitPrice: products.defaultUnitPrice,
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
        lines: (lineRowsBySection.get(s.id) ?? []).map((l) => {
          // Backfill the picker's rate snapshots so the Astberg DP /
          // MRP toggle is visible on every editable line — not just
          // ones the user re-picks. We look up the line's product to
          // recompute the rates, then infer which mode the current
          // unitPrice matches.
          const p = l.productId
            ? allProducts.find((x) => x.id === l.productId)
            : null;
          const dpRate = p?.defaultUnitPrice ?? "";
          const mrpRate = p?.mrp
            ? toMoney(new Decimal(p.mrp).div(new Decimal("1.18"))).toFixed(2)
            : "";
          // priceMode inference: whichever rate the saved unitPrice
          // is closest to (within 1 paisa). Defaults to DP if both
          // empty or unitPrice is a manual override.
          let priceMode: "DP" | "MRP" = "DP";
          if (mrpRate && dpRate) {
            const u = Number(l.unitPrice);
            const dDp = Math.abs(u - Number(dpRate));
            const dMrp = Math.abs(u - Number(mrpRate));
            if (dMrp < dDp) priceMode = "MRP";
          }
          return {
            id: l.id,
            productId: l.productId,
            description: l.description,
            mrp: l.mrp ?? "",
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            unit: l.unit,
            costPriceSnapshot: isOwner ? l.costPriceSnapshot : null,
            dpRate,
            mrpRate,
            priceMode,
          };
        }),
      })),
      selectedTermIds: snapshotTerms.map((t) => t.clauseId).filter((id): id is string => Boolean(id)),
      showSavingsOnPdf: quote.showSavingsOnPdf,
      discountTargetSaving: quote.discountTargetSaving,
    };

    return (
      <div className="space-y-6 p-8">
        <div className="flex items-start justify-between gap-4">
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
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              render={
                <a
                  href={`/api/quotes/${quote.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                />
              }
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
            <form action={duplicateQuoteAction}>
              <input type="hidden" name="id" value={quote.id} />
              <Button type="submit" size="sm" variant="outline">
                <Copy className="h-4 w-4" />
                Duplicate
              </Button>
            </form>
            <Badge variant="secondary">Draft</Badge>
          </div>
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
  const isAcceptedOrAdvance =
    quote.status === "ACCEPTED" || quote.status === "ADVANCE_PAID";
  const canEditPayments = me.role === "OWNER" || me.role === "EMPLOYEE";
  const isAddendum = quote.parentQuoteId != null;
  const showProjectChain = chain.length > 1;
  const projectContract = projectContractValue(projectRows);

  // Read-time expiry: a SENT/NEGOTIATING quote whose validity has
  // lapsed shows up with an "Expired" badge alongside the status. We
  // don't auto-flip status in the DB — that's the user's call.
  const issueDateMs = new Date(
    `${quote.issueDate as unknown as string}T00:00:00`,
  ).getTime();
  const expiryMs = issueDateMs + quote.validityDays * 86400_000;
  const isExpired =
    (quote.status === "SENT" || quote.status === "NEGOTIATING") &&
    Date.now() > expiryMs;

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
        <div className="flex flex-wrap items-center gap-2">
          <form action={duplicateQuoteAction}>
            <input type="hidden" name="id" value={quote.id} />
            <Button type="submit" size="sm" variant="outline">
              <Copy className="h-4 w-4" />
              Duplicate
            </Button>
          </form>
          <Badge variant="default">
            {QUOTE_STATUS_LABELS[quote.status] ?? quote.status}
          </Badge>
          {isExpired ? (
            <Badge
              className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
              variant="secondary"
            >
              Expired
            </Badge>
          ) : null}
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
                  {lines.map((l) => {
                    const sku = l.productId
                      ? skuByProductId.get(l.productId) ?? null
                      : null;
                    return (
                    <TableRow key={l.id}>
                      <TableCell>{l.sno}</TableCell>
                      <TableCell className="whitespace-pre-wrap text-sm">
                        {sku ? (
                          <div className="font-mono text-[11px] font-semibold text-foreground">
                            {sku}
                          </div>
                        ) : null}
                        <div>{l.description}</div>
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
                    );
                  })}
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

      {/* Project chain (only when this quote has linked addendums or is an addendum). */}
      {showProjectChain ? (
        <Card>
          <CardHeader>
            <CardTitle>Project</CardTitle>
            <CardDescription>
              {isAddendum
                ? "This is an addendum to a parent quote."
                : "This quote has linked addendums."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Project contract value
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  ₹{formatIndianNumber(projectContract)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Sum of accepted totals across the chain.
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Quotes in this project
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums">
                  {chain.length}
                </p>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Contract value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chain.map((c) => {
                  const row: ProjectQuoteRow = {
                    id: c.id,
                    status: c.status,
                    acceptedTotal: c.acceptedTotal,
                    fallbackTotal: fallbackByQuoteId.get(c.id) ?? null,
                  };
                  const v = quoteContractValue(row);
                  const isThis = c.id === quote.id;
                  const isRoot = c.id === rootQuoteId;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">
                        {isThis ? (
                          <span className="font-semibold">
                            {c.quoteNumber} (this)
                          </span>
                        ) : (
                          <Link
                            href={`/quotes/${c.id}`}
                            className="hover:underline"
                          >
                            {c.quoteNumber}
                          </Link>
                        )}
                        {!isRoot ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            addendum
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {QUOTE_STATUS_LABELS[c.status] ?? c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.issueDate as unknown as string}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.isZero() ? "—" : `₹${formatIndianNumber(v)}`}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {/* Payment ledger (visible whenever there's an accepted figure to
          reconcile against, or when the quote is in an accepted state). */}
      {(isAcceptedOrAdvance || thisContractValue.gt(0)) ? (
        <Card>
          <CardHeader>
            <CardTitle>Payments for this quote</CardTitle>
            <CardDescription>
              Track advance, interim and final payments against the
              accepted total. Each payment auto-reconciles the outstanding
              balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PaymentLedger
              quoteId={quote.id}
              contractValue={thisContractValue.toFixed(2)}
              totalReceived={thisReceived.toFixed(2)}
              outstanding={thisOutstanding.toFixed(2)}
              payments={thisPayments.map((p) => ({
                id: p.id,
                paymentType: p.paymentType,
                amount: p.amount,
                paymentMode: p.paymentMode,
                referenceNumber: p.referenceNumber,
                receivedAt: p.receivedAt.toISOString(),
                notes: p.notes,
              }))}
              canEdit={canEditPayments}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {me.role === "OWNER" || me.role === "EMPLOYEE" ? (
            <QuoteSendActions
              quoteId={quote.id}
              status={quote.status}
              pdfUrl={`/api/quotes/${quote.id}/pdf`}
            />
          ) : null}
          {(quote.status === "SENT" || quote.status === "NEGOTIATING") &&
          (me.role === "OWNER" || me.role === "EMPLOYEE") ? (
            <div className="flex flex-wrap gap-2">
              <AcceptDialog
                quoteId={quote.id}
                defaultTotal={grandTotal ?? "0"}
                trigger={
                  <Button type="button" size="sm">
                    Mark accepted
                  </Button>
                }
              />
              <form action={markQuoteStatusAction}>
                <input type="hidden" name="id" value={quote.id} />
                <input type="hidden" name="status" value="REJECTED" />
                <Button type="submit" size="sm" variant="destructive">
                  Mark rejected
                </Button>
              </form>
            </div>
          ) : null}
          {/* Addendum: only on live (sent or accepted) parents. The child
              becomes a fresh DRAFT linked via parent_quote_id. */}
          {(quote.status === "SENT" ||
            quote.status === "NEGOTIATING" ||
            isAcceptedOrAdvance) &&
          (me.role === "OWNER" || me.role === "EMPLOYEE") &&
          !isAddendum ? (
            <form action={createAddendumAction}>
              <input type="hidden" name="parentId" value={quote.id} />
              <Button type="submit" size="sm" variant="outline">
                <Plus className="h-4 w-4" />
                Add equipment to this project
              </Button>
            </form>
          ) : null}
          {/* Convert to Tax Invoice — available only on ACCEPTED /
              ADVANCE_PAID. The dialog handles labour-inclusion and
              reverse-charge toggles. PI generator is untouched. */}
          {isAcceptedOrAdvance &&
          (me.role === "OWNER" || me.role === "EMPLOYEE") ? (
            <ConvertToInvoiceDialog
              quoteId={quote.id}
              quoteNumber={quote.quoteNumber}
              buyerHasLabour={sections.some((s) => s.isLabourStyle)}
              buyerState={client?.state ?? null}
              trigger={
                <Button type="button" size="sm" variant="default">
                  Convert to Tax Invoice
                </Button>
              }
            />
          ) : null}
        </CardContent>
      </Card>

      {existingInvoices.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Tax invoices raised from this quote</CardTitle>
            <CardDescription>
              Each invoice is a frozen legal document. You can raise more
              than one — for example, separate invoices for goods and
              installation, or partial deliveries.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {inv.issueDate as unknown as string}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₹{formatIndianNumber(new Decimal(inv.totalInvoiceValue))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        render={
                          <a
                            href={`/api/invoices/${inv.id}/pdf`}
                            target="_blank"
                            rel="noopener"
                          />
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        PDF
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// Suppress unused import warning for productCosts (referenced by drizzle schema).
void productCosts;
