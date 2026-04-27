import Link from "next/link";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db/client";
import {
  clients,
  quoteTierFinancials,
  quotes,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { Badge } from "@/components/ui/badge";
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
import { QUOTE_STATUS_LABELS } from "@/lib/constants";
import { formatIndianNumber } from "@/lib/pricing/format";
import { Decimal } from "@/lib/pricing/decimal";

export const metadata = { title: "Quotes" };

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "default",
  NEGOTIATING: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED: "secondary",
  CANCELLED: "destructive",
  ADVANCE_PAID: "default",
  SUPERSEDED: "secondary",
};

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
    <div className="space-y-6 p-8">
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
        <CardContent className="pt-6">
          <form
            method="get"
            className="grid gap-3 sm:grid-cols-[1fr_200px_auto]"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search quote # or client name"
                className="pl-8"
              />
            </div>
            <select
              name="status"
              defaultValue={statusFilter ?? "all"}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="all">All statuses</option>
              {Object.entries(QUOTE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary">
              Apply
            </Button>
          </form>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/quotes/${r.id}`} className="hover:underline">
                        {r.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{r.clientName ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.type === "ROUGH" ? "Rough" : "Precise"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>
                        {QUOTE_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.total
                        ? `₹${formatIndianNumber(new Decimal(r.total))}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.issueDate}
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
