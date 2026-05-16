"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Trash2, X } from "lucide-react";
import { InvoiceStatusBadge } from "@/components/ui/status-badge";
import { HelpHint } from "@/components/ui/help-hint";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  deleteDraftInvoiceAction,
  deleteInvoiceLineAction,
  finalizeInvoiceAction,
  updateInvoiceLineAction,
  updateInvoiceMetaAction,
} from "@/app/(app)/invoices/actions";
import { AddCustomLineDialog } from "@/components/invoices/add-custom-line-dialog";
import { AddFromCatalogDialog } from "@/components/invoices/add-from-catalog-dialog";
import type { ProductOption } from "@/components/quotes/product-picker";
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
  products,
}: {
  invoice: EditorInvoice;
  initialLines: EditorLine[];
  /** Astberg catalog (server-loaded). Drives the
   *  "Add from catalog" dialog. */
  products: ProductOption[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditorLine[]>(initialLines);
  const [pending, startTransition] = useTransition();
  // Single AlertDialog instance, driven by state. Each destructive
  // action sets pendingConfirm with its own title/handler — much nicer
  // than three separate AlertDialog components or native confirm().
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: string;
    actionLabel: string;
    destructive?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [issueDate, setIssueDate] = useState(invoice.issueDate);
  const [reverseCharge, setReverseCharge] = useState(invoice.reverseCharge);
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [deliveryAddress, setDeliveryAddress] = useState(
    invoice.deliveryAddress ?? "",
  );
  const [deliveryState, setDeliveryState] = useState(
    invoice.deliveryState ?? "",
  );
  // Tracks lines that successfully round-tripped a save in the last
  // ~1.5s. Used to flash a green ✓ on the row so silent server-side
  // saves stop feeling broken.
  const [savedFlash, setSavedFlash] = useState<Set<string>>(new Set());

  function flashSaved(lineId: string) {
    setSavedFlash((s) => {
      const next = new Set(s);
      next.add(lineId);
      return next;
    });
    setTimeout(() => {
      setSavedFlash((s) => {
        const next = new Set(s);
        next.delete(lineId);
        return next;
      });
    }, 1500);
  }

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
      flashSaved(line.id);
    });
  }

  function removeLine(lineId: string) {
    const line = lines.find((l) => l.id === lineId);
    setPendingConfirm({
      title: "Remove this line?",
      description: line?.description
        ? `"${line.description.slice(0, 80)}${line.description.length > 80 ? "…" : ""}" will be deleted from this draft. You can re-add it later if needed.`
        : "This line will be deleted from this draft.",
      actionLabel: "Remove line",
      destructive: true,
      onConfirm: () => {
        setLines((curr) => curr.filter((l) => l.id !== lineId));
        startTransition(async () => {
          const res = await deleteInvoiceLineAction({ lineId });
          if (!res.ok) {
            toast.error(res.error);
            router.refresh();
          }
        });
      },
    });
  }

  /**
   * Shared optimistic-append: both the catalog dialog and the custom
   * dialog round-trip the server, then call this with the inserted
   * row. We append to local state so the new line shows up instantly,
   * without a router.refresh round-trip (which wouldn't sync this
   * client component's state anyway since useState is mount-only).
   */
  function appendLineFromServer(
    line: import("@/app/(app)/invoices/actions").CreatedInvoiceLine,
    sku: string | null,
  ) {
    const newLine: EditorLine = {
      id: line.id,
      sno: line.sno,
      sectionLetter: line.sectionLetter,
      sectionTitle: line.sectionTitle,
      isLabourStyle: line.isLabourStyle,
      skuSnapshot: sku,
      description: line.description,
      hsnCode: line.hsnCode,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      gstRate: line.gstRate,
      taxableValue: line.taxableValue,
      cgstAmount: line.cgstAmount,
      sgstAmount: line.sgstAmount,
      igstAmount: line.igstAmount,
      lineTotal: line.lineTotal,
    };
    setLines((curr) => [...curr, newLine]);
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
    setPendingConfirm({
      title: "Finalize this invoice?",
      description:
        "An invoice number will be allocated (e.g. BW/INV/2627/0001) and the document becomes legally binding. After this you can't edit any line, total or party. The PDF will unlock for download.",
      actionLabel: "Finalize & issue",
      onConfirm: () => {
        startTransition(async () => {
          const res = await finalizeInvoiceAction({ invoiceId: invoice.id });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`Invoice ${res.invoiceNumber} finalized.`);
          router.push(`/invoices/${invoice.id}`);
        });
      },
    });
  }

  function discard() {
    setPendingConfirm({
      title: "Discard this draft?",
      description:
        "This deletes the draft invoice entirely. The source quote is untouched — you can always spawn a fresh draft from it.",
      actionLabel: "Discard draft",
      destructive: true,
      onConfirm: () => {
        startTransition(async () => {
          const res = await deleteDraftInvoiceAction({ invoiceId: invoice.id });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Draft discarded.");
          router.push("/invoices");
        });
      },
    });
  }

  return (
    <div className="space-y-6">
      {/* Single AlertDialog driven by pendingConfirm — destructive
          actions (remove line, discard draft, finalize) flow through
          this instead of native confirm(). */}
      <AlertDialog
        open={!!pendingConfirm}
        onOpenChange={(o) => {
          if (!o) setPendingConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingConfirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConfirm?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant={pendingConfirm?.destructive ? "destructive" : "default"}
              onClick={() => {
                pendingConfirm?.onConfirm();
                setPendingConfirm(null);
              }}
            >
              {pendingConfirm?.actionLabel ?? "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              <Label className="flex items-center gap-1">
                Place of supply
                <HelpHint>
                  The state where the supply terminates (i.e. where the
                  customer takes delivery). If it&apos;s the same state as
                  your GSTIN, the tax splits as CGST + SGST. If different,
                  one combined IGST line.
                </HelpHint>
              </Label>
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
              <span className="flex items-center gap-1 font-medium">
                Reverse charge applies
                <HelpHint>
                  Forward charge (default) = you collect GST from the
                  customer and remit it to the government. Reverse charge
                  = the customer pays the GST direct to the government.
                  Rare in our category — only certain notified supplies
                  (legal services to businesses, GTA, security agency,
                  unregistered → registered B2B transactions).
                </HelpHint>
              </span>
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
                ? "No items yet — pick from the Astberg catalog or click Add line."
                : `${lines.length} item${lines.length === 1 ? "" : "s"}. Edits save when you tab out of a field.`}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <AddFromCatalogDialog
              invoiceId={invoice.id}
              products={products}
              onAdded={appendLineFromServer}
              trigger={
                <Button size="sm" variant="default">
                  <Plus className="h-4 w-4" />
                  Add from catalog
                </Button>
              }
            />
            <AddCustomLineDialog
              invoiceId={invoice.id}
              isInterState={invoice.isInterState}
              onAdded={appendLineFromServer}
              trigger={
                <Button size="sm" variant="outline">
                  <Plus className="h-4 w-4" />
                  Add custom line
                </Button>
              }
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-20">
                  <span className="inline-flex items-center gap-1">
                    HSN/SAC
                    <HelpHint>
                      4-digit code that classifies the item under GST.
                      Most of our fans are 8414, filters 8421, ERVs 8415,
                      installation services SAC 9954. Mandatory on every
                      tax invoice (Rule 46g).
                    </HelpHint>
                  </span>
                </TableHead>
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
                    <div className="flex items-center justify-end gap-1">
                      {/* Brief ✓ flash after a successful server-side
                          save so the user knows the blur committed. */}
                      {savedFlash.has(line.id) ? (
                        <Check
                          className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                          aria-label="Saved"
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => removeLine(line.id)}
                        title="Remove this line"
                        aria-label="Remove line"
                        className="text-muted-foreground hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
