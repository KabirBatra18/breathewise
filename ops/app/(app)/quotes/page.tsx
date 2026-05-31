import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { ChevronRight, Plus, Search } from "lucide-react";
import { QuoteRow } from "@/components/quotes/quote-row";
import { db } from "@/lib/db/client";
import {
  clients,
  quoteTierFinancials,
  quotes,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { formatIST } from "@/lib/date-format";
import { Badge } from "@/components/ui/badge";
import { QuoteStatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIndianNumber } from "@/lib/pricing/format";
import { Decimal } from "@/lib/pricing/decimal";

export const metadata = { title: "Quotes" };


export default async function QuotesListPage({
  searchParams,
}: {
  searchParams: { q?: string; status?: string };
}) {
  await requireAuth();
  const q = searchParams.q?.trim();
  const statusFilter =
    searchParams.status && searchParams.status !== "all"
      ? searchParams.status
      : null;

  const where = and(
    statusFilter ? eq(quotes.status, statusFilter) : undefined,
    q
      ? or(
          ilike(quotes.quoteNumber, `%${q}%`),
          ilike(clients.name, `%${q}%`),
        )
      : undefined,
  );

  const rows = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      type: quotes.quoteType,
      status: quotes.status,
      issueDate: quotes.issueDate,
      validityDays: quotes.validityDays,
      createdAt: quotes.createdAt,
      clientName: clients.name,
      total: quoteTierFinancials.totalInvoiceValue,
    })
    .from(quotes)
    .leftJoin(clients, eq(clients.id, quotes.clientId))
    .leftJoin(
      quoteTierFinancials,
      and(
        eq(quoteTierFinancials.quoteId, quotes.id),
        eq(quoteTierFinancials.tierLabel, "ROUGH"),
      ),
    )
    .where(where)
    .orderBy(desc(quotes.createdAt));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Quotes</h1>
          <p className="text-sm text-muted-foreground">
            All rough quotations. Click into one to view, edit, send, or duplicate.
          </p>
        </div>
        <Button render={<Link href="/quotes/new?type=rough" />}>
          <Plus className="h-4 w-4" />
          New rough quote
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-6">
          {/* Search bar (form GET keeps things server-rendered). */}
          <form
            method="get"
            className="grid gap-3 sm:grid-cols-[1fr_auto]"
          >
            {/* preserve current status filter when searching */}
            {statusFilter ? (
              <input type="hidden" name="status" value={statusFilter} />
            ) : null}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search quote # or client name"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>

          {/* Status filter pills — one click each, preserve current
              search query via &q=. The 'All' pill clears the filter.
              No client component needed: pills are just links. */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            <FilterPill label="All" href={buildHref({ q, status: null })} active={!statusFilter} />
            <FilterPill label="Draft" href={buildHref({ q, status: "DRAFT" })} active={statusFilter === "DRAFT"} />
            <FilterPill label="Sent" href={buildHref({ q, status: "SENT" })} active={statusFilter === "SENT"} />
            <FilterPill label="Negotiating" href={buildHref({ q, status: "NEGOTIATING" })} active={statusFilter === "NEGOTIATING"} />
            <FilterPill label="Accepted" href={buildHref({ q, status: "ACCEPTED" })} active={statusFilter === "ACCEPTED"} />
            <FilterPill label="Advance paid" href={buildHref({ q, status: "ADVANCE_PAID" })} active={statusFilter === "ADVANCE_PAID"} />
            <FilterPill label="Rejected" href={buildHref({ q, status: "REJECTED" })} active={statusFilter === "REJECTED"} />
            <FilterPill label="Expired" href={buildHref({ q, status: "EXPIRED" })} active={statusFilter === "EXPIRED"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>{rows.length} quote{rows.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-muted py-12 text-center text-sm text-muted-foreground">
              No quotes yet.{" "}
              <Link href="/quotes/new?type=rough" className="text-foreground underline">
                Create your first one
              </Link>
              .
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Grand total</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="w-8" aria-label="Open" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const issueMs = new Date(
                    `${r.issueDate as unknown as string}T00:00:00`,
                  ).getTime();
                  const isExpired =
                    (r.status === "SENT" || r.status === "NEGOTIATING") &&
                    Date.now() > issueMs + r.validityDays * 86400_000;
                  return (
                    <QuoteRow key={r.id} id={r.id}>
                      <TableCell className="font-mono text-sm">
                        {r.quoteNumber}
                      </TableCell>
                      <TableCell>{r.clientName ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.type === "ROUGH" ? "Rough" : "Precise"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <QuoteStatusBadge status={r.status} />
                          {isExpired ? (
                            <Badge
                              className="border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                              variant="secondary"
                            >
                              Expired
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.total
                          ? `₹${formatIndianNumber(new Decimal(r.total))}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatIST(r.issueDate as unknown as string)}
                      </TableCell>
                      <TableCell className="w-8 text-muted-foreground">
                        <ChevronRight className="h-4 w-4" />
                      </TableCell>
                    </QuoteRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Build a /quotes URL with the right query params; null values omitted. */
function buildHref({
  q,
  status,
}: {
  q: string | undefined;
  status: string | null;
}): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  const qs = params.toString();
  return qs ? `/quotes?${qs}` : "/quotes";
}

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center rounded-full border px-3 py-1 transition-colors " +
        (active
          ? "border-foreground bg-foreground text-background"
          : "border-input hover:bg-muted")
      }
    >
      {label}
    </Link>
  );
}
