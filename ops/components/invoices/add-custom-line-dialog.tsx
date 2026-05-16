"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  addInvoiceLineAction,
  type CreatedInvoiceLine,
} from "@/app/(app)/invoices/actions";
import {
  Decimal,
  computeInvoiceLineTax,
  formatIndianNumber,
} from "@/lib/pricing";

/**
 * Add a CUSTOM line to a draft invoice (i.e. not a catalog product —
 * labour, freight, third-party items, ad-hoc charges).
 *
 * Crucial feature vs. the simple "blank row" flow it replaces: a
 * Price mode toggle —
 *
 *   • Ex-GST per unit  → straight to the schema (current behaviour)
 *   • Inclusive total  → reverse-calc taxable so the GST-incl figure
 *                         on the invoice matches what the user
 *                         already negotiated with the customer
 *
 * Real-world example: "₹5,700 inclusive for 2 beam crossers at 18%."
 *   → ex-GST line value = 5700 / 1.18 = 4830.51
 *   → per-unit ex-GST   = 2415.26
 *   → engine then puts CGST 434.75 + SGST 434.75 (or IGST 869.49)
 *     on top → line total 5700.00 (within ±0.01 paisa from rounding).
 *
 * Live preview shows the exact figures that'll persist so a 1 paisa
 * drift doesn't surprise the user.
 */

type PriceMode = "EX_GST_PER_UNIT" | "INCL_TOTAL";

function safeDecimal(s: string): Decimal {
  if (!s || isNaN(Number(s))) return new Decimal(0);
  return new Decimal(s);
}

