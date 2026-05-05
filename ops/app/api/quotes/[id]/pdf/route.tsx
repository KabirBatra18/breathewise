import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { format } from "date-fns";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clients,
  companySettings,
  quoteLineItems,
  quoteSections,
  quoteTerms,
  quotes,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import {
  computeQuoteTotals,
  type SectionInput,
} from "@/lib/pricing";
import {
  QuotePdfDocument,
  buildPdfDataFromQuote,
  type QuotePdfLine,
} from "@/components/pdf/QuotePdfDocument";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await requireAuth();

  const quote = await db.query.quotes.findFirst({
    where: eq(quotes.id, params.id),
  });
  if (!quote) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [client, sections, terms, settingsRow] = await Promise.all([
    db.query.clients.findFirst({ where: eq(clients.id, quote.clientId) }),
    db
      .select()
      .from(quoteSections)
      .where(eq(quoteSections.quoteId, quote.id))
      .orderBy(asc(quoteSections.sortOrder)),
    db
      .select()
      .from(quoteTerms)
      .where(eq(quoteTerms.quoteId, quote.id))
      .orderBy(asc(quoteTerms.sortOrder)),
    db.select().from(companySettings).where(eq(companySettings.id, 1)),
  ]);
  const settings = settingsRow[0];
  if (!client || !settings) {
    return NextResponse.json({ error: "Quote incomplete" }, { status: 500 });
  }

  const sectionLines = await Promise.all(
    sections.map(async (s) => ({
      section: s,
      lines: await db
        .select()
        .from(quoteLineItems)
        .where(eq(quoteLineItems.quoteSectionId, s.id))
        .orderBy(asc(quoteLineItems.sortOrder)),
    })),
  );

  const discountPercent = quote.roughDiscountPercent ?? "0.00";
  const calcInput: SectionInput[] = sectionLines.map(({ section, lines }) => ({
    discountPercent,
    gstRate: section.gstRate,
    isLabourStyle: section.isLabourStyle,
    appliesDiscount: section.appliesDiscount,
    lines: lines.map((l) => ({
      qty: l.quantity,
      unitPrice: l.unitPrice,
      mrp: l.mrp ?? null,
    })),
  }));
  const totals = computeQuoteTotals(calcInput);

  const sectionsForPdf = sectionLines.map(({ section, lines }, idx) => {
    const t = totals.sections[idx];
    const pdfLines: QuotePdfLine[] = lines.map((l) => ({
      sno: l.sno,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
    }));
    return {
      letter: section.sectionLetter,
      title: section.title,
      isLabourStyle: section.isLabourStyle,
      appliesDiscount: section.appliesDiscount,
      gstRate: section.gstRate,
      lines: pdfLines,
      subtotal: t.subtotal.toFixed(2),
      discountAmount: t.discountAmount.toFixed(2),
      netAfterDiscount: t.netAfterDiscount.toFixed(2),
      gstAmount: t.gstAmount.toFixed(2),
      total: t.total.toFixed(2),
      mrpSubtotal: t.mrpSubtotal.toFixed(2),
      totalDiscountVsMrp: t.totalDiscountVsMrp.toFixed(2),
    };
  });

  const issueDateFormatted = (() => {
    try {
      const d = new Date(`${quote.issueDate}T00:00:00`);
      return format(d, "d MMMM yyyy");
    } catch {
      return String(quote.issueDate);
    }
  })();

  const documentLabel =
    quote.quoteType === "ROUGH" ? "QUOTATION — TENTATIVE" : "QUOTATION — FINAL";

  const data = buildPdfDataFromQuote({
    quoteNumber: quote.quoteNumber,
    tierLabel: "ROUGH",
    documentLabel,
    issueDate: issueDateFormatted,
    validityDays: quote.validityDays,
    discountPercent,
    client: {
      name: client.name,
      companyName: client.companyName,
      addressLines: [
        client.addressLine1,
        client.addressLine2,
        [client.city, client.state, client.pincode].filter(Boolean).join(", "),
      ].filter((x): x is string => Boolean(x && x.trim())),
      phone: client.phone,
      email: client.email,
      gstin: client.gstin,
    },
    sections: sectionsForPdf,
    grandTotal: totals.grandTotal.toFixed(2),
    totalMrpSubtotal: totals.totalMrpSubtotal.toFixed(2),
    totalSavingsVsMrp: totals.totalSavingsVsMrp.toFixed(2),
    goodsTotal: totals.goodsTotal.toFixed(2),
    goodsMrpSubtotal: totals.goodsMrpSubtotal.toFixed(2),
    goodsSavingsVsMrp: totals.goodsSavingsVsMrp.toFixed(2),
    labourTotal: totals.labourTotal.toFixed(2),
    terms: terms.map((t) => ({ title: t.titleSnapshot, body: t.bodySnapshot })),
    brand: {
      legalName: settings.legalName,
      brandName: settings.brandName,
      tagline: settings.tagline,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      gstin: settings.gstin,
    },
  });

  const buffer = await renderToBuffer(<QuotePdfDocument data={data} />);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
