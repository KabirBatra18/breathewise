"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import {
  ProductPicker,
  type ProductOption,
} from "@/components/quotes/product-picker";
import {
  addInvoiceLineAction,
  type CreatedInvoiceLine,
} from "@/app/(app)/invoices/actions";
import { Decimal, formatIndianNumber } from "@/lib/pricing";

/**
 * Add-from-catalog dialog for the invoice editor.
 *
 * Reuses the same ProductPicker as the quote builder so the search /
 * grouping behaviour is identical. Once a product is picked it
 * fetches DP / MRP / HSN via /api/products/[id] and shows a rate
 * toggle (the same pill UI as the quote builder).
 */

type PriceMode = "DP" | "MRP";

interface ProductDetail {
  id: string;
  sku: string | null;
  name: string;
  description: string;
  mrp: string | null;
  unit: string;
  gstRate: string;
  dpRate: string;
  mrpRate: string | null;
  hasMrpUplift: boolean;
  hsnCode: string | null;
}

export function AddFromCatalogDialog({
  invoiceId,
  products,
  onAdded,
  trigger,
}: {
  invoiceId: string;
  products: ProductOption[];
  /** Optimistic-append callback. Parent appends the line locally
   *  the moment the server confirms — no router.refresh needed.
   *  We also pass the SKU since the server doesn't write it on
   *  late-add lines (only convert-time lines get a snapshot). */
  onAdded: (line: CreatedInvoiceLine, sku: string | null) => void;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [priceMode, setPriceMode] = useState<PriceMode>("DP");
  const [quantity, setQuantity] = useState("1");

  function resetState() {
    setProductId(null);
    setDetail(null);
    setPriceMode("DP");
    setQuantity("1");
  }

  async function handlePick(id: string | null) {
    setProductId(id);
    setDetail(null);
    setPriceMode("DP");
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/products/${id}`);
      if (!res.ok) {
        toast.error("Couldn't load product details");
        return;
      }
      const data = (await res.json()) as ProductDetail;
      setDetail(data);
    } catch {
      toast.error("Network error loading product");
    } finally {
      setLoading(false);
    }
  }

  function submit() {
    if (!detail) return;
    const chosenRate =
      priceMode === "MRP" && detail.mrpRate ? detail.mrpRate : detail.dpRate;
    startTransition(async () => {
      const res = await addInvoiceLineAction({
        invoiceId,
        description: detail.description,
        hsnCode: detail.hsnCode ?? "8414",
        quantity,
        unit: detail.unit,
        unitPrice: chosenRate,
        gstRate: detail.gstRate,
        isLabourStyle: false,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Server returns the inserted row — emit it + the SKU we already
      // resolved client-side. Parent maps to its editor-line shape.
      onAdded(res.line, detail.sku);
      toast.success(`Added ${detail.sku ?? detail.name} to the invoice.`);
      resetState();
      setOpen(false);
      router.refresh();
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
          <DialogTitle>Add product from catalog</DialogTitle>
          <DialogDescription>
            Search the Astberg catalog, pick a rate, and add it as a line.
            SKU, description and HSN auto-fill — you can still tweak qty and
            price after.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Product</Label>
            <ProductPicker
              products={products}
              value={productId}
              onPick={handlePick}
            />
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground">Loading details…</p>
          ) : null}

          {detail ? (
            <>
              <div className="rounded-md border bg-muted/30 p-3 text-xs">
                <p className="font-mono text-[11px] font-semibold">
                  {detail.sku ?? "(no SKU)"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
                  {detail.description}
                </p>
                <p className="mt-1 text-muted-foreground">
                  HSN {detail.hsnCode ?? "—"} · GST {Number(detail.gstRate).toFixed(0)}% · Unit {detail.unit}
                </p>
              </div>

              {/* Rate toggle — only meaningful when DP and MRP-derived
                  rates actually differ. ERV-style products quote at MRP
                  by default, so there's no real choice. */}
              {detail.hasMrpUplift && detail.mrpRate ? (
                <div className="space-y-1.5">
                  <Label>Quoted at</Label>
                  <div className="inline-flex overflow-hidden rounded-md border">
                    <button
                      type="button"
                      onClick={() => setPriceMode("DP")}
                      className={
                        "px-3 py-1.5 text-sm transition-colors " +
                        (priceMode === "DP"
                          ? "bg-sky-600 text-white"
                          : "text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40")
                      }
                    >
                      Astberg DP · ₹{formatIndianNumber(new Decimal(detail.dpRate))}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPriceMode("MRP")}
                      className={
                        "border-l px-3 py-1.5 text-sm transition-colors " +
                        (priceMode === "MRP"
                          ? "bg-amber-500 text-white"
                          : "text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40")
                      }
                    >
                      MRP · ₹{formatIndianNumber(new Decimal(detail.mrpRate))}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {priceMode === "DP"
                      ? "Astberg-quoted: dealer price, leaves the customer with the resale markdown built in."
                      : "Self-added: quoting up to MRP, maximises margin."}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  This product has a single rate: ₹{formatIndianNumber(new Decimal(detail.dpRate))} (ex-GST).
                </p>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="catalogQty">Quantity</Label>
                <Input
                  id="catalogQty"
                  type="number"
                  step="1"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value || "1")}
                />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={pending || !detail}
            disabledReason={
              pending
                ? "Adding line…"
                : !detail
                  ? "Pick a product from the catalog first."
                  : undefined
            }
          >
            {pending ? "Adding…" : "Add to invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
