import Link from "next/link";
import { and, count, desc, eq, gte, inArray, isNull, sql, sum } from "drizzle-orm";
import { ArrowRight, Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import {
  clients,
  quoteTierFinancials,
  quotes,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { Decimal } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";
import { QUOTE_STATUS_LABELS } from "@/lib/constants";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const me = await requireAuth();
  const isOwner = me.role === "OWNER";

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const ownsClause = isOwner ? undefined : eq(quotes.createdBy, me.id);

  const [draftCount, sentRecent, acceptedRecent, clientsCount] = await Promise.all([
    db
      .select({ n: count() })
      .from(quotes)
      .where(and(eq(quotes.status, "DRAFT"), ownsClause)),
    db
      .select({ n: count() })
      .from(quotes)
      .where(
        and(
          inArray(quotes.status, ["SENT", "NEGOTIATING", "ACCEPTED"]),
          gte(quotes.createdAt, thirtyDaysAgo),
          ownsClause,
        ),
      ),
    db
      .select({ n: count() })
      .from(quotes)
      .where(
        and(
          eq(quotes.status, "ACCEPTED"),
          gte(quotes.createdAt, thirtyDaysAgo),
          ownsClause,
        ),
      ),
    db
      .select({ n: count() })
      .from(clients)
      .where(isNull(clients.deletedAt)),
  ]);

  let acceptedRevenue: string | null = null;
  let acceptedMargin: string | null = null;
  if (isOwner) {
    const sums = await db
      .select({
        rev: sum(quoteTierFinancials.totalInvoiceValue),
        margin: sum(quoteTierFinancials.grossMargin),
      })
      .from(quoteTierFinancials)
      .innerJoin(quotes, eq(quotes.id, quoteTierFinancials.quoteId))
      .where(
        and(
          eq(quotes.status, "ACCEPTED"),
          gte(quotes.createdAt, thirtyDaysAgo),
          eq(
            quoteTierFinancials.tierLabel,
            sql`COALESCE(${quotes.acceptedTierLabel}, 'ROUGH')`,
          ),
        ),
      );
    acceptedRevenue = sums[0]?.rev ?? "0";
    acceptedMargin = sums[0]?.margin ?? "0";
  }

  const recent = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      status: quotes.status,
      clientName: clients.name,
      issueDate: quotes.issueDate,
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
    .where(ownsClause)
    .orderBy(desc(quotes.createdAt))
    .limit(5);

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Hi, {me.fullName.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {todayString()} · Last 30 days unless noted.
          </p>
        </div>
        <Button render={<Link href="/quotes/new?type=rough" />}>
          <Plus className="h-4 w-4" />
          New rough quote
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={isOwner ? "Drafts" : "My drafts"} value={draftCount[0]?.n ?? 0} />
        <StatCard
          label={isOwner ? "Sent" : "My sent"}
          value={sentRecent[0]?.n ?? 0}
          hint="last 30 days"
        />
        <StatCard
          label={isOwner ? "Accepted" : "My accepted"}
          value={acceptedRecent[0]?.n ?? 0}
          hint="last 30 days"
        />
        <StatCard label="Active clients" value={clientsCount[0]?.n ?? 0} />
      </div>

      {isOwner ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardDescription>Revenue (accepted)</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                ₹
                {acceptedRevenue
                  ? formatIndianNumber(new Decimal(acceptedRevenue))
                  : "0.00"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Sum of grand totals from accepted quotes (last 30 days).
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Gross margin (accepted)</CardDescription>
              <CardTitle className="text-3xl tabular-nums">
                ₹
                {acceptedMargin
                  ? formatIndianNumber(new Decimal(acceptedMargin))
                  : "0.00"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Margin only visible to you. Goes up as cost prices are filled in.
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent quotes</CardTitle>
            <CardDescription>
              {isOwner ? "Across the team." : "Your quotes."}
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" render={<Link href="/quotes" />}>
            All
            <ArrowRight className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No quotes yet. <Link href="/quotes/new?type=rough" className="underline">Create the first one</Link>.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Issued</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-sm">
                      <Link href={`/quotes/${r.id}`} className="hover:underline">
                        {r.quoteNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{r.clientName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "ACCEPTED" ? "default" : "secondary"}>
                        {QUOTE_STATUS_LABELS[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.total ? `₹${formatIndianNumber(new Decimal(r.total))}` : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.issueDate as unknown as string}
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

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
      {hint ? (
        <CardContent className="text-xs text-muted-foreground">{hint}</CardContent>
      ) : null}
    </Card>
  );
}

function todayString(): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date());
}
