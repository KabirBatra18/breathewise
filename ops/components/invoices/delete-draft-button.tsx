"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { deleteDraftInvoiceAction } from "@/app/(app)/invoices/actions";

/**
 * Trash button for DRAFT invoice rows in the list. DRAFT invoices
 * have no allocated number and no legal status, so deleting one is
 * a safe local operation — it leaves no gap in the issued sequence.
 *
 * ISSUED invoices are intentionally NOT deletable. Rule 46 makes
 * them immutable legal documents — the only correct reversal is a
 * credit note. The list deliberately renders no delete control for
 * issued rows; we never trust a UI confirm() for that.
 */
export function DeleteDraftButton({
  invoiceId,
  quoteNumber,
}: {
  invoiceId: string;
  quoteNumber: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        title="Discard draft"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {quoteNumber ? (
                <>
                  The draft from quote{" "}
                  <span className="font-mono font-semibold">{quoteNumber}</span>{" "}
                  will be deleted permanently. The source quote stays untouched —
                  you can always spawn a fresh draft from it.
                </>
              ) : (
                <>
                  This draft will be deleted permanently. The source quote stays
                  untouched.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const res = await deleteDraftInvoiceAction({ invoiceId });
                  if (!res.ok) {
                    toast.error(res.error);
                    return;
                  }
                  toast.success("Draft discarded.");
                  setOpen(false);
                  router.refresh();
                });
              }}
            >
              {pending ? "Discarding…" : "Discard draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
