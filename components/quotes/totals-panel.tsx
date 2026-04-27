"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>
            {quoteNumber ? quoteNumber : "Unsaved quote"}
          </CardDescription>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm tabular-nums">
          {totals.sections.map((s, idx) => (
            <div key={idx} className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Section {String.fromCharCode(65 + idx)}
              </p>
              <Row label="Subtotal" value={s.subtotal} />
              {s.discountAmount.isZero() ? null : (
                <Row label="Discount" value={s.discountAmount.neg()} parens />
              )}
              {s.gstAmount.isZero() ? null : (
                <Row label="GST" value={s.gstAmount} />
              )}
              <Row label="Section total" value={s.total} bold />
              {idx < totals.sections.length - 1 ? <Separator /> : null}
            </div>
          ))}
          <Separator className="my-3" />
          <Row label="Grand total" value={totals.grandTotal} bold large />
          {totals.grandTotal.gt(0) ? (
            <p className="pt-2 text-xs italic text-muted-foreground">
              {amountInWords(totals.grandTotal)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isOwner && financials ? (
        <Card>
          <CardHeader>
            <CardDescription>Owner only</CardDescription>
            <CardTitle>Margin</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm tabular-nums">
            <Row label="Cost of goods" value={financials.costOfGoods} muted />
            <Row label="Revenue (ex-GST)" value={financials.revenuePostDiscount} muted />
            <Separator className="my-2" />
            <Row label="Gross margin" value={financials.grossMargin} bold />
            <p className="text-right text-sm">
              <span className="text-muted-foreground">Margin %</span>{" "}
              <span className="ml-2 font-medium">
                {financials.grossMarginPercent.toFixed(2)}%
              </span>
            </p>
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
