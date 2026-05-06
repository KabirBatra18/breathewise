import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { AlertTriangle, CalendarClock, Check } from "lucide-react";
import { db } from "@/lib/db/client";
import { quoteTierFinancials, quotes } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
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
import {
  monthLabel,
  nextDeadlines,
  summariseGst,
} from "@/lib/gst/monthly";

export const metadata = { title: "GST" };

const MONTHS_TO_SHOW = 12;

export default async function GstPage() {
  await requireOwner();

  const now = new Date();
  const deadlines = nextDeadlines(now);

  // IST anchor for month boundaries.
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const baseYear = ist.getUTCFullYear();
  const baseMonth = ist.getUTCMonth();

  // Pull every accepted/advance-paid quote in the window once, then
  // bucket in JS.
  const earliest = new Date(
    Date.UTC(baseYear, baseMonth - (MONTHS_TO_SHOW - 1), 1, -5, -30),
  );
  const upper = new Date(Date.UTC(baseYear, baseMonth + 1, 1, -5, -30));

  const rows = await db
    .select({
      id: quotes.id,
      closedAt: quotes.closedAt,
      revenuePostDiscount: quoteTierFinancials.revenuePostDiscount,
      gstAmount: quoteTierFinancials.gstAmount,
      costOfGoods: quoteTierFinancials.costOfGoods,
    })
    .from(quotes)
    .leftJoin(
      quoteTierFinancials,
      and(
        eq(quoteTierFinancials.quoteId, quotes.id),
        eq(quoteTierFinancials.tierLabel, "ROUGH"),
      ),
    )
    .where(
      and(
        inArray(quotes.status, ["ACCEPTED", "ADVANCE_PAID"]),
        gte(quotes.closedAt, earliest),
        lt(quotes.closedAt, upper),
      ),
    );

  // Bucket by IST year-month.
  const byMonth = new Map<
    string,
    { taxable: Decimal; outputGst: Decimal; cost: Decimal; n: number }
  >();
  for (const r of rows) {
    if (!r.closedAt) continue;
    const istClose = new Date(r.closedAt.getTime() + 5.5 * 60 * 60 * 1000);
    const key = `${istClose.getUTCFullYear()}-${String(
      istClose.getUTCMonth(),
    ).padStart(2, "0")}`;
    const entry = byMonth.get(key) ?? {
      taxable: ZERO,
      outputGst: ZERO,
      cost: ZERO,
      n: 0,
    };
    entry.taxable = entry.taxable.plus(
      r.revenuePostDiscount ? new Decimal(r.revenuePostDiscount) : ZERO,
    );
    entry.outputGst = entry.outputGst.plus(
      r.gstAmount ? new Decimal(r.gstAmount) : ZERO,
    );
    entry.cost = entry.cost.plus(
      r.costOfGoods ? new Decimal(r.costOfGoods) : ZERO,
    );
    entry.n += 1;
    byMonth.set(key, entry);
  }

  const months = Array.from({ length: MONTHS_TO_SHOW }).map((_, i) => {
    const m = baseMonth - i;
    const y = baseYear + Math.floor(m / 12);
    const monthIdx = ((m % 12) + 12) % 12;
    const key = `${y}-${String(monthIdx).padStart(2, "0")}`;
    const bucket = byMonth.get(key) ?? {
      taxable: ZERO,
      outputGst: ZERO,
      cost: ZERO,
      n: 0,
    };
    const summary = summariseGst({
      taxableValue: toMoney(bucket.taxable),
      outputGst: toMoney(bucket.outputGst),
      costOfGoods: toMoney(bucket.cost),
    });
    return {
      year: y,
      month: monthIdx,
      key,
      label: monthLabel(y, monthIdx),
      n: bucket.n,
      ...summary,
    };
  });

  const current = months[0];
  // Previous-month totals for the "owe this filing" tile.
  const previous = months[1];

  // YTD: financial year (April → March in India).
  let ytdTaxable = ZERO;
  let ytdOutput = ZERO;
  let ytdInput = ZERO;
  let ytdNet = ZERO;
  for (const m of months) {
    // Month is in current FY if (year > fyYear) or (year === fyYear AND month >= 3)
    // We approximate by accumulating only the months whose label is in this FY.
    const thisFyStart =
      baseMonth >= 3
        ? { y: baseYear, m: 3 }
        : { y: baseYear - 1, m: 3 };
    const monthAbs = m.year * 12 + m.month;
    const startAbs = thisFyStart.y * 12 + thisFyStart.m;
    if (monthAbs >= startAbs) {
      ytdTaxable = ytdTaxable.plus(m.taxableValue);
      ytdOutput = ytdOutput.plus(m.outputGst);
      ytdInput = ytdInput.plus(m.estInputGst);
      ytdNet = ytdNet.plus(m.netLiability);
    }
  }

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">GST</h1>
        <p className="text-sm text-muted-foreground">
          Output, estimated input, and net liability per month — owner-only.
          Use this alongside your CA, not as a replacement for the GST
          portal.
        </p>
      </div>

      {/* This-month tiles (current period) */}
      <div className="grid gap-3 md:grid-cols-4">
        <Tile
          label={`${current.label} · taxable`}
          value={current.taxableValue}
          tone="default"
          subtitle={`${current.n} accepted quote${current.n === 1 ? "" : "s"}`}
        />
        <Tile
          label="Output GST collected"
          value={current.outputGst}
          tone="default"
          subtitle="from sales (18%)"
        />
        <Tile
          label="Est. input GST (ITC)"
          value={current.estInputGst}
          tone="muted"
          subtitle="cost × 18%"
        />
        <Tile
          label="Net liability"
          value={current.netLiability}
          tone={current.netLiability.isZero() ? "positive" : "outstanding"}
          subtitle="output − ITC"
        />
      </div>

      {/* Previous-month focus + filing reminders */}
      <div className="grid gap-4 md:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardDescription>Owed for {previous.label}</CardDescription>
            <CardTitle>
              ₹{formatIndianNumber(previous.netLiability)} ·{" "}
              <span className="text-base font-normal text-muted-foreground">
                CGST ₹{formatIndianNumber(previous.netGstSplit.cgst)} · SGST ₹
                {formatIndianNumber(previous.netGstSplit.sgst)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-3">
            <Mini label="Taxable" v={previous.taxableValue} />
            <Mini label="Output GST" v={previous.outputGst} />
            <Mini label="Est. input GST" v={previous.estInputGst} muted />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>Filing calendar</CardDescription>
            <CardTitle>Upcoming returns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {deadlines.length === 0 ? (
              <p className="text-muted-foreground">
                No upcoming filings in window.
              </p>
            ) : (
              deadlines.map((d) => (
                <div
                  key={`${d.form}-${d.forMonth}`}
                  className="flex items-center justify-between gap-2 rounded-md border p-2"
                >
                  <div className="flex items-center gap-2">
                    {d.status === "OVERDUE" ? (
                      <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                    ) : d.status === "DUE_SOON" ? (
                      <CalendarClock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    )}
                    <span className="font-medium">{d.form}</span>
                    <span className="text-muted-foreground">
                      for {d.forMonth}
                    </span>
                  </div>
                  <span
                    className={
                      d.status === "OVERDUE"
                        ? "text-rose-700 dark:text-rose-400"
                        : d.status === "DUE_SOON"
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-muted-foreground"
                    }
                  >
                    {d.daysAway < 0
                      ? `${-d.daysAway}d overdue`
                      : `${d.daysAway}d away`}
                  </span>
                </div>
              ))
            )}
            <p className="text-[10px] text-muted-foreground">
              GSTR-1 (sales detail) due 11th · GSTR-3B (summary + payment) due
              20th of the next month.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* YTD */}
      <Card>
        <CardHeader>
          <CardDescription>Financial year so far</CardDescription>
          <CardTitle>FY-to-date</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <Mini label="Taxable" v={toMoney(ytdTaxable)} />
          <Mini label="Output GST" v={toMoney(ytdOutput)} />
          <Mini label="Est. input GST" v={toMoney(ytdInput)} muted />
          <Mini label="Net liability" v={toMoney(ytdNet)} bold />
        </CardContent>
      </Card>

      {/* 12-month history */}
      <Card>
        <CardHeader>
          <CardDescription>Last 12 months</CardDescription>
          <CardTitle>Monthly breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Quotes</TableHead>
                <TableHead className="text-right">Taxable (₹)</TableHead>
                <TableHead className="text-right">Output GST (₹)</TableHead>
                <TableHead className="text-right">Est. input GST (₹)</TableHead>
                <TableHead className="text-right">Net liability (₹)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.key}>
                  <TableCell>{m.label}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {m.n}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIndianNumber(m.taxableValue)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIndianNumber(m.outputGst)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatIndianNumber(m.estInputGst)}
                  </TableCell>
                  <TableCell
                    className={
                      "text-right tabular-nums font-medium " +
                      (m.netLiability.isZero()
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-amber-700 dark:text-amber-400")
                    }
                  >
                    {formatIndianNumber(m.netLiability)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <p className="font-medium">
          Caveat: this dashboard estimates input GST as cost-of-goods × 18%.
        </p>
        <p>
          Real ITC depends on Astberg/supplier invoices uploaded in their
          GSTR-1, which reflects in your GSTR-2B. Treat numbers here as a
          working snapshot, not a substitute for portal data.
        </p>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
  subtitle,
}: {
  label: string;
  value: Decimal;
  tone: "default" | "muted" | "positive" | "outstanding";
  subtitle: string;
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
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Mini({
  label,
  v,
  bold,
  muted,
}: {
  label: string;
  v: Decimal;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={
          "mt-0.5 tabular-nums " +
          (bold ? "text-base font-semibold" : "text-sm") +
          (muted ? " text-muted-foreground" : "")
        }
      >
        ₹{formatIndianNumber(v)}
      </p>
    </div>
  );
}
