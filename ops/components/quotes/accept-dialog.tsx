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
import { Textarea } from "@/components/ui/textarea";
import { acceptQuoteAction } from "@/app/(app)/quotes/actions";

export function AcceptDialog({
  quoteId,
  defaultTotal,
  trigger,
}: {
  quoteId: string;
  // The ROUGH-tier quoted total — pre-filled into the dialog so the
  // user only has to override it for negotiated cases.
  defaultTotal: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [acceptedTotal, setAcceptedTotal] = useState(defaultTotal);
  const [notes, setNotes] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await acceptQuoteAction({
        id: quoteId,
        acceptedTotal: acceptedTotal === defaultTotal ? "" : acceptedTotal,
        acceptedNotes: notes,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Quote marked accepted.");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger as React.ReactElement} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark accepted</DialogTitle>
          <DialogDescription>
            Capture the final agreed amount and any negotiation notes.
            Payments are reconciled against this total.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="acceptedTotal">Final total (₹, with GST)</Label>
            <Input
              id="acceptedTotal"
              type="number"
              step="0.01"
              min={0}
              value={acceptedTotal}
              onChange={(e) => setAcceptedTotal(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Defaults to the quoted total. Edit only if the close was
              negotiated at a different figure.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acceptedNotes">Notes (optional)</Label>
            <Textarea
              id="acceptedNotes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Verbal agreement on 4% extra discount, advance to be paid by 10-May."
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
          <Button onClick={submit} disabled={pending}>
            {pending ? "Saving…" : "Mark accepted"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
