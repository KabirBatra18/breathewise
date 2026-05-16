"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
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
import { Textarea } from "@/components/ui/textarea";
import { convertQuoteToInvoiceAction } from "@/app/(app)/invoices/actions";
import { ErrorBanner } from "@/components/ui/error-banner";

const todayIST = (): string => {
  const d = new Date();
  const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
};

export function ConvertToInvoiceDialog({
  quoteId,
  quoteNumber,
  trigger,
  buyerHasLabour,
  buyerState,
  buyerId,
  buyerName,
}: {
  quoteId: string;
  quoteNumber: string;
  trigger: React.ReactNode;
  /** Whether the source quote has any labour-style sections — if not we
   *  hide the include-labour toggle since it has no effect. */
  buyerHasLabour: boolean;
  /** Buyer's state, shown in the dialog so the user can sanity-check
   *  place of supply before committing. Null = state not set, button
   *  will be disabled with a hint. */
  buyerState: string | null;
  /** Buyer's client id and display name — used to build a direct
   *  'Open client' button when state is missing. */
  buyerId: string;
  buyerName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [issueDate, setIssueDate] = useState(todayIST());
  const [includeLabour, setIncludeLabour] = useState(false);
  const [reverseCharge, setReverseCharge] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryState, setDeliveryState] = useState("");
  const [notes, setNotes] = useState("");
  // Persistent inline error so a missed toast doesn't leave the user
  // wondering why the button "didn't do anything".
  const [error, setError] = useState<string | null>(null);

  const buyerStateMissing = !buyerState;

  // Clear stale error when the dialog reopens. Without this, a previous
  // failure would still show even though the user might have fixed the
  // underlying issue (e.g. set the client's state).
  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  // What the engine will actually use as place of supply: delivery
  // state if the user filled one, otherwise the buyer's billing state.
  // Surfaced live so the user can see CGST+SGST ↔ IGST decision before
  // they hit Generate.
  const effectivePlaceOfSupply = deliveryState.trim() || buyerState || "—";

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await convertQuoteToInvoiceAction({
        quoteId,
        issueDate,
        includeLabour,
        reverseCharge,
        deliveryAddress:
          deliveryAddress.trim() === "" ? undefined : deliveryAddress,
        deliveryState:
          deliveryState.trim() === "" ? undefined : deliveryState,
        notes: notes.trim() === "" ? undefined : notes,
      });
      if (!res.ok) {
        // Surface inline AND as toast — banner persists, toast pings.
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(
        "Draft invoice created — edit lines, then click Finalize to issue.",
      );
      setOpen(false);
      router.push(`/invoices/${res.invoiceId}/edit`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert to Tax Invoice</DialogTitle>
          <DialogDescription>
            Generates a draft tax invoice from quote{" "}
            <span className="font-mono">{quoteNumber}</span>. You&apos;ll
            land in the editor to adjust lines, then Finalize to issue.
            The quote stays untouched.
          </DialogDescription>
        </DialogHeader>

        <ErrorBanner message={error} />

        {buyerStateMissing ? (
          <div className="rounded-md border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-semibold">
              Can&apos;t generate yet — {buyerName} has no state set.
            </p>
            <p className="mt-1 text-xs leading-relaxed">
              GST law needs the buyer&apos;s state to decide CGST+SGST vs
              IGST. Open the client, add their state (e.g. <em>Delhi</em>,
              <em> Uttar Pradesh</em>), save — the state code derives
              automatically. Then come back here.
            </p>
            <div className="mt-3">
              <Button
                size="sm"
                variant="secondary"
                render={
                  <Link href={`/clients/${buyerId}`} target="_blank" />
                }
              >
                Open {buyerName} in a new tab →
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Place of supply: <strong>{effectivePlaceOfSupply}</strong>.
            {deliveryState.trim() &&
            deliveryState.trim().toLowerCase() !==
              (buyerState ?? "").toLowerCase() ? (
              <>
                {" "}
                Using <strong>delivery state</strong> instead of billing.
              </>
            ) : null}{" "}
            Determines whether CGST + SGST (intra-state) or IGST
            (inter-state) applies.
          </p>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="issueDate">Invoice date</Label>
            <Input
              id="issueDate"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Should be on or after the date the goods were dispatched. GST
              law puts your tax liability in the period this date falls in.
            </p>
          </div>

          {buyerHasLabour ? (
            <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
              <input
                type="checkbox"
                checked={includeLabour}
                onChange={(e) => setIncludeLabour(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input"
              />
              <span className="space-y-0.5">
                <span className="block font-medium">
                  Include labour / installation section on this invoice
                </span>
                <span className="block text-xs text-muted-foreground">
                  Off by default — labour is often paid in cash directly to
                  the install crew. Tick this only if the customer is paying
                  the install charge through a bank transfer that you want
                  invoiced (and GST-reported).
                </span>
              </span>
            </label>
          ) : null}

          <label className="flex items-start gap-2 rounded-md border bg-muted/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={reverseCharge}
              onChange={(e) => setReverseCharge(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-input"
            />
            <span className="space-y-0.5">
              <span className="block font-medium">Reverse charge applies</span>
              <span className="block text-xs text-muted-foreground">
                Off by default (forward charge — you collect and remit GST).
                Tick only if a specific notification puts the buyer on the
                hook for the tax. Rare for our category.
              </span>
            </span>
          </label>

          <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
            <Label className="text-sm font-medium">
              Ship-to / delivery address{" "}
              <span className="text-xs font-normal text-muted-foreground">
                (optional — only if different from billing)
              </span>
            </Label>
            <Textarea
              value={deliveryAddress}
              onChange={(e) => setDeliveryAddress(e.target.value)}
              placeholder="e.g. 441, Sector-15A, Noida"
              rows={2}
            />
            <div className="grid gap-1.5 sm:grid-cols-2">
              <div>
                <Label
                  htmlFor="deliveryState"
                  className="text-xs text-muted-foreground"
                >
                  Delivery state
                </Label>
                <Input
                  id="deliveryState"
                  value={deliveryState}
                  onChange={(e) => setDeliveryState(e.target.value)}
                  placeholder={buyerState ?? "e.g. Uttar Pradesh"}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Per GST law, place of supply is where the goods are delivered.
              If you deliver to a state different from the billing address,
              fill these — the engine will switch CGST+SGST → IGST
              automatically.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Internal notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Delivered 14-May, balance due in 7 days"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || buyerStateMissing}>
            {pending
              ? "Generating…"
              : buyerStateMissing
                ? "Fix client state first"
                : "Generate invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
