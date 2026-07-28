"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ShieldAlert, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { updateInvoicePostIssueMetaAction } from "@/app/(app)/invoices/actions";

/**
 * Post-issue meta editor. Rendered on the invoice detail page for
 * ISSUED invoices. Lets OWNER toggle the safety-disclaimer clause
 * and edit the case-notes field WITHOUT reopening the full editor
 * (which is DRAFT-only by design — the invoice number, dates, and
 * money math must not move once issued).
 *
 * Only these two fields are exposed here — the corresponding server
 * action (updateInvoicePostIssueMetaAction) is narrow so it's
 * impossible to accidentally mutate anything that would change the
 * legal invoice content. Every save is audit-logged as
 * INVOICE_POST_ISSUE_META_UPDATE.
 *
 * Every change re-appears on the very next PDF download because the
 * PDF route reads the current row on each request (no caching).
 */
export function PostIssueMetaCard({
  invoiceId,
  invoiceNumber,
  initialShowSafetyClause,
  initialNotes,
}: {
  invoiceId: string;
  invoiceNumber: string;
  initialShowSafetyClause: boolean;
  initialNotes: string | null;
}) {
  const [showSafetyClause, setShowSafetyClause] = useState(
    initialShowSafetyClause,
  );
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [pending, startSave] = useTransition();

  // Track saved state so we can flash a subtle "Saved" affordance
  // and disable the Save button when nothing has changed.
  const dirty =
    showSafetyClause !== initialShowSafetyClause ||
    (notes.trim() || null) !== (initialNotes ?? null);

  function save() {
    startSave(async () => {
      const res = await updateInvoicePostIssueMetaAction({
        invoiceId,
        showSafetyClause,
        notes: notes.trim() === "" ? null : notes,
      });
      if (res.ok) {
        toast.success(
          "Saved. Next PDF download uses the updated clause & notes.",
        );
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          Safety clause &amp; case notes
        </CardTitle>
        <CardDescription>
          These two fields print on the invoice PDF and can be updated
          any time. The invoice number, dates, lines, and money math
          are frozen — only this annotation layer is editable post-issue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50/40 p-3 text-sm dark:bg-amber-950/20">
          <input
            type="checkbox"
            checked={showSafetyClause}
            onChange={(e) => setShowSafetyClause(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
            disabled={pending}
          />
          <span>
            <span className="block font-medium">
              Include installation safety clause
            </span>
            <span className="block text-xs text-muted-foreground">
              Prints a boilerplate liability disclaimer on the PDF:
              BreatheWise prioritises safety (moisture, heat, other
              factors); if the client refused the recommended install
              or switched vendor mid-project, BreatheWise isn&apos;t
              responsible for subsequent issues.
            </span>
          </span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor={`notes-${invoiceId}`}>
            Case notes (printed on invoice {invoiceNumber})
          </Label>
          <Textarea
            id={`notes-${invoiceId}`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder={
              showSafetyClause
                ? "What happened — e.g. Client insisted on own electrician despite our moisture warning; installation approach deviated from BreatheWise recommendation on 20 Jun."
                : "Anything you want printed on the invoice PDF"
            }
            disabled={pending}
          />
          <p className="text-xs text-muted-foreground">
            Max 2000 characters. Prints under the declarations block as{" "}
            <span className="font-mono">Note: {"{your text}"}</span>.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            PDFs regenerate live — every download uses the current values.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending || !dirty}
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5" />
                Save &amp; regenerate PDF
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
