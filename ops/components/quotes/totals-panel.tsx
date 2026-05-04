"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  type Decimal,
  amountInWords,
  formatIndianNumber,
  type Financials,
  type QuoteTotals,
} from "@/lib/pricing";

export function TotalsPanel({
  totals,
  financials,
  isOwner,
  quoteNumber,
}: {
  totals: QuoteTotals;
  financials: Financials | null;
  isOwner: boolean;
  quoteNumber?: string;
}) {
  const isEmpty = totals.grandTotal.isZero();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>{quoteNumber ?? "Unsaved quote"}</CardDescription>
          <CardTitle>What the client pays</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm tabular-nums">
          {totals.sections.map((s, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Section {String.fromCharCode(65 + idx)}
              </p>
              <Row label="Items subtotal" value={s.subtotal} />
              {s.discountAmount.isZero() ? null : (
                <Row label="Discount" value={s.discountAmount.neg()} parens />
              )}
              {s.gstAmount.isZero() ? null : (
                <Row label="GST" value={s.gstAmount} />
              )}
              <Row label="Section total" value={s.total} bold />
              {idx < totals.sections.length - 1 ? (
                <Separator className="my-2" />
              ) : null}
            </div>
          ))}
          <Separator className="my-3" />
          <Row label="Grand total" value={totals.grandTotal} bold large />
          {!isEmpty ? (
            <p className="pt-1 text-xs italic text-muted-foreground">
              {amountInWords(totals.grandTotal)}
            </p>
          ) : (
            <p className="pt-1 text-xs italic text-muted-foreground">
              Add line items to see totals.
            </p>
          )}
        </CardContent>
      </Card>

      {isOwner && financials ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardDescription>Owner only — not on PDF</CardDescription>
            <CardTitle>Margin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm tabular-nums">
            <Row label="Revenue (ex-GST)" value={financials.revenuePostDiscount} muted />
            <Row label="Cost of goods" value={financials.costOfGoods} muted />
            <Separator className="my-2" />
            <Row label="Gross margin" value={financials.grossMargin} bold />
            <div className="flex items-baseline justify-between gap-2 pt-0.5">
              <span className="text-muted-foreground">Margin %</span>
              <span className="font-semibold">
                {financials.grossMarginPercent.toFixed(2)}%
              </span>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  large,
  muted,
  parens,
}: {
  label: string;
  value: Decimal;
  bold?: boolean;
  large?: boolean;
  muted?: boolean;
  parens?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span
        className={[
          large ? "text-base" : "text-sm",
          bold ? "font-semibold" : "",
          muted ? "text-muted-foreground" : "",
        ].join(" ")}
      >
        ₹{formatIndianNumber(value, { negativeAsParens: parens })}
      </span>
    </div>
  );
}
