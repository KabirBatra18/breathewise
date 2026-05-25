import Link from "next/link";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { ArrowRight, Plus } from "lucide-react";
import { db } from "@/lib/db/client";
import {
  clients,
  payments,
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
import { QuoteStatusBadge } from "@/components/ui/status-badge";
import { Decimal, ZERO, toMoney } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const me = await requireAuth();
  const isOwner = me.role === "OWNER";
  const ownsClause = isOwner ? undefined : eq(quotes.createdBy, me.id);

  const now = new Date();
  const ninetyAgo = new Date(now.getTime() - 90 * 86400_000);

  // ── Pipeline (last 90 days, by status) ─────────────────────────
  const pipelineRows = await db
    .select({
      status: quotes.status,
      n: count(),
    })
    .from(quotes)
    .where(and(gte(quotes.createdAt, ninetyAgo), ownsClause))
    .groupBy(quotes.status);

  const pipelineByStatus = new Map<string, number>();
  for (const r of pipelineRows) pipelineByStatus.set(r.status, r.n);
  const totalDrafted = pipelineRows.reduce((acc, r) => acc + r.n, 0);
  const totalSent = ["SENT", "NEGOTIATING", "ACCEPTED", "ADVANCE_PAID"].reduce(
    (acc, s) => acc + (pipelineByStatus.get(s) ?? 0),
    0,
  );
  const totalAccepted =
    (pipelineByStatus.get("ACCEPTED") ?? 0) +
    (pipelineByStatus.get("ADVANCE_PAID") ?? 0);
  const totalLost =
    (pipelineByStatus.get("REJECTED") ?? 0) +
    (pipelineByStatus.get("EXPIRED") ?? 0) +
    (pipelineByStatus.get("CANCELLED") ?? 0);
  const conversionPct =
    totalSent > 0 ? ((totalAccepted / totalSent) * 100).toFixed(1) : "—";

  // ── Booked / Collected / Outstanding (all time, accepted) ──────
  const acceptedQuotes = await db
    .select({
      id: quotes.id,
      acceptedTotal: quotes.acceptedTotal,
      closedAt: quotes.closedAt,
    })
    .from(quotes)
    .where(
      and(inArray(quotes.status, ["ACCEPTED", "ADVANCE_PAID"]), ownsClause),
    );

  const acceptedIds = acceptedQuotes.map((q) => q.id);
  const [tierFin, paymentTotals] = await Promise.all([
    acceptedIds.length === 0
      ? Promise.resolve([])
      : db
          .select()
          .from(quoteTierFinancials)
          .where(
            and(
              inArray(quoteTierFinancials.quoteId, acceptedIds),
              eq(quoteTierFinancials.tierLabel, "ROUGH"),
            ),
          ),
    acceptedIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            quoteId: payments.quoteId,
            received: sql<string>`SUM(CASE WHEN ${payments.paymentType} = 'REFUND' THEN -${payments.amount} ELSE ${payments.amount} END)`,
          })
          .from(payments)
          .where(inArray(payments.quoteId, acceptedIds))
          .groupBy(payments.quoteId),
  ]);

  const fallbackByQuote = new Map<string, string>();
  for (const t of tierFin) fallbackByQuote.set(t.quoteId, t.totalInvoiceValue);
  const receivedByQuote = new Map<string, Decimal>();
  for (const p of paymentTotals)
    receivedByQuote.set(p.quoteId, p.received ? new Decimal(p.received) : ZERO);

  let booked = ZERO;
  let collected = ZERO;
  let outstanding = ZERO;
  // Aging on outstanding amounts, bucketed by days since closedAt.
  let aging0_30 = ZERO;
  let aging31_60 = ZERO;
  let aging61_90 = ZERO;
  let aging90Plus = ZERO;

  for (const q of acceptedQuotes) {
    const contract = q.acceptedTotal
      ? new Decimal(q.acceptedTotal)
      : fallbackByQuote.get(q.id)
        ? new Decimal(fallbackByQuote.get(q.id)!)
        : ZERO;
    const recv = receivedByQuote.get(q.id) ?? ZERO;
    const due = contract.minus(recv);
    booked = booked.plus(contract);
    collected = collected.plus(recv);
    if (due.gt(0)) {
      outstanding = outstanding.plus(due);
      const closedDays = q.closedAt
        ? Math.floor((now.getTime() - q.closedAt.getTime()) / 86400_000)
        : 0;
      if (closedDays <= 30) aging0_30 = aging0_30.plus(due);
      else if (closedDays <= 60) aging31_60 = aging31_60.plus(due);
      else if (closedDays <= 90) aging61_90 = aging61_90.plus(due);
      else aging90Plus = aging90Plus.plus(due);
    }
  }
  booked = toMoney(booked);
  collected = toMoney(collected);
  outstanding = toMoney(outstanding);

  // ── Recent quotes (existing) ───────────────────────────────────
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
    .limit(8);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Pipeline, collections, and what&apos;s outstanding — last 90 days
            for counts, all-time for money.
          </p>
        </div>
        <Button render={<Link href="/quotes/new?type=rough" />}>
          <Plus className="h-4 w-4" />
          New rough quote
        </Button>
      </div>

      {/* ── Pipeline counts ──────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
        <PipelineTile
          label="Drafted"
          n={totalDrafted}
          tone="default"
          subtitle="last 90d"
        />
        <PipelineTile
          label="Sent"
          n={totalSent}
          tone="default"
          subtitle="incl. negotiating + closed"
        />
        <PipelineTile
          label="Accepted"
          n={totalAccepted}
          tone="positive"
          subtitle="incl. advance paid"
        />
        <PipelineTile
          label="Lost"
          n={totalLost}
          tone="negative"
          subtitle="rejected / expired / cancelled"
        />
        <PipelineTile
          label="Conversion"
          n={conversionPct}
          tone={
            conversionPct === "—"
              ? "default"
              : Number(conversionPct) >= 30
                ? "positive"
                : "default"
          }
          subtitle="accepted ÷ sent"
          isPct
        />
      </div>

      {/* ── Money tiles ──────────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-3">
        <MoneyTile label="Booked" value={booked} tone="default" subtitle="all accepted contracts" />
        <MoneyTile label="Collected" value={collected} tone="positive" subtitle="payments received" />
        <MoneyTile
          label="Outstanding"
          value={outstanding}
          tone={outstanding.isZero() ? "positive" : "outstanding"}
          subtitle="contract − collected"
        />
      </div>

      {/* ── Aging on outstanding ─────────────────────────────── */}
      {outstanding.gt(0) ? (
        <Card>
          <CardHeader>
            <CardTitle>Aging on outstanding</CardTitle>
            <CardDescription>
              How long ago was each unpaid project marked accepted? The older
              the bucket, the more it needs chasing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-4">
              <AgingTile label="0–30 days" value={aging0_30} tone="positive" />
              <AgingTile label="31–60 days" value={aging31_60} tone="default" />
              <AgingTile label="61–90 days" value={aging61_90} tone="outstanding" />
              <AgingTile label="> 90 days" value={aging90Plus} tone="negative" />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Recent quotes ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardDescription>Last 8 quotes</CardDescription>
          <CardTitle>Recent</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed p-12 text-center text-sm text-muted-foreground">
              No quotes yet.{" "}
              <Link href="/quotes/new?type=rough" className="underline">
                Create your first one.
              </Link>
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quote #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Quoted total</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recent.map((r) => (
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
                      {r.total
                        ? `₹${formatIndianNumber(new Decimal(r.total))}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.issueDate as unknown as string}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <ArrowRight className="h-4 w-4" />
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

function PipelineTile({
  label,
  n,
  tone,
  subtitle,
  isPct,
}: {
  label: string;
  n: number | string;
  tone: "default" | "positive" | "negative";
  subtitle: string;
  isPct?: boolean;
}) {
  const cls =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-400"
        : "";
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={"mt-1 text-2xl font-semibold " + cls}>
        {n}
        {isPct && n !== "—" ? "%" : ""}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function MoneyTile({
  label,
  value,
  tone,
  subtitle,
}: {
  label: string;
  value: Decimal;
  tone: "default" | "positive" | "outstanding";
  subtitle: string;
}) {
  const cls =
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
      <p className={"mt-1 text-xl font-semibold tabular-nums " + cls}>
        ₹{formatIndianNumber(value)}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function AgingTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: Decimal;
  tone: "default" | "positive" | "outstanding" | "negative";
}) {
  const cls =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "outstanding"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "negative"
          ? "text-rose-700 dark:text-rose-400"
          : "";
  return (
    <div className="rounded-md border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={"mt-1 text-base font-semibold tabular-nums " + cls}>
        ₹{formatIndianNumber(value)}
      </p>
    </div>
  );
}

// Suppress imports unused only by code paths kept for compatibility.
void gte;
void lt;
void or;
void isNull;
