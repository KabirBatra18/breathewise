"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  addPaymentAction,
  deletePaymentAction,
  PAYMENT_MODE_LABELS,
  PAYMENT_TYPE_LABELS,
} from "@/app/(app)/payments/actions";
import { Decimal } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";

const TYPES: Array<keyof typeof PAYMENT_TYPE_LABELS> = [
  "ADVANCE",
  "INTERIM",
  "FINAL",
  "FULL",
  "REFUND",
];
const MODES: Array<keyof typeof PAYMENT_MODE_LABELS> = [
  "BANK_TRANSFER",
  "UPI",
  "CHEQUE",
  "CASH",
  "CARD",
  "OTHER",
];

const TYPE_BADGE: Record<string, "default" | "secondary" | "destructive"> = {
  ADVANCE: "default",
  INTERIM: "default",
  FINAL: "default",
  FULL: "default",
  REFUND: "destructive",
};

export interface PaymentRow {
  id: string;
  paymentType: string;
  amount: string;
  paymentMode: string | null;
  referenceNumber: string | null;
  receivedAt: string; // ISO
  notes: string | null;
}

const todayIST = (): string => {
  const d = new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

export function PaymentLedger({
  quoteId,
  contractValue,
  totalReceived,
  outstanding,
  payments,
  canEdit,
}: {
  quoteId: string;
  contractValue: string;
  totalReceived: string;
  outstanding: string;
  payments: PaymentRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();

  // Default the new-payment form's amount to the outstanding value so a
  // single click adds the remaining balance.
  const [type, setType] = useState<keyof typeof PAYMENT_TYPE_LABELS>(
    payments.length === 0 ? "ADVANCE" : "INTERIM",
  );
  const [amount, setAmount] = useState<string>(outstanding);
  const [mode, setMode] = useState<keyof typeof PAYMENT_MODE_LABELS>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [date, setDate] = useState(todayIST());
  const [notes, setNotes] = useState("");

  function reset() {
    setShowForm(false);
    setType(payments.length === 0 ? "ADVANCE" : "INTERIM");
    setAmount(outstanding);
    setMode("BANK_TRANSFER");
    setReference("");
    setDate(todayIST());
    setNotes("");
  }

  function submit() {
    startTransition(async () => {
      const res = await addPaymentAction({
        quoteId,
        paymentType: type,
        amount,
        paymentMode: mode,
        referenceNumber: reference,
        receivedAt: date,
        notes,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Payment recorded.");
      reset();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Contract value" value={contractValue} tone="default" />
        <Tile label="Received" value={totalReceived} tone="positive" />
        <Tile label="Outstanding" value={outstanding} tone="outstanding" />
      </div>

      {payments.length === 0 ? (
        <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
          No payments recorded yet.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {canEdit ? <TableHead className="w-8" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-sm">
                  {p.receivedAt.slice(0, 10)}
                </TableCell>
                <TableCell>
                  <Badge variant={TYPE_BADGE[p.paymentType] ?? "secondary"}>
                    {PAYMENT_TYPE_LABELS[p.paymentType as keyof typeof PAYMENT_TYPE_LABELS] ??
                      p.paymentType}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {p.paymentMode
                    ? PAYMENT_MODE_LABELS[
                        p.paymentMode as keyof typeof PAYMENT_MODE_LABELS
                      ] ?? p.paymentMode
                    : "—"}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {p.referenceNumber ?? "—"}
                </TableCell>
                <TableCell
                  className={
                    "text-right tabular-nums" +
                    (p.paymentType === "REFUND"
                      ? " text-rose-600 dark:text-rose-400"
                      : "")
                  }
                >
                  {p.paymentType === "REFUND" ? "-" : ""}₹
                  {formatIndianNumber(new Decimal(p.amount))}
                </TableCell>
                {canEdit ? (
                  <TableCell>
                    <form action={deletePaymentAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="quoteId" value={quoteId} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Delete payment"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {canEdit ? (
        showForm ? (
          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">Record a payment</p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={type}
                  onValueChange={(v) => setType(v as typeof type)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {PAYMENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="amt">Amount (₹, with GST)</Label>
                <Input
                  id="amt"
                  type="number"
                  step="0.01"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select
                  value={mode}
                  onValueChange={(v) => setMode(v as typeof mode)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {PAYMENT_MODE_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ref">Reference / UTR</Label>
                <Input
                  id="ref"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. UTR123… or cheque #"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date received</Label>
                <Input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="(optional)"
                  rows={2}
                />
              </div>
            </div>
            <Separator />
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={reset} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={pending}>
                {pending ? "Saving…" : "Record payment"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowForm(true)}
          >
            <Plus className="h-4 w-4" />
            Add payment
          </Button>
        )
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "positive" | "outstanding";
}) {
  const v = new Decimal(value);
  const colour =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "outstanding"
        ? v.isZero()
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-amber-700 dark:text-amber-400"
        : "";
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={"mt-1 text-xl font-semibold tabular-nums " + colour}>
        ₹{formatIndianNumber(v)}
      </p>
    </div>
  );
}
