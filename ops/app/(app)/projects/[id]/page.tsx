import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Download } from "lucide-react";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clients,
  invoices,
  payments,
  quoteTierFinancials,
  quotes,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { formatIST } from "@/lib/date-format";
import { Breadcrumbs } from "@/components/ui/breadcrumb";
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
import {
  InvoiceStatusBadge,
  QuoteStatusBadge,
} from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/error-banner";
import { Decimal, ZERO, toMoney } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";
import {
  outstanding as outstandingFn,
  projectContractValue,
  quoteContractValue,
  totalReceived,
  type ProjectQuoteRow,
} from "@/lib/projects/totals";

export const metadata = { title: "Project" };

/**
 * Unified project view: one page per "engagement". A project = the
 * parent quote + every addendum (child quotes pointing at it) + every
 * invoice raised from any of those + every payment received against
 * any of them.
 *
 * Why this exists:
 *   Before, the same engagement was spread across /quotes/[id],
 *   /quotes/[addendum-id], /invoices, /payments, with the user
 *   manually correlating. This page is the single canonical view.
 *
 *   We don't deprecate the underlying pages — they're still the
 *   editing entry points. This is a read-only roll-up.
 *
 * Routing: /projects/[rootQuoteId] — pass the parent quote's id.
 *   Addendum quote ids redirect to the parent's project page.
 */
