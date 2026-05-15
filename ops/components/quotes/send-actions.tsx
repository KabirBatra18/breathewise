"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, MessageCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  buildWhatsappMessage,
  sendRoughQuoteAction,
} from "@/app/(app)/quotes/send-actions";

export function QuoteSendActions({
  quoteId,
  status,
  pdfUrl,
}: {
  quoteId: string;
  status: string;
  pdfUrl: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleSend() {
    startTransition(async () => {
      const res = await sendRoughQuoteAction({ id: quoteId, via: "DOWNLOAD" });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Quote sent. PDF locked in.");
      router.refresh();
    });
  }

  async function handleCopyWhatsapp() {
    try {
      const text = await buildWhatsappMessage({ id: quoteId });
      await navigator.clipboard.writeText(text);
      toast.success("WhatsApp message copied.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not copy");
    }
  }

  const canSend = status === "DRAFT" || status === "SENT" || status === "NEGOTIATING";

  // (Tax invoices are issued via the proper Convert-to-Tax-Invoice
  // flow on the quote detail page — that path goes through DRAFT →
  // ISSUED with HSN, CGST/SGST split, invoice number, etc. We
  // deliberately do NOT expose a "Tax invoice (PDF)" shortcut here
  // because it would render a re-labelled PI without those legal
  // fields, which is dangerous to send to a customer.)

  return (
    <div className="flex flex-wrap gap-2">
      <Button render={<a href={pdfUrl} target="_blank" rel="noopener" />}>
        <Download className="h-4 w-4" />
        Proforma (PDF)
      </Button>
      {canSend ? (
        <Button onClick={handleSend} disabled={pending} variant="secondary">
          <Send className="h-4 w-4" />
          {pending ? "Sending…" : status === "DRAFT" ? "Send to client" : "Re-send"}
        </Button>
      ) : null}
      <Button onClick={handleCopyWhatsapp} variant="outline">
        <MessageCircle className="h-4 w-4" />
        Copy WhatsApp message
      </Button>
    </div>
  );
}
