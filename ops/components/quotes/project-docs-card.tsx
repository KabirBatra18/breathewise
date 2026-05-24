"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Save } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { updateQuoteProjectDocsAction } from "@/app/(app)/quotes/actions";

/**
 * Project documents card — sits on the quote detail page for ACCEPTED
 * quotes. Two responsibilities:
 *   1. Capture project_site_address + agreement_signed_date on the
 *      quote (both feed the Services Agreement + Handover Certificate
 *      PDFs).
 *   2. Surface the three client-facing PDFs as download links:
 *      Welcome Pack (static), Services Agreement (overlay on template).
 *      Handover Cert is on the invoice page, not here.
 */
export function ProjectDocsCard({
  quoteId,
  quoteNumber,
  initialSiteAddress,
  initialAgreementDate,
}: {
  quoteId: string;
  quoteNumber: string;
  initialSiteAddress: string | null;
  initialAgreementDate: string | null;
}) {
  const router = useRouter();
  const [siteAddress, setSiteAddress] = useState(initialSiteAddress ?? "");
  const [agreementDate, setAgreementDate] = useState(initialAgreementDate ?? "");
  const [pending, startTransition] = useTransition();

  const safeNumber = quoteNumber.replace(/\//g, "-");

  function save() {
    startTransition(async () => {
      const res = await updateQuoteProjectDocsAction({
        id: quoteId,
        projectSiteAddress: siteAddress.trim() === "" ? null : siteAddress.trim(),
        agreementSignedDate: agreementDate.trim() === "" ? null : agreementDate.trim(),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>
          Generate the three client documents pre-filled with this quote&apos;s details.
        </CardDescription>
        <CardTitle>Project documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="site-address">Project site address (optional)</Label>
            <Textarea
              id="site-address"
              rows={3}
              placeholder="If the work site is different from the client's billing address (e.g. a separate farmhouse, an under-construction property). Leave blank to use the client address."
              value={siteAddress}
              onChange={(e) => setSiteAddress(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agreement-date">Agreement signed date (optional)</Label>
            <Input
              id="agreement-date"
              type="date"
              value={agreementDate}
              onChange={(e) => setAgreementDate(e.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              The day the client signs the Services Agreement. Prints as the
              Agreement Date on the Handover Certificate.
            </p>
            <div className="pt-1">
              <Button size="sm" variant="outline" onClick={save} disabled={pending}>
                <Save className="h-4 w-4" />
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button
            size="sm"
            variant="outline"
            render={
              <a
                href="/docs/welcome-pack.pdf"
                target="_blank"
                rel="noopener"
                download
              />
            }
          >
            <Download className="h-4 w-4" />
            Welcome Pack
          </Button>
          <Button
            size="sm"
            render={
              <a
                href={`/api/quotes/${quoteId}/services-agreement`}
                target="_blank"
                rel="noopener"
                download={`${safeNumber}-services-agreement.pdf`}
              />
            }
          >
            <Download className="h-4 w-4" />
            Services Agreement
          </Button>
          <p className="flex-1 text-xs text-muted-foreground">
            Handover Certificate is generated from the issued invoice once the
            project is complete.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
