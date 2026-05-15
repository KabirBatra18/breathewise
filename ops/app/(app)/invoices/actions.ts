"use server";

import { revalidatePath } from "next/cache";
import { asc, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  clients,
  companySettings,
  invoices,
  invoiceLines,
  products,
  quoteLineItems,
  quoteSections,
  quotes,
} from "@/db/schema";
import { requireEmployeeOrAbove } from "@/lib/auth/server";
import {
  buildInvoiceFromQuote,
  type InvoiceBuildSection,
} from "@/lib/pricing";
import { deriveStateCode } from "@/lib/gst/state-codes";
import { audit } from "@/lib/audit/log";

/**
 * Convert a quote to a frozen tax invoice. The original quote is left
 * untouched — this only INSERTS into invoices + invoice_lines.
 *
 * Only ACCEPTED / ADVANCE_PAID quotes can convert. The user picks at
 * call time whether to include labour sections and whether reverse
 * charge applies.
 */

const convertSchema = z.object({
  quoteId: z.string().uuid(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  includeLabour: z.boolean().default(false),
  reverseCharge: z.boolean().default(false),
  // Optional ship-to. When deliveryState differs from buyer.state the
  // engine flips intra ↔ inter-state automatically. Empty = same as
  // billing address (most common).
  deliveryAddress: z.string().trim().max(500).optional(),
  deliveryState: z.string().trim().max(80).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type ConvertResult =
  | { ok: true; invoiceId: string; invoiceNumber: string }
  | { ok: false; error: string };

/**
 * The Indian financial year runs 1 April → 31 March. Given a date,
 * return the year in which that FY started.
 */
function fyStartYear(d: Date): number {
  return d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

export async function convertQuoteToInvoiceAction(
  input: z.input<typeof convertSchema>,
): Promise<ConvertResult> {
  const actor = await requireEmployeeOrAbove();
  const parsed = convertSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }
  const data = parsed.data;

  // 1. Load quote + sections + lines + buyer + supplier settings.
  const qRows = await db.select().from(quotes).where(eq(quotes.id, data.quoteId));
  const quote = qRows[0];
  if (!quote) return { ok: false, error: "Quote not found" };
  if (quote.status !== "ACCEPTED" && quote.status !== "ADVANCE_PAID") {
    return {
      ok: false,
      error: `Quote is ${quote.status}. Only ACCEPTED / ADVANCE_PAID quotes can be invoiced.`,
    };
  }

  const [buyerRows, settingsRows, sections] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, quote.clientId)),
    db.select().from(companySettings).where(eq(companySettings.id, 1)),
    db
      .select()
      .from(quoteSections)
      .where(eq(quoteSections.quoteId, quote.id))
      .orderBy(asc(quoteSections.sortOrder)),
  ]);
  const buyer = buyerRows[0];
  const settings = settingsRows[0];
  if (!buyer || !settings) {
    return { ok: false, error: "Client or company settings missing" };
  }

  if (!settings.state || !settings.stateCode) {
    return {
      ok: false,
      error: "Set supplier state + state code in Settings before invoicing.",
    };
  }
  if (!buyer.state || !buyer.stateCode) {
    return {
      ok: false,
      error: `Client "${buyer.name}" has no state set. Edit the client and add state / state code, then retry.`,
    };
  }

  // 2. Pull lines per section + resolve HSN + SKU from product master.
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
  const allProductIds = Array.from(
    new Set(
      sectionLines
        .flatMap((s) => s.lines)
        .map((l) => l.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const productInfo = new Map<string, { sku: string | null; hsn: string | null }>();
  if (allProductIds.length > 0) {
    const rows = await db
      .select({ id: products.id, sku: products.sku, hsn: products.hsnCode })
      .from(products);
    for (const r of rows) {
      productInfo.set(r.id, { sku: r.sku, hsn: r.hsn });
    }
  }

  // 3. Place of supply: derive from the delivery state if the user
  //    provided a ship-to, otherwise from the buyer's billing state.
  //    Per GST law the place of supply for goods is where movement
  //    terminates — so a Delhi-billed customer asking for Noida
  //    delivery correctly flips this invoice to IGST.
  const deliveryStateTrimmed = data.deliveryState?.trim() || null;
  const deliveryAddressTrimmed = data.deliveryAddress?.trim() || null;
  const deliveryStateCode = deliveryStateTrimmed
    ? deriveStateCode(deliveryStateTrimmed)
    : null;
  if (deliveryStateTrimmed && !deliveryStateCode) {
    return {
      ok: false,
      error: `Delivery state "${deliveryStateTrimmed}" isn't a recognised Indian state — fix the spelling (e.g. "Uttar Pradesh") and retry.`,
    };
  }
  const placeOfSupplyState = deliveryStateTrimmed ?? buyer.state!;
  const placeOfSupplyStateCode = deliveryStateCode ?? buyer.stateCode!;
  const isInterState = placeOfSupplyStateCode !== settings.stateCode;
  const engineSections: InvoiceBuildSection[] = sectionLines.map(
    ({ section, lines }) => ({
      letter: section.sectionLetter,
      title: section.title,
      isLabourStyle: section.isLabourStyle,
      appliesDiscount: section.appliesDiscount,
      gstRate: section.gstRate,
      discountPercent: quote.roughDiscountPercent ?? "0",
      lines: lines.map((l, idx) => {
        const info = l.productId ? productInfo.get(l.productId) : null;
        return {
          sno: idx + 1,
          sectionLetter: section.sectionLetter,
          sectionTitle: section.title,
          isLabourStyle: section.isLabourStyle,
          skuSnapshot: info?.sku ?? null,
          description: l.description,
          // Labour lines get SAC 9954 (construction services) by default.
          hsnCode: section.isLabourStyle ? "9954" : info?.hsn ?? "8414",
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          mrp: l.mrp,
        };
      }),
    }),
  );

  const built = buildInvoiceFromQuote({
    sections: engineSections,
    discountTargetSaving: quote.discountTargetSaving,
    isInterState,
    includeLabour: data.includeLabour,
  });

  if (built.lines.length === 0) {
    return {
      ok: false,
      error:
        "Nothing to invoice — quote has no non-labour lines (or labour was excluded).",
    };
  }

  // 4. Issue date + FY → invoice number.
  const issueDateStr =
    data.issueDate ?? new Date().toISOString().slice(0, 10);
  const issueDate = new Date(`${issueDateStr}T00:00:00Z`);
  const fyStart = fyStartYear(issueDate);
  const prefix = settings.quoteNumberPrefix ?? "BW";

  // 5. Insert invoice + lines in a single transaction.
  const result = await db.transaction(async (tx) => {
    const numRows = (await tx.execute(
      sql`SELECT next_invoice_number(${prefix}, ${fyStart}::int) AS n`,
    )) as unknown as { n: string }[];
    const invoiceNumber = numRows[0]?.n;
    if (!invoiceNumber) throw new Error("Could not allocate invoice number");

    const buyerAddress = [
      buyer.addressLine1,
      buyer.addressLine2,
      [buyer.city, buyer.state, buyer.pincode].filter(Boolean).join(", "),
    ]
      .filter((x): x is string => Boolean(x && x.trim()))
      .join(" · ");

    const [created] = await tx
      .insert(invoices)
      .values({
        invoiceNumber,
        quoteId: quote.id,
        clientId: buyer.id,
        issueDate: issueDateStr,
        supplierState: settings.state!,
        supplierStateCode: settings.stateCode!,
        placeOfSupply: placeOfSupplyState,
        placeOfSupplyCode: placeOfSupplyStateCode,
        isInterState,
        reverseCharge: data.reverseCharge,
        includeLabour: data.includeLabour,
        supplierLegalName: settings.legalName,
        supplierAddress: settings.address,
        supplierGstin: settings.gstin,
        supplierPan: settings.pan,
        supplierPhone: settings.phone,
        supplierEmail: settings.email,
        buyerName: buyer.name,
        buyerCompany: buyer.companyName,
        buyerAddress,
        buyerGstin: buyer.gstin,
        buyerPhone: buyer.phone,
        buyerEmail: buyer.email,
        buyerState: buyer.state,
        buyerStateCode: buyer.stateCode,
        bankName: settings.bankName,
        bankAccount: settings.bankAccount,
        bankIfsc: settings.bankIfsc,
        bankBranch: settings.bankBranch,
        totalTaxableValue: built.totalTaxableValue.toFixed(2),
        totalCgst: built.totalCgst.toFixed(2),
        totalSgst: built.totalSgst.toFixed(2),
        totalIgst: built.totalIgst.toFixed(2),
        roundOff: built.roundOff.toFixed(2),
        // Store the ROUNDED grand total so the figure on the invoice
        // PDF and the figure in the DB are byte-identical.
        totalInvoiceValue: built.grandTotalRounded.toFixed(2),
        deliveryAddress: deliveryAddressTrimmed,
        deliveryState: deliveryStateTrimmed,
        deliveryStateCode: deliveryStateCode,
        notes: data.notes ?? null,
        createdBy: actor.id,
      })
      .returning({ id: invoices.id });

    for (const [idx, l] of built.lines.entries()) {
      await tx.insert(invoiceLines).values({
        invoiceId: created.id,
        sno: l.sno,
        sectionLetter: l.sectionLetter,
        sectionTitle: l.sectionTitle,
        isLabourStyle: l.isLabourStyle,
        skuSnapshot: l.skuSnapshot,
        description: l.description,
        hsnCode: l.hsnCode,
        quantity: l.quantity.toFixed(2),
        unit: l.unit,
        unitPrice: l.unitPrice.toFixed(2),
        gstRate: l.gstRate.toFixed(2),
        taxableValue: l.taxableValue.toFixed(2),
        cgstRate: l.cgstRate.toFixed(2),
        cgstAmount: l.cgstAmount.toFixed(2),
        sgstRate: l.sgstRate.toFixed(2),
        sgstAmount: l.sgstAmount.toFixed(2),
        igstRate: l.igstRate.toFixed(2),
        igstAmount: l.igstAmount.toFixed(2),
        lineTotal: l.lineTotal.toFixed(2),
        sortOrder: idx,
      });
    }

    return { invoiceId: created.id, invoiceNumber };
  });

  await audit({
    actorId: actor.id,
    action: "INVOICE_CREATE",
    entityType: "invoice",
    entityId: result.invoiceId,
    metadata: {
      invoiceNumber: result.invoiceNumber,
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      total: built.grandTotalRounded.toFixed(2),
      roundOff: built.roundOff.toFixed(2),
      isInterState,
      includeLabour: data.includeLabour,
      shipTo: deliveryStateTrimmed,
    },
  });

  revalidatePath("/invoices");
  revalidatePath(`/quotes/${quote.id}`);
  return {
    ok: true,
    invoiceId: result.invoiceId,
    invoiceNumber: result.invoiceNumber,
  };
}