export function AddCustomLineDialog({
  invoiceId,
  isInterState,
  onAdded,
  trigger,
}: {
  invoiceId: string;
  isInterState: boolean;
  onAdded: (line: CreatedInvoiceLine, sku: string | null) => void;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [hsnCode, setHsnCode] = useState("8414");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("pcs");
  const [gstRate, setGstRate] = useState("18");
  const [priceMode, setPriceMode] = useState<PriceMode>("EX_GST_PER_UNIT");
  const [priceInput, setPriceInput] = useState("");

  function resetState() {
    setDescription("");
    setHsnCode("8414");
    setQuantity("1");
    setUnit("pcs");
    setGstRate("18");
    setPriceMode("EX_GST_PER_UNIT");
    setPriceInput("");
  }

  // Derive the ex-GST unit price the server will receive. In ex-GST
  // mode the user is typing it directly. In inclusive mode we back
  // it out: ex_per_unit = (inclusive_total / qty) / (1 + gst/100).
  const computed = useMemo(() => {
    const qty = safeDecimal(quantity);
    const gst = safeDecimal(gstRate);
    if (qty.isZero()) {
      return { unitPriceExGst: new Decimal(0), valid: false };
    }
    if (priceMode === "EX_GST_PER_UNIT") {
      const v = safeDecimal(priceInput);
      return { unitPriceExGst: v, valid: !v.isZero() || priceInput === "0" };
    }
    // Inclusive total → divide out GST then split across qty.
    const inclusiveTotal = safeDecimal(priceInput);
    if (inclusiveTotal.isZero()) {
      return { unitPriceExGst: new Decimal(0), valid: false };
    }
    const gstFactor = new Decimal(1).plus(gst.div(100));
    // exGstTotal / qty, rounded to 2dp by the engine helper later.
    const exPerUnit = inclusiveTotal.div(gstFactor).div(qty);
    return { unitPriceExGst: exPerUnit, valid: true };
  }, [priceMode, priceInput, quantity, gstRate]);

  // Live preview — what the engine will actually persist. Same math
  // path the server uses, so the user sees exactly what they'll get.
  const preview = useMemo(() => {
    if (!computed.valid) return null;
    const tax = computeInvoiceLineTax(
      safeDecimal(quantity),
      computed.unitPriceExGst,
      safeDecimal(gstRate),
      isInterState,
    );
    return tax;
  }, [computed, quantity, gstRate, isInterState]);

  function submit() {
    if (!description.trim()) {
      toast.error("Description is required.");
      return;
    }
    if (!computed.valid) {
      toast.error("Enter a price.");
      return;
    }
    startTransition(async () => {
      const res = await addInvoiceLineAction({
        invoiceId,
        description: description.trim(),
        hsnCode: hsnCode.trim() || null,
        quantity,
        unit: unit.trim() || "pcs",
        // Server expects ex-GST per-unit price; we already derived it.
        unitPrice: computed.unitPriceExGst.toFixed(2),
        gstRate,
        isLabourStyle: false,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onAdded(res.line, null);
      toast.success("Line added.");
      resetState();
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) resetState();
      }}
    >
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add custom line</DialogTitle>
          <DialogDescription>
            For items not in the catalog — labour, freight, third-party
            stuff, or anything you negotiated at a custom rate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="customDesc">Description</Label>
            <Textarea
              id="customDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. 2 × beam crosser nets, supply + install"
              rows={2}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="customHsn">HSN / SAC</Label>
              <Input
                id="customHsn"
                value={hsnCode}
                onChange={(e) => setHsnCode(e.target.value)}
                placeholder="8414"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customGst">GST rate (%)</Label>
              <Input
                id="customGst"
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value || "0")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customQty">Quantity</Label>
              <Input
                id="customQty"
                type="number"
                step="0.01"
                min={0}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value || "0")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customUnit">Unit</Label>
              <Input
                id="customUnit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="pcs"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Price mode</Label>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => setPriceMode("EX_GST_PER_UNIT")}
                className={
                  "px-3 py-1.5 text-sm transition-colors " +
                  (priceMode === "EX_GST_PER_UNIT"
                    ? "bg-foreground text-background"
                    : "hover:bg-muted")
                }
              >
                Ex-GST per unit
              </button>
              <button
                type="button"
                onClick={() => setPriceMode("INCL_TOTAL")}
                className={
                  "border-l px-3 py-1.5 text-sm transition-colors " +
                  (priceMode === "INCL_TOTAL"
                    ? "bg-foreground text-background"
                    : "hover:bg-muted")
                }
              >
                Inclusive total (GST in)
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {priceMode === "EX_GST_PER_UNIT" ? (
                <>
                  Type the per-unit price <strong>before GST</strong>. The
                  engine adds CGST+SGST or IGST on top.
                </>
              ) : (
                <>
                  Type the <strong>all-in total</strong> for this line (qty ×
                  rate × (1 + GST%)). The engine reverse-calculates the
                  taxable value. Use this when you negotiated a final
                  out-the-door amount with the customer.
                </>
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="customPrice">
              {priceMode === "EX_GST_PER_UNIT"
                ? "Unit price ex-GST (₹)"
                : "Total amount inclusive of GST (₹)"}
            </Label>
            <Input
              id="customPrice"
              type="number"
              step="0.01"
              min={0}
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder={
                priceMode === "EX_GST_PER_UNIT" ? "e.g. 2415.25" : "e.g. 5700"
              }
            />
          </div>

          {preview ? (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <p className="mb-1 font-semibold text-foreground">
                Preview of what gets persisted:
              </p>
              <PreviewRow
                label="Per-unit ex-GST (stored)"
                value={`₹${formatIndianNumber(computed.unitPriceExGst)}`}
              />
              <PreviewRow
                label="Taxable value (line)"
                value={`₹${formatIndianNumber(preview.taxableValue)}`}
              />
              {isInterState ? (
                <PreviewRow
                  label={`IGST @ ${gstRate}%`}
                  value={`₹${formatIndianNumber(preview.igstAmount)}`}
                />
              ) : (
                <>
                  <PreviewRow
                    label={`CGST @ ${preview.cgstRate.toFixed(1)}%`}
                    value={`₹${formatIndianNumber(preview.cgstAmount)}`}
                  />
                  <PreviewRow
                    label={`SGST @ ${preview.sgstRate.toFixed(1)}%`}
                    value={`₹${formatIndianNumber(preview.sgstAmount)}`}
                  />
                </>
              )}
              <div className="my-1 border-t" />
              <PreviewRow
                label="Line total (incl GST)"
                value={`₹${formatIndianNumber(preview.lineTotal)}`}
                bold
              />
              {priceMode === "INCL_TOTAL" &&
              !preview.lineTotal.eq(safeDecimal(priceInput)) ? (
                <p className="mt-1.5 text-[10px] italic text-muted-foreground">
                  Off by ±₹
                  {preview.lineTotal
                    .minus(safeDecimal(priceInput))
                    .abs()
                    .toFixed(2)}{" "}
                  from your input — paisa-level rounding (GST math doesn&apos;t
                  always divide cleanly).
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || !preview}>
            {pending ? "Adding…" : "Add to invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-0.5 tabular-nums">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
