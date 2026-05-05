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

type Tone = "default" | "discount" | "gst" | "positive" | "negative" | "muted";

const TONE_TEXT: Record<Tone, string> = {
  default: "",
  muted: "text-muted-foreground",
  discount: "text-rose-600 dark:text-rose-400",
  gst: "text-amber-700 dark:text-amber-400",
  positive: "text-emerald-700 dark:text-emerald-400",
  negative: "text-rose-700 dark:text-rose-400",
};

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
  const hasSavings = totals.totalSavingsVsMrp.gt(0);
  const savingsPct = hasSavings && totals.totalMrpSubtotal.gt(0)
    ? totals.totalSavingsVsMrp.div(totals.totalMrpSubtotal).mul(100).toFixed(1)
    : null;

  const marginIsPositive = financials ? financials.grossMargin.gt(0) : true;
  const marginTone: Tone = financials
    ? marginIsPositive
      ? "positive"
      : "negative"
    : "default";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardDescription>{quoteNumber ?? "Unsaved quote"}</CardDescription>
          <CardTitle>What the client pays</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm tabular-nums">
          {totals.sections.map((s, idx) => {
            const sectionHasSavings = s.totalDiscountVsMrp.gt(0);
            const isLabour = s.gstAmount.isZero() && s.discountAmount.isZero();
            return (
              <div key={idx} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Section {String.fromCharCode(65 + idx)}
                </p>
                {isLabour ? (
                  <Row label="Lump sum" value={s.subtotal} />
                ) : (
                  <>
                    <Row label="List price (ex-GST)" value={s.mrpSubtotal} />
                    {sectionHasSavings ? (
                      <Row
                        label="Discount"
                        value={s.totalDiscountVsMrp.neg()}
                        parens
                        tone="discount"
                      />
                    ) : null}
                    <Row label="Net before GST" value={s.netAfterDiscount} />
                    {s.gstAmount.isZero() ? null : (
                      <Row label="GST" value={s.gstAmount} tone="gst" />
                    )}
                  </>
                )}
                <Row label="Section total" value={s.total} bold />
                {idx < totals.sections.length - 1 ? (
                  <Separator className="my-2" />
                ) : null}
              </div>
            );
          })}
          <Separator className="my-3" />
          <Row label="Grand total" value={totals.grandTotal} bold large />
          {hasSavings ? (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              You save{" "}
              <span className="font-semibold">
                ₹{formatIndianNumber(totals.totalSavingsVsMrp)}
              </span>{" "}
              vs list price
              {savingsPct ? ` (${savingsPct}% off)` : ""}.
            </div>
          ) : null}
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
            <Row
              label="Revenue (ex-GST)"
              value={financials.revenuePostDiscount}
              tone="muted"
            />
            <Row
              label="Cost of goods"
              value={financials.costOfGoods}
              tone="muted"
            />
            <Separator className="my-2" />
            <Row
              label="Gross margin"
              value={financials.grossMargin}
              bold
              tone={marginTone}
            />
            <div className="flex items-baseline justify-between gap-2 pt-0.5">
              <span className="text-muted-foreground">Margin %</span>
              <span className={`font-semibold ${TONE_TEXT[marginTone]}`}>
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
  tone = "default",
  parens,
}: {
  label: string;
  value: Decimal;
  bold?: boolean;
  large?: boolean;
  tone?: Tone;
  parens?: boolean;
}) {
  const toneClass = TONE_TEXT[tone];
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={toneClass}>{label}</span>
      <span
        className={[
          large ? "text-base" : "text-sm",
          bold ? "font-semibold" : "",
          toneClass,
        ].join(" ")}
      >
        ₹{formatIndianNumber(value, { negativeAsParens: parens })}
      </span>
    </div>
  );
}
