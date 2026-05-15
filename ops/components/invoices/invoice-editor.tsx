"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Trash2, X } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  addInvoiceLineAction,
  deleteDraftInvoiceAction,
  deleteInvoiceLineAction,
  finalizeInvoiceAction,
  updateInvoiceLineAction,
  updateInvoiceMetaAction,
} from "@/app/(app)/invoices/actions";
import {
  Decimal,
  computeInvoiceLineTax,
  formatIndianNumber,
  recomputeInvoiceTotalsFromLines,
} from "@/lib/pricing";

/**
 * Live invoice editor for DRAFT invoices. Each row of the lines table
 * is independently editable; field changes commit on blur. The totals
 * row re-derives from the in-memory lines so the user sees the math
 * change as they type, even before the server round-trips.
 */

export interface EditorLine {
  id: string;
  sno: number;
  sectionLetter: string | null;
  sectionTitle: string | null;
  isLabourStyle: boolean;
  skuSnapshot: string | null;
  description: string;
  hsnCode: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  gstRate: string;
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  lineTotal: string;
}

export interface EditorInvoice {
  id: string;
  status: string;
  issueDate: string;
  reverseCharge: boolean;
  includeLabour: boolean;
  notes: string | null;
  placeOfSupply: string;
  placeOfSupplyCode: string;
  isInterState: boolean;
  supplierState: string;
  buyerName: string;
  buyerCompany: string | null;
  deliveryAddress: string | null;
  deliveryState: string | null;
  sourceQuoteNumber: string | null;
}

