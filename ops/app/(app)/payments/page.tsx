import Link from "next/link";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db/client";
import {
  clients,
  payments,
  quoteTierFinancials,
  quotes,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { QuoteStatusBadge } from "@/components/ui/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Decimal, ZERO, toMoney } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";

export const metadata = { title: "Payments" };

export default async function PaymentsPage() {
  await requireAuth();

  // Every quote that's live (accepted or advance-paid). For each one
  // we compute contract value, total received, outstanding, last
  // payment date — sorted by oldest accepted (most aged outstanding
  // bubbles to the top).
  const quoteRows = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      status: quotes.status,
      clientName: clients.name,
      acceptedTotal: quotes.acceptedTotal,
      acceptedNotes: quotes.acceptedNotes,
      closedAt: quotes.closedAt,
      issueDate: quotes.issueDate,
    })
    .from(quotes)
    .leftJoin(clients, eq(clients.id, quotes.clientId))
    .where(inArray(quotes.status, ["ACCEPTED", "ADVANCE_PAID"]))
    .orderBy(desc(quotes.closedAt));

  const ids = quoteRows.map((q) => q.id);

  const [tierRows, paymentRows] = await Promise.all([
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(quoteTierFinancials)
          .where(
            and(
              inArray(quoteTierFinancials.quoteId, ids),
              eq(quoteTierFinancials.tierLabel, "ROUGH"),
            ),
          ),
    ids.length === 0
      ? Promise.resolve([])
      : db
          .select({
            quoteId: payments.quoteId,
            received: sql<string>`SUM(CASE WHEN ${payments.paymentType} = 'REFUND' THEN -${payments.amount} ELSE ${payments.amount} END)`,
            lastReceivedAt: sql<Date | null>`MAX(${payments.receivedAt})`,
          })
          .from(payments)
          .where(inArray(payments.quoteId, ids))
          .groupBy(payments.quoteId),
  ]);

  const fallbackByQuote = new Map<string, string>();
  for (const t of tierRows) fallbackByQuote.set(t.quoteId, t.totalInvoiceValue);
  const paymentByQuote = new Map<
    string,
    { received: Decimal; lastAt: Date | null }
  >();
  for (const p of paymentRows) {
    paymentByQuote.set(p.quoteId, {
      received: p.received ? new Decimal(p.received) : ZERO,
      lastAt: p.lastReceivedAt,
    });
  }

  const enriched = quoteRows.map((q) => {
    const contract = q.acceptedTotal
      ? new Decimal(q.acceptedTotal)
      : fallbackByQuote.get(q.id)
        ? new Decimal(fallbackByQuote.get(q.id)!)
        : ZERO;
    const received = paymentByQuote.get(q.id)?.received ?? ZERO;
    const due = contract.minus(received);
    return {
      ...q,
      contract,
      received,
      due: due.isNegative() ? ZERO : toMoney(due),
      lastReceivedAt: paymentByQuote.get(q.id)?.lastAt ?? null,
    };
  });

  // Aggregate tiles
  const totalContract = toMoney(
    enriched.reduce((acc, r) => acc.plus(r.contract), ZERO),
  );
  const totalReceived = toMoney(
    enriched.reduce((acc, r) => acc.plus(r.received), ZERO),
  );
  const totalOutstanding = toMoney(
    enriched.reduce((acc, r) => acc.plus(r.due), ZERO),
  );
  const fullyPaid = enriched.filter((r) => r.due.isZero()).length;
  const withDue = enriched.length - fullyPaid;

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Every accepted project, what&apos;s collected, what&apos;s still
            due.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            render={
              <a
                href="/api/exports/accepted-quotes"
                target="_blank"
                rel="noopener"
              />
            }
          >
            <Download className="h-4 w-4" />
            Accepted (this month CSV)
          </Button>
          <Button
            size="sm"
            variant="outline"
            render={
              <a href="/api/exports/payments" target="_blank" rel="noopener" />
            }
          >
            <Download className="h-4 w-4" />
            Payments (this month CSV)
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Booked" value={totalContract} />
        <Tile label="Collected" value={totalReceived} tone="positive" />
        <Tile
          label="Outstanding"
          value={totalOutstanding}
          tone={totalOutstanding.isZero() ? "positive" : "outstanding"}
        />
        <Tile
          label="Open / Closed"
          rawText={`${withDue} due · ${fullyPaid} paid`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardDescription>{enriched.length} accepted quote{enriched.length === 1 ? "" : "s"}</CardDescription>
          <CardTitle>Project ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {enriched.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed p-12 text-center text-sm text-muted-foreground">
              No accepted projects yet. Once a quote is marked accepted, it
              shows up here for payment tracking.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Contract</TableHead>
                  <TableHead className="text-right">Received</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Last payment</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {enriched.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/quotes/${r.id}`}
                        className="hover:underline"
                      >
                        {r.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{r.clientName ?? "—"}</TableCell>
                    <TableCell>
                      <QuoteStatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₹{formatIndianNumber(r.contract)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                      ₹{formatIndianNumber(r.received)}
                    </TableCell>
                    <TableCell
                      className={
                        "text-right tabular-nums " +
                        (r.due.isZero()
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-amber-700 dark:text-amber-400")
                      }
                    >
                      ₹{formatIndianNumber(r.due)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.lastReceivedAt
                        ? r.lastReceivedAt.toISOString().slice(0, 10)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <ChevronRight className="h-4 w-4" />
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

function Tile({
  label,
  value,
  rawText,
  tone,
}: {
  label: string;
  value?: Decimal;
  rawText?: string;
  tone?: "positive" | "outstanding";
}) {
  const tonecls =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "outstanding"
        ? "text-amber-700 dark:text-amber-400"
        : "";
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={"mt-1 text-xl font-semibold tabular-nums " + tonecls}>
        {value !== undefined
          ? `₹${formatIndianNumber(value)}`
          : rawText}
      </p>
    </div>
  );
}
