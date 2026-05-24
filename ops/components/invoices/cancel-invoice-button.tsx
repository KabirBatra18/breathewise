"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelInvoiceAction } from "@/app/(app)/invoices/actions";

/**
 * Cancel button for ISSUED tax invoices. Rule 46 forbids hard delete,
 * so we preserve the row + invoice number and flip status to CANCELED.
 * A short reason is required (audit trail) — captured in the dialog
 * before the action fires.
 */
export function CancelInvoiceButton({
  invoiceId,
  invoiceNumber,
}: {
  invoiceId: string;
  invoiceNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const trimmed = reason.trim();
  const reasonTooShort = trimmed.length < 3;

  return (
    <>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <Ban className="h-4 w-4" />
        Cancel invoice
      </Button>

      <AlertDialog
        open={open}
        onOpenChange={(o) => {
          if (!pending) setOpen(o);
          if (!o) setReason("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel invoice {invoiceNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              The invoice stays on record with its allocated number — GST
              audits expect no gaps in the sequence — but the status flips to{" "}
              <strong>CANCELED</strong>, and every PDF copy gets a CANCELED
              stamp from this point on. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Reason (audit trail)</Label>
            <Textarea
              id="cancel-reason"
              autoFocus
              rows={3}
              placeholder="e.g. Wrong client GSTIN; reissued as BW/INV/2627/0034"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              Min 3 characters. Stored on the row + in the audit log.
            </p>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Keep invoice</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending || reasonTooShort}
              disabledReason={
                pending
                  ? "Cancellation in progress…"
                  : reasonTooShort
                    ? "Type at least 3 characters of reason."
                    : undefined
              }
              onClick={() => {
                startTransition(async () => {
                  const res = await cancelInvoiceAction({
                    invoiceId,
                    reason: trimmed,
                  });
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success(`Invoice ${invoiceNumber} canceled.`);
                  setOpen(false);
                  setReason("");
                  router.refresh();
                });
              }}
            >
              {pending ? "Canceling…" : "Cancel invoice"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
