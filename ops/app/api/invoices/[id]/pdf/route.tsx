import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { format } from "date-fns";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoiceLines, invoices, quotes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import {
  TaxInvoicePdfDocument,
  type TaxInvoicePdfData,
  type TaxInvoicePdfLine,
} from "@/components/pdf/TaxInvoicePdfDocument";

/**
 * Render a frozen tax-invoice as a PDF. The invoice row + its line
 * snapshots are the source of truth — we never recompute totals here.
 * The PI generator at /api/quotes/[id]/pdf is a separate route and is
 * not touched.
 */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await requireAuth();

  const invRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.id));
  const inv = invRows[0];
  if (!inv) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, inv.id))
    .orderBy(asc(invoiceLines.sortOrder));

  // Look up the source quote number for the cross-reference row.
  const srcRows = await db
    .select({ quoteNumber: quotes.quoteNumber })
    .from(quotes)
    .where(eq(quotes.id, inv.quoteId));
  const sourceQuoteNumber = srcRows[0]?.quoteNumber ?? null;

  const issueDateFormatted = (() => {
    try {
      const d = new Date(`${inv.issueDate as unknown as string}T00:00:00`);
      return format(d, "d MMMM yyyy");
    } catch {
      return String(inv.issueDate);
    }
  })();

  const pdfLines: TaxInvoicePdfLine[] = lines.map((l) => ({
    sno: l.sno,
    sectionLetter: l.sectionLetter,
    sectionTitle: l.sectionTitle,
    isLabourStyle: l.isLabourStyle,
    skuSnapshot: l.skuSnapshot,
    description: l.description,
    hsnCode: l.hsnCode,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
    taxableValue: l.taxableValue,
    cgstRate: l.cgstRate,
    cgstAmount: l.cgstAmount,
    sgstRate: l.sgstRate,
    sgstAmount: l.sgstAmount,
    igstRate: l.igstRate,
    igstAmount: l.igstAmount,
    lineTotal: l.lineTotal,
  }));

  const data: TaxInvoicePdfData = {
    invoiceNumber: inv.invoiceNumber,
    issueDate: issueDateFormatted,
    placeOfSupply: inv.placeOfSupply,
    placeOfSupplyCode: inv.placeOfSupplyCode,
    isInterState: inv.isInterState,
    reverseCharge: inv.reverseCharge,
    supplier: {
      legalName: inv.supplierLegalName,
      brandName: "BreatheWise",
      address: inv.supplierAddress,
      state: inv.supplierState,
      stateCode: inv.supplierStateCode,
      gstin: inv.supplierGstin,
      pan: inv.supplierPan,
      phone: inv.supplierPhone,
      email: inv.supplierEmail,
    },
    buyer: {
      name: inv.buyerName,
      company: inv.buyerCompany,
      address: inv.buyerAddress,
      state: inv.buyerState,
      stateCode: inv.buyerStateCode,
      gstin: inv.buyerGstin,
      phone: inv.buyerPhone,
      email: inv.buyerEmail,
    },
    lines: pdfLines,
    totals: {
      taxableValue: inv.totalTaxableValue,
      cgst: inv.totalCgst,
      sgst: inv.totalSgst,
      igst: inv.totalIgst,
      invoiceValue: inv.totalInvoiceValue,
    },
    bank: {
      name: inv.bankName,
      account: inv.bankAccount,
      ifsc: inv.bankIfsc,
      branch: inv.bankBranch,
    },
    notes: inv.notes,
    sourceQuoteNumber,
  };

  const buffer = await renderToBuffer(<TaxInvoicePdfDocument data={data} />);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.invoiceNumber.replace(/\//g, "-")}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