export function InvoiceEditor({
  invoice,
  initialLines,
}: {
  invoice: EditorInvoice;
  initialLines: EditorLine[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  const [pending, startTransition] = useTransition();
  const [issueDate, setIssueDate] = useState(invoice.issueDate);
  const [reverseCharge, setReverseCharge] = useState(invoice.reverseCharge);
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(
    invoice.deliveryAddress ?? "",
  );
  const [deliveryState, setDeliveryState] = useState(
    invoice.deliveryState ?? "",
  );

  // Live totals from the current in-memory line set. Server is the
  // source of truth (each edit round-trips), but recomputing here
  // keeps the totals row snappy while the user types.
  const totals = recomputeInvoiceTotalsFromLines(
    lines.map((l) => ({
      taxableValue: new Decimal(l.taxableValue),
      cgstAmount: new Decimal(l.cgstAmount),
      sgstAmount: new Decimal(l.sgstAmount),
      igstAmount: new Decimal(l.igstAmount),
    })),
  );

  function patchLineLocal(lineId: string, patch: Partial<EditorLine>) {
    setLines((curr) =>
      curr.map((l) => {
        if (l.id !== lineId) return l;
        const merged = { ...l, ...patch };
        // Live-recompute tax on this line so the row's totals reflect
        // the typed values before the server confirms.
        const tax = computeInvoiceLineTax(
          new Decimal(merged.quantity || "0"),
          new Decimal(merged.unitPrice || "0"),
          new Decimal(merged.gstRate || "0"),
          invoice.isInterState,
        );
        return {
          ...merged,
          taxableValue: tax.taxableValue.toFixed(2),
          cgstAmount: tax.cgstAmount.toFixed(2),
          sgstAmount: tax.sgstAmount.toFixed(2),
          igstAmount: tax.igstAmount.toFixed(2),
          lineTotal: tax.lineTotal.toFixed(2),
        };
      }),
    );
  }

  function commitLine(line: EditorLine, patch: Partial<EditorLine>) {
    startTransition(async () => {
      const res = await updateInvoiceLineAction({
        lineId: line.id,
        description: patch.description,
        hsnCode: patch.hsnCode === undefined ? undefined : patch.hsnCode,
        quantity: patch.quantity,
        unit: patch.unit,
        unitPrice: patch.unitPrice,
        gstRate: patch.gstRate,
        isLabourStyle: patch.isLabourStyle,
      });
      if (!res.ok) {
        toast.error(res.error);
        // Revert local state — refetch from server.
        router.refresh();
        return;
      }
    });
  }

  function removeLine(lineId: string) {
    if (!confirm("Remove this line from the invoice?")) return;
    setLines((curr) => curr.filter((l) => l.id !== lineId));
    startTransition(async () => {
      const res = await deleteInvoiceLineAction({ lineId });
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
      }
    });
  }

  function addLine() {
    startTransition(async () => {
      const res = await addInvoiceLineAction({
        invoiceId: invoice.id,
        description: "New item",
        hsnCode: "8414",
        quantity: "1",
        unit: "pcs",
        unitPrice: "0",
        gstRate: "18",
        isLabourStyle: false,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Refetch to pick up the new row (with its server-allocated id).
      router.refresh();
    });
  }

  function saveMeta() {
    startTransition(async () => {
      const res = await updateInvoiceMetaAction({
        invoiceId: invoice.id,
        issueDate,
        reverseCharge,
        notes: notes.trim() === "" ? null : notes,
        deliveryAddress:
          deliveryAddress.trim() === "" ? null : deliveryAddress,
        deliveryState: deliveryState.trim() === "" ? null : deliveryState,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  function finalize() {
    if (lines.length === 0) {
      toast.error("Add at least one line before finalizing.");
      return;
    }
    if (
      !confirm(
        "Finalize this invoice? It will get a permanent invoice number and become a legal document — you won't be able to edit it after this.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await finalizeInvoiceAction({ invoiceId: invoice.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Invoice ${res.invoiceNumber} finalized.`);
      router.push(`/invoices/${invoice.id}`);
    });
  }

  function discard() {
    if (
      !confirm(
        "Discard this draft invoice entirely? This cannot be undone. The source quote stays untouched.",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteDraftInvoiceAction({ invoiceId: invoice.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Draft discarded.");
      router.push("/invoices");
    });
  }

  return (
    <div className="space-y-6">
      {/* ── Meta card ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardDescription>
            <InvoiceStatusBadge status="DRAFT" />
            {invoice.sourceQuoteNumber ? (
              <span className="ml-2 text-sm text-muted-foreground">
                Drafted from quote {invoice.sourceQuoteNumber}
              </span>
            ) : null}
          </CardDescription>
          <CardTitle>Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="issueDate">Invoice date</Label>
              <Input
                id="issueDate"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                onBlur={saveMeta}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Place of supply</Label>
              <div className="rounded-md border px-3 py-2 text-sm">
                <strong>{invoice.placeOfSupply}</strong>{" "}
                <span className="text-muted-foreground">
                  ({invoice.placeOfSupplyCode})
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {invoice.isInterState ? "Inter-state → IGST" : "Intra-state → CGST+SGST"}
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Bill to</Label>
              <div className="rounded-md border px-3 py-2 text-sm">
                {invoice.buyerName}
                {invoice.buyerCompany ? ` · ${invoice.buyerCompany}` : ""}
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="delAddr">Delivery address (ship-to)</Label>
              <Textarea
                id="delAddr"
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                onBlur={saveMeta}
                rows={2}
                placeholder="Leave blank if delivery = billing"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delState">Delivery state</Label>
              <Input
                id="delState"
                value={deliveryState}
                onChange={(e) => setDeliveryState(e.target.value)}
                onBlur={saveMeta}
                placeholder="Same as billing if blank"
              />
              <p className="text-xs text-muted-foreground">
                Changing this can flip CGST+SGST ↔ IGST. All line tax
                amounts re-derive automatically.
              </p>
            </div>
          </div>

          <Separator />

          <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={reverseCharge}
              onChange={(e) => {
                setReverseCharge(e.target.checked);
                startTransition(async () => {
                  await updateInvoiceMetaAction({
                    invoiceId: invoice.id,
                    reverseCharge: e.target.checked,
                  });
                  router.refresh();
                });
              }}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span>
              <span className="block font-medium">Reverse charge applies</span>
              <span className="block text-xs text-muted-foreground">
                Off by default. Rare for our category.
              </span>
            </span>
          </label>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveMeta}
              rows={2}
              placeholder="Anything you want printed at the bottom of the invoice"
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Lines table ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Line items</CardTitle>
            <CardDescription>
              {lines.length === 0
                ? "No items yet — click Add line to start."
                : `${lines.length} item${lines.length === 1 ? "" : "s"}. Edits save when you tab out of a field.`}
            </CardDescription>
          </div>
          <Button size="sm" onClick={addLine} disabled={pending}>
            <Plus className="h-4 w-4" />
            Add line
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20">HSN/SAC</TableHead>
                <TableHead className="w-16 text-right">Qty</TableHead>
                <TableHead className="w-16">Unit</TableHead>
                <TableHead className="w-24 text-right">Rate (₹)</TableHead>
                <TableHead className="w-16 text-right">GST %</TableHead>
                <TableHead className="w-28 text-right">Taxable</TableHead>
                {invoice.isInterState ? (
                  <TableHead className="w-24 text-right">IGST</TableHead>
                ) : (
                  <>
                    <TableHead className="w-24 text-right">CGST</TableHead>
                    <TableHead className="w-24 text-right">SGST</TableHead>
                  </>
                )}
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={line.id}>
                  <TableCell className="text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    {line.skuSnapshot ? (
                      <div className="font-mono text-[11px] font-semibold">
                        {line.skuSnapshot}
                      </div>
                    ) : null}
                    <Textarea
                      defaultValue={line.description}
                      onBlur={(e) => {
                        if (e.target.value === line.description) return;
                        patchLineLocal(line.id, { description: e.target.value });
                        commitLine(line, { description: e.target.value });
                      }}
                      rows={2}
                      className="min-h-[2.25rem] text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={line.hsnCode ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || null;
                        if (v === line.hsnCode) return;
                        patchLineLocal(line.id, { hsnCode: v });
                        commitLine(line, { hsnCode: v });
                      }}
                      className="text-sm tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={Number(line.quantity)}
                      onBlur={(e) => {
                        const v = e.target.value || "0";
                        if (new Decimal(v).eq(line.quantity)) return;
                        patchLineLocal(line.id, { quantity: v });
                        commitLine(line, { quantity: v });
                      }}
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      defaultValue={line.unit}
                      onBlur={(e) => {
                        const v = e.target.value.trim() || "pcs";
                        if (v === line.unit) return;
                        patchLineLocal(line.id, { unit: v });
                        commitLine(line, { unit: v });
                      }}
                      className="text-sm"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      defaultValue={Number(line.unitPrice)}
                      onBlur={(e) => {
                        const v = e.target.value || "0";
                        if (new Decimal(v).eq(line.unitPrice)) return;
                        patchLineLocal(line.id, { unitPrice: v });
                        commitLine(line, { unitPrice: v });
                      }}
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      min={0}
                      max={100}
                      defaultValue={Number(line.gstRate)}
                      onBlur={(e) => {
                        const v = e.target.value || "0";
                        if (new Decimal(v).eq(line.gstRate)) return;
                        patchLineLocal(line.id, { gstRate: v });
                        commitLine(line, { gstRate: v });
                      }}
                      className="text-right tabular-nums"
                    />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIndianNumber(new Decimal(line.taxableValue))}
                  </TableCell>
                  {invoice.isInterState ? (
                    <TableCell className="text-right tabular-nums">
                      {formatIndianNumber(new Decimal(line.igstAmount))}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {formatIndianNumber(new Decimal(line.cgstAmount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatIndianNumber(new Decimal(line.sgstAmount))}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatIndianNumber(new Decimal(line.lineTotal))}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeLine(line.id)}
                      disabled={pending}
                      aria-label="Remove line"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={invoice.isInterState ? 10 : 11}
                    className="py-12 text-center text-sm text-muted-foreground"
                  >
                    No lines yet. Click <strong>Add line</strong> above.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ── Totals card ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
          <CardDescription>
            Live preview. The Finalize action will commit these to the legal
            invoice document.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm tabular-nums">
          <Row
            label="Total taxable value"
            value={totals.totalTaxableValue}
          />
          {invoice.isInterState ? (
            <Row label="Total IGST" value={totals.totalIgst} />
          ) : (
            <>
              <Row label="Total CGST" value={totals.totalCgst} />
              <Row label="Total SGST" value={totals.totalSgst} />
            </>
          )}
          <Row label="Sub-total" value={totals.totalInvoiceValue} bold />
          {!totals.roundOff.isZero() ? (
            <Row
              label="Round Off"
              value={totals.roundOff}
              tone={totals.roundOff.isNegative() ? "negative" : "positive"}
            />
          ) : null}
          <Separator className="my-2" />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-base font-semibold">Grand Total</span>
            <span className="text-2xl font-semibold tabular-nums">
              ₹{formatIndianNumber(totals.grandTotalRounded)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Lifecycle controls ────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Finalize this invoice</CardTitle>
          <CardDescription>
            Once finalized, the invoice gets a permanent number (e.g.
            BW/INV/2627/0001), becomes a legal document, and can no longer
            be edited. The PDF download unlocks at this point.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-start gap-3">
          <Button onClick={finalize} disabled={pending || lines.length === 0}>
            <Check className="h-4 w-4" />
            Finalize &amp; Issue
          </Button>
          <Button variant="destructive" onClick={discard} disabled={pending}>
            <X className="h-4 w-4" />
            Discard draft
          </Button>
          <p className="flex-1 text-xs text-muted-foreground">
            Discarding is permanent but the source quote stays untouched — you
            can always start a fresh draft from it.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: Decimal;
  bold?: boolean;
  tone?: "positive" | "negative";
}) {
  const cls =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-400"
        : "";
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={`${bold ? "font-semibold" : ""} ${cls}`}>
        ₹{formatIndianNumber(value)}
      </span>
    </div>
  );
}
