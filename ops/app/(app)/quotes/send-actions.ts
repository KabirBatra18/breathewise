"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { clients, quoteSends, quoteTierFinancials, quotes } from "@/db/schema";
import { requireEmployeeOrAbove } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

export type SendResult =
  | { ok: true; sendId: string; pdfUrl: string }
  | { ok: false; error: string };

const sendSchema = z.object({
  id: z.string().uuid(),
  via: z.enum(["DOWNLOAD", "WHATSAPP_LINK"]).default("DOWNLOAD"),
});

export async function sendRoughQuoteAction(
  input: z.input<typeof sendSchema>,
): Promise<SendResult> {
  const actor = await requireEmployeeOrAbove();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const quote = await db.query.quotes.findFirst({
    where: eq(quotes.id, parsed.data.id),
  });
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "DRAFT" && quote.status !== "SENT") {
    return {
      ok: false,
      error: `Quote is in ${quote.status} state and can't be re-sent.`,
    };
  }

  const pdfUrl = `/api/quotes/${quote.id}/pdf`;

  const [send] = await db
    .insert(quoteSends)
    .values({
      quoteId: quote.id,
      tierLabel: "ROUGH",
      discountPercent: quote.roughDiscountPercent ?? "0.00",
      pdfUrl,
      sentVia: parsed.data.via,
      sentBy: actor.id,
    })
    .returning({ id: quoteSends.id });

  if (quote.status === "DRAFT") {
    await db
      .update(quotes)
      .set({ status: "SENT" })
      .where(eq(quotes.id, quote.id));
  }

  // Freeze the ROUGH financials snapshot.
  await db
    .update(quoteTierFinancials)
    .set({ isFrozen: true })
    .where(eq(quoteTierFinancials.quoteId, quote.id));

  await audit({
    actorId: actor.id,
    action: "QUOTE_SEND",
    entityType: "quote",
    entityId: quote.id,
    metadata: {
      sendId: send.id,
      via: parsed.data.via,
      quoteNumber: quote.quoteNumber,
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${quote.id}`);

  return { ok: true, sendId: send.id, pdfUrl };
}

const waSchema = z.object({ id: z.string().uuid() });

export async function buildWhatsappMessage(
  input: z.input<typeof waSchema>,
): Promise<string> {
  await requireEmployeeOrAbove();
  const parsed = waSchema.parse(input);
  const quote = await db.query.quotes.findFirst({
    where: eq(quotes.id, parsed.id),
  });
  if (!quote) throw new Error("Quote not found");

  const fin = await db.query.quoteTierFinancials.findFirst({
    where: eq(quoteTierFinancials.quoteId, parsed.id),
  });
  const total = fin?.totalInvoiceValue ?? "—";

  const client = await db.query.clients.findFirst({
    where: eq(clients.id, quote.clientId),
  });

  return [
    `Hello ${client?.name ?? ""},`,
    "",
    `Please find the rough quotation ${quote.quoteNumber} for your ventilation requirement.`,
    "",
    `Grand total: ₹${total}`,
    `Valid: ${quote.validityDays} days from ${quote.issueDate}`,
    "",
    `Quote PDF: <attach the downloaded file from the BreatheWise app>`,
    "",
    `For any questions please reply on this thread.`,
    "",
    `BreatheWise · Urban Tech Home Solutions`,
  ].join("\n");
}
