import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { QUOTE_STATUS_LABELS } from "@/lib/constants";

/**
 * Single source of truth for how every status renders in the UI.
 *
 * Why this exists:
 *   • Before: status badges used the default secondary variant
 *     everywhere, so the eye couldn't anchor on colour. Active /
 *     terminal / paid / draft states all looked identical.
 *   • After: one map, one classList per status. Scan a list of
 *     quotes and you instantly see which are open, which are won,
 *     which are dead.
 *
 * Palette intent (all colours from Tailwind defaults so they
 * match the rest of the app and stay legible in dark mode):
 *   amber  — DRAFT / unsent (still mutable, no commitment)
 *   sky    — SENT / NEGOTIATING (active, with the customer)
 *   emerald — ACCEPTED / ISSUED / PAID (closed-won / live)
 *   teal   — ADVANCE_PAID (partial closure)
 *   rose   — REJECTED (closed-lost) + DUE (overdue payments)
 *   slate  — EXPIRED / CANCELLED / SUPERSEDED (dead, archival)
 *   muted  — anything else / unknown
 */

type StatusTone =
  | "amber"
  | "sky"
  | "emerald"
  | "teal"
  | "rose"
  | "slate"
  | "muted"
  | "violet";

const TONE_CLASSES: Record<StatusTone, string> = {
  amber:
    "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  sky:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  emerald:
    "border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  teal:
    "border-teal-300 bg-teal-100 text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200",
  rose:
    "border-rose-300 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  slate:
    "border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300",
  muted:
    "border-muted bg-muted/30 text-muted-foreground",
  violet:
    "border-violet-300 bg-violet-100 text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
};

const QUOTE_STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: "amber",
  SENT: "sky",
  NEGOTIATING: "violet",
  ACCEPTED: "emerald",
  ADVANCE_PAID: "teal",
  REJECTED: "rose",
  EXPIRED: "slate",
  CANCELLED: "slate",
  SUPERSEDED: "slate",
};

const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
};

const INVOICE_STATUS_TONE: Record<string, StatusTone> = {
  DRAFT: "amber",
  ISSUED: "emerald",
};

const PAYMENT_TONE: Record<string, StatusTone> = {
  PAID: "emerald",
  PARTIAL: "amber",
  DUE: "rose",
  OVERPAID: "violet",
};

export function QuoteStatusBadge({ status }: { status: string }) {
  const tone = QUOTE_STATUS_TONE[status] ?? "muted";
  const label = QUOTE_STATUS_LABELS[status] ?? status;
  return (
    <Badge variant="outline" className={TONE_CLASSES[tone]}>
      {label}
    </Badge>
  );
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const tone = INVOICE_STATUS_TONE[status] ?? "muted";
  const label = INVOICE_STATUS_LABEL[status] ?? status;
  return (
    <Badge variant="outline" className={TONE_CLASSES[tone]}>
      {label}
    </Badge>
  );
}

export function PaymentStatusBadge({
  status,
}: {
  status: "PAID" | "PARTIAL" | "DUE" | "OVERPAID" | string;
}) {
  const tone = PAYMENT_TONE[status] ?? "muted";
  return (
    <Badge variant="outline" className={TONE_CLASSES[tone]}>
      {status}
    </Badge>
  );
}

/**
 * Generic tone badge for arbitrary labels (e.g. CGST+SGST vs IGST).
 * Use sparingly — prefer the typed variants above.
 */
export function ToneBadge({
  tone = "muted",
  children,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
}) {
  return (
    <Badge variant="outline" className={TONE_CLASSES[tone]}>
      {children}
    </Badge>
  );
}
