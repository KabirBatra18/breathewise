import { NextResponse } from "next/server";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients, payments, quotes, users } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { csvEscape } from "@/lib/csv";

/**
 * Accountant-friendly CSV of every payment received (or refunded) in
 * the given month. Use ?month=YYYY-MM (defaults to current IST month).
 *
 * Columns: received_at, quote#, client, payment_type, mode, reference,
 * amount_inr, recorded_by, notes.
 */
export async function GET(req: Request) {
  await requireOwner();
  const url = new URL(req.url);
  const monthParam = url.searchParams.get("month");
  const { from, to, label } = monthRange(monthParam);

  const rows = await db
    .select({
      receivedAt: payments.receivedAt,
      paymentType: payments.paymentType,
      paymentMode: payments.paymentMode,
      referenceNumber: payments.referenceNumber,
      amount: payments.amount,
      notes: payments.notes,
      quoteNumber: quotes.quoteNumber,
      clientName: clients.name,
      clientCompany: clients.companyName,
      recordedBy: users.fullName,
    })
    .from(payments)
    .leftJoin(quotes, eq(quotes.id, payments.quoteId))
    .leftJoin(clients, eq(clients.id, quotes.clientId))
    .leftJoin(users, eq(users.id, payments.recordedBy))
    .where(and(gte(payments.receivedAt, from), lt(payments.receivedAt, to)))
    .orderBy(asc(payments.receivedAt));

  const csv = [
    "received_at,quote_number,client,payment_type,mode,reference,amount_inr,recorded_by,notes",
    ...rows.map((r) =>
      [
        r.receivedAt.toISOString().slice(0, 10),
        r.quoteNumber ?? "",
        csvEscape(
          [r.clientName, r.clientCompany].filter(Boolean).join(" — ") || "—",
        ),
        r.paymentType,
        r.paymentMode ?? "",
        csvEscape(r.referenceNumber ?? ""),
        // Refunds prefixed with - so the sheet sums correctly.
        r.paymentType === "REFUND" ? `-${r.amount}` : r.amount,
        csvEscape(r.recordedBy ?? ""),
        csvEscape(r.notes ?? ""),
      ].join(","),
    ),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="bw-payments-${label}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function monthRange(monthParam: string | null): {
  from: Date;
  to: Date;
  label: string;
} {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  let year = ist.getUTCFullYear();
  let month = ist.getUTCMonth();
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [y, m] = monthParam.split("-").map(Number);
    year = y;
    month = m - 1;
  }
  const from = new Date(Date.UTC(year, month, 1, -5, -30));
  const to = new Date(Date.UTC(year, month + 1, 1, -5, -30));
  const label = `${year}-${String(month + 1).padStart(2, "0")}`;
  return { from, to, label };
}
