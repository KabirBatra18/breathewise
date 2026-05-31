import { NextResponse } from "next/server";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clients,
  payments,
  quoteTierFinancials,
  quotes,
} from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { Decimal, ZERO, toMoney } from "@/lib/pricing/decimal";
import { csvEscape } from "@/lib/csv";

/**
 * Accountant-friendly CSV of every accepted/advance-paid quote for the
 * given month. Use ?month=YYYY-MM (defaults to current month, IST).
 *
 * Columns: quote#, client, status, accepted_at, contract_value (₹),
 * received (₹), outstanding (₹), accepted_notes.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  await requireOwner();
  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month");
  const { from, to, label } = monthRange(monthParam);

  const rows = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      status: quotes.status,
      clientName: clients.name,
      clientCompany: clients.companyName,
      acceptedTotal: quotes.acceptedTotal,
      acceptedNotes: quotes.acceptedNotes,
      closedAt: quotes.closedAt,
    })
    .from(quotes)
    .leftJoin(clients, eq(clients.id, quotes.clientId))
    .where(
      and(
        inArray(quotes.status, ["ACCEPTED", "ADVANCE_PAID"]),
        gte(quotes.closedAt, from),
        lt(quotes.closedAt, to),
      ),
    )
    .orderBy(asc(quotes.closedAt));

  const ids = rows.map((r) => r.id);
  const [tiers, paid] = await Promise.all([
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
            received: rawPaidExpr(),
          })
          .from(payments)
          .where(inArray(payments.quoteId, ids))
          .groupBy(payments.quoteId),
  ]);

  const fallback = new Map<string, string>();
  for (const t of tiers) fallback.set(t.quoteId, t.totalInvoiceValue);
  const recv = new Map<string, Decimal>();
  for (const p of paid)
    recv.set(p.quoteId, p.received ? new Decimal(p.received) : ZERO);

  const csv = [
    "quote_number,client,status,accepted_at,contract_value_inr,received_inr,outstanding_inr,notes",
    ...rows.map((r) => {
      const contract = r.acceptedTotal
        ? new Decimal(r.acceptedTotal)
        : fallback.get(r.id)
          ? new Decimal(fallback.get(r.id)!)
          : ZERO;
      const received = recv.get(r.id) ?? ZERO;
      const due = toMoney(contract.minus(received));
      const outstanding = due.isNegative() ? "0.00" : due.toFixed(2);
      const client =
        [r.clientName, r.clientCompany].filter(Boolean).join(" — ") || "—";
      return [
        r.quoteNumber,
        csvEscape(client),
        r.status,
        r.closedAt ? r.closedAt.toISOString().slice(0, 10) : "",
        contract.toFixed(2),
        received.toFixed(2),
        outstanding,
        csvEscape(r.acceptedNotes ?? ""),
      ].join(",");
    }),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bw-accepted-${label}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function monthRange(monthParam: string | null): {
  from: Date;
  to: Date;
  label: string;
} {
  // IST month boundaries.
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  let year = ist.getUTCFullYear();
  let month = ist.getUTCMonth(); // 0–11
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  }
  // 00:00 IST start of month → UTC = previous day 18:30.
  const from = new Date(Date.UTC(year, month, 1, -5, -30));
  const to = new Date(Date.UTC(year, month + 1, 1, -5, -30));
  const label = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { from, to, label };
}

function rawPaidExpr() {
  return sql<string>`SUM(CASE WHEN ${payments.paymentType} = 'REFUND' THEN -${payments.amount} ELSE ${payments.amount} END)`;
}
