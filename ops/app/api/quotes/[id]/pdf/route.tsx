import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { format } from "date-fns";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  clients,
  companySettings,
  payments,
  products,
  quoteLineItems,
  quoteSections,
  quoteTerms,
  quotes,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import {
  computeQuoteTotals,
  computeQuoteTotalsForTarget,
  Decimal,
  ZERO,
  toMoney,
  type SectionInput,
} from "@/lib/pricing";
import {
  QuotePdfDocument,
  buildPdfDataFromQuote,
  type QuoteDocumentKind,
  type QuotePdfLine,
} from "@/components/pdf/QuotePdfDocument";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  req: Request,
  { params }: { params: { id: string } },
) {
  await requireAuth();
  const url = new URL(req.url);
  const docParam = url.searchParams.get("doc");
  const documentKind: QuoteDocumentKind = docParam === "invoice" ? "INVOICE" : "PI";

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

  // Resolve SKU per line so the PDF can show the Astberg model number
  // bold above each description ("AEE-150", "ARD-150-100", …).
  const lineProductIds = Array.from(
    new Set(
      sectionLines
        .flatMap(({ lines }) => lines.map((l) => l.productId))
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const skuById = new Map<string, string>();
  if (lineProductIds.length > 0) {
    const rows = await db
      .select({ id: products.id, sku: products.sku })
      .from(products)
      .where(inArray(products.id, lineProductIds));
    for (const r of rows) {
      if (r.sku) skuById.set(r.id, r.sku);
    }
  }

  const legacyDiscountPercent = quote.roughDiscountPercent ?? "0.00";
  const useNewModel = quote.discountTargetSaving != null;
  // When the quote is on the new model, the section-level discountPercent
  // must be 0 — the saving is delivered by computeQuoteTotalsForTarget.
  // Legacy quotes keep their per-section blanket %.
  const effectivePctForSections = useNewModel ? "0" : legacyDiscountPercent;
  const calcInput: SectionInput[] = sectionLines.map(({ section, lines }) => ({
    discountPercent: effectivePctForSections,
    gstRate: section.gstRate,
    isLabourStyle: section.isLabourStyle,
    appliesDiscount: section.appliesDiscount,
    lines: lines.map((l) => ({
      qty: l.quantity,
      unitPrice: l.unitPrice,
      mrp: l.mrp ?? null,
    })),
  }));
  const totals = useNewModel
    ? computeQuoteTotalsForTarget(
        calcInput,
        new Decimal(quote.discountTargetSaving!),
      )
    : computeQuoteTotals(calcInput);
  // discountPercent retained for downstream callers (buildPdfDataFromQuote
  // takes a discountPercent; we still pass the legacy value for display
  // metadata even though the engine ignored it in the new path).
  const discountPercent = legacyDiscountPercent;

  const sectionsForPdf = sectionLines.map(({ section, lines }, idx) => {
    const t = totals.sections[idx];
    const pdfLines: QuotePdfLine[] = lines.map((l) => ({
      sno: l.sno,
      sku: l.productId ? (skuById.get(l.productId) ?? null) : null,
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
    documentKind === "INVOICE"
      ? "TAX INVOICE / FINAL BILL"
      : quote.quoteType === "ROUGH"
        ? "PROFORMA INVOICE — TENTATIVE"
        : "PROFORMA INVOICE";

  // Payment status only matters for the Tax Invoice variant. We sum
  // all recorded payments against this quote (refunds subtract), then
  // classify against the GST-incl grand total.
  let paymentStatus: undefined | {
    received: string;
    outstanding: string;
    label: "PAID" | "PARTIAL" | "DUE";
  };
  if (documentKind === "INVOICE") {
    const paymentRows = await db
      .select({
        amount: payments.amount,
        paymentType: payments.paymentType,
      })
      .from(payments)
      .where(eq(payments.quoteId, quote.id));
    let received = ZERO;
    for (const p of paymentRows) {
      const amt = new Decimal(p.amount);
      received =
        p.paymentType === "REFUND" ? received.minus(amt) : received.plus(amt);
    }
    received = toMoney(received);
    const contract = quote.acceptedTotal
      ? new Decimal(quote.acceptedTotal)
      : totals.grandTotal;
    const due = toMoney(contract.minus(received));
    const outstanding = due.isNegative() ? ZERO : due;
    const label: "PAID" | "PARTIAL" | "DUE" = outstanding.isZero()
      ? "PAID"
      : received.gt(0)
        ? "PARTIAL"
        : "DUE";
    paymentStatus = {
      received: received.toFixed(2),
      outstanding: outstanding.toFixed(2),
      label,
    };
  }

  const data = buildPdfDataFromQuote({
    quoteNumber: quote.quoteNumber,
    tierLabel: "ROUGH",
    documentLabel,
    documentKind,
    paymentStatus,
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
    // Honour the per-quote toggle: only emit the savings figure to the
    // PDF when the user opted in. Empty "0" makes the document treat
    // it as zero and skip the bar.
    totalSavingsVsMrp: quote.showSavingsOnPdf
      ? totals.totalSavingsVsMrp.toFixed(2)
      : "0",
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