export default async function ProjectPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuth();

  // The "id" we accept is a quote id (either parent or any addendum).
  // Normalize to the parent's id so the URL is canonical.
  const seedRows = await db
    .select({
      id: quotes.id,
      parentQuoteId: quotes.parentQuoteId,
      quoteNumber: quotes.quoteNumber,
    })
    .from(quotes)
    .where(eq(quotes.id, params.id));
  const seed = seedRows[0];
  if (!seed) notFound();
  const rootQuoteId = seed.parentQuoteId ?? seed.id;

  // Pull every quote in the chain + the buyer.
  const chain = await db
    .select()
    .from(quotes)
    .where(
      or(eq(quotes.id, rootQuoteId), eq(quotes.parentQuoteId, rootQuoteId)),
    )
    .orderBy(asc(quotes.createdAt));
  const root = chain.find((q) => q.id === rootQuoteId) ?? chain[0];
  if (!root) notFound();

  const buyerRows = await db
    .select()
    .from(clients)
    .where(eq(clients.id, root.clientId));
  const buyer = buyerRows[0];

  // Fallback totals (last saved ROUGH-tier total) for any chain quote
  // that doesn't yet have an acceptedTotal.
  const chainIds = chain.map((c) => c.id);
  const fin =
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
  const fallbackByQuote = new Map<string, string>();
  for (const f of fin) fallbackByQuote.set(f.quoteId, f.totalInvoiceValue);

  const projectRows: ProjectQuoteRow[] = chain.map((q) => ({
    id: q.id,
    status: q.status,
    acceptedTotal: q.acceptedTotal,
    fallbackTotal: fallbackByQuote.get(q.id) ?? null,
  }));

  // Every invoice raised from any quote in the chain.
  const allInvoices =
    chainIds.length > 0
      ? await db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            status: invoices.status,
            issueDate: invoices.issueDate,
            quoteId: invoices.quoteId,
            totalInvoiceValue: invoices.totalInvoiceValue,
            isInterState: invoices.isInterState,
          })
          .from(invoices)
          .where(inArray(invoices.quoteId, chainIds))
          .orderBy(desc(invoices.createdAt))
      : [];
  const draftInvoices = allInvoices.filter((i) => i.status === "DRAFT");
  const issuedInvoices = allInvoices.filter((i) => i.status === "ISSUED");

  // Every payment recorded against any quote in the chain.
  const allPayments =
    chainIds.length > 0
      ? await db
          .select()
          .from(payments)
          .where(inArray(payments.quoteId, chainIds))
          .orderBy(desc(payments.receivedAt))
      : [];

  // Aggregates
  const contractValue = projectContractValue(projectRows);
  const received = totalReceived(allPayments);
  const dueAmt = outstandingFn(contractValue, received);

  const totalInvoiced = toMoney(
    issuedInvoices.reduce(
      (a, i) => a.plus(new Decimal(i.totalInvoiceValue)),
      ZERO,
    ),
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumbs
        items={[
          { label: "Quotes", href: "/quotes" },
          { label: root.quoteNumber, href: `/quotes/${root.id}` },
          { label: "Project view" },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Project · {root.quoteNumber}
          </h1>
          <p className="text-sm text-muted-foreground">
            {buyer?.name}
            {buyer?.companyName ? ` · ${buyer.companyName}` : ""}
            {chain.length > 1 ? (
              <span className="ml-2">
                · {chain.length} quotes in chain
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={<Link href={`/quotes/${root.id}`} />}
          >
            Open root quote
          </Button>
        </div>
      </div>

      {/* ── Money tiles ──────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Contract value" value={contractValue} />
        <Tile label="Invoiced (issued)" value={totalInvoiced} tone="muted" />
        <Tile label="Received" value={received} tone="positive" />
        <Tile
          label="Outstanding"
          value={dueAmt}
          tone={dueAmt.isZero() ? "positive" : "outstanding"}
        />
      </div>

      {/* ── Quote chain ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardDescription>
            Root quote + addendums. Each row links to its quote page
            where you can edit / send / accept / convert to invoice.
          </CardDescription>
          <CardTitle>Quote chain</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead className="text-right">Contract (₹)</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {chain.map((q) => {
                const row: ProjectQuoteRow = {
                  id: q.id,
                  status: q.status,
                  acceptedTotal: q.acceptedTotal,
                  fallbackTotal: fallbackByQuote.get(q.id) ?? null,
                };
                const v = quoteContractValue(row);
                const isRoot = q.id === rootQuoteId;
                return (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="hover:underline"
                      >
                        {q.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {isRoot ? "Root" : "Addendum"}
                    </TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={q.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatIST(q.issueDate as unknown as string)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {v.isZero() ? "—" : formatIndianNumber(v)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <ChevronRight className="h-4 w-4" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Invoices in this project ─────────────────────────── */}
      <Card>
        <CardHeader>
          <CardDescription>
            Tax invoices raised from any quote in this chain. Drafts
            are editable; issued invoices are legal documents.
          </CardDescription>
          <CardTitle>
            Invoices
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {issuedInvoices.length} issued · {draftInvoices.length} draft
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allInvoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Once a quote is accepted, click 'Convert to Tax Invoice' on its detail page to spawn a draft."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Total (₹)</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {allInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/invoices/${inv.id}`}
                        className="hover:underline"
                      >
                        {inv.invoiceNumber ?? "Draft"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <InvoiceStatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatIST(inv.issueDate as unknown as string)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatIndianNumber(new Decimal(inv.totalInvoiceValue))}
                    </TableCell>
                    <TableCell>
                      {inv.status === "ISSUED" ? (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            size="sm"
                            render={
                              <a
                                href={`/api/invoices/${inv.id}/pdf?copy=client`}
                                target="_blank"
                                rel="noopener"
                              />
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                            Client
                          </Button>
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
                            3 copies
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          render={<Link href={`/invoices/${inv.id}/edit`} />}
                        >
                          Open editor
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ── Payment timeline ─────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardDescription>
            Every payment recorded against any quote in this project,
            most recent first.
          </CardDescription>
          <CardTitle>
            Payments
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {allPayments.length} record{allPayments.length === 1 ? "" : "s"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allPayments.length === 0 ? (
            <EmptyState
              title="No payments recorded yet"
              description="Add payments from the quote detail page when an advance or invoice payment lands."
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allPayments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm text-muted-foreground">
                        {p.receivedAt.toISOString().slice(0, 10)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.paymentType}
                      </TableCell>
                      <TableCell className="text-sm">
                        {p.paymentMode ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {p.referenceNumber ?? "—"}
                      </TableCell>
                      <TableCell
                        className={
                          "text-right tabular-nums " +
                          (p.paymentType === "REFUND"
                            ? "text-rose-700 dark:text-rose-400"
                            : "text-emerald-700 dark:text-emerald-400")
                        }
                      >
                        {p.paymentType === "REFUND" ? "−" : ""}
                        {formatIndianNumber(new Decimal(p.amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Separator className="my-4" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total received</span>
                <span className="font-semibold tabular-nums">
                  ₹{formatIndianNumber(received)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Tile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: Decimal;
  tone?: "default" | "muted" | "positive" | "outstanding";
}) {
  const cls =
    tone === "muted"
      ? "text-muted-foreground"
      : tone === "positive"
        ? "text-emerald-700 dark:text-emerald-400"
        : tone === "outstanding"
          ? "text-amber-700 dark:text-amber-400"
          : "";
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={"mt-1 text-xl font-semibold tabular-nums " + cls}>
        ₹{formatIndianNumber(value)}
      </p>
    </div>
  );
}
