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
  Decimal,
  buildInvoiceFromQuote,
  computeInvoiceLineTax,
  recomputeInvoiceTotalsFromLines,
  type InvoiceBuildSection,
} from "@/lib/pricing";
import { deriveStateCode } from "@/lib/gst/state-codes";
import { audit } from "@/lib/audit/log";

/**
 * Tax-invoice lifecycle:
 *   1. convertQuoteToInvoiceAction — spawns a DRAFT invoice from an
 *      accepted quote. No invoice number yet, fully editable.
 *   2. add/update/deleteInvoiceLineAction — line-level editing on a
 *      DRAFT. Each call recomputes the line's tax + invoice totals.
 *   3. finalizeInvoiceAction — DRAFT → ISSUED. Allocates the next
 *      BW/INV/2627/NNNN, freezes the row. Cannot be undone.
 *   4. deleteDraftInvoiceAction — discards a DRAFT entirely.
 *
 * Issued invoices are legally immutable (Rule 46). Every mutating
 * action below guards against status='ISSUED' and rejects edits.
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
  | { ok: true; invoiceId: string }
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

  // Auto-derive state_code from state name when missing (e.g. older
  // rows where state was filled but state_code wasn't). Falls back to
  // the user-supplied stateCode if derivation fails for non-standard
  // state names. Better UX than a hard "go set it" error.
  const supplierStateCode =
    settings.stateCode ?? (settings.state ? deriveStateCode(settings.state) : null);
  if (!settings.state || !supplierStateCode) {
    return {
      ok: false,
      error:
        "Supplier state isn't set in Settings yet. Open Settings → Tax-invoice details, add the state name (e.g. Delhi) and code (e.g. 07), then come back here.",
    };
  }
  const buyerStateCode =
    buyer.stateCode ?? (buyer.state ? deriveStateCode(buyer.state) : null);
  if (!buyer.state || !buyerStateCode) {
    return {
      ok: false,
      error: `Client "${buyer.name}" has no state set. Open the client's page, add their state (e.g. Delhi, Uttar Pradesh), save, then retry. The state code derives automatically from the name.`,
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
  const placeOfSupplyStateCode = deliveryStateCode ?? buyerStateCode;
  const isInterState = placeOfSupplyStateCode !== supplierStateCode;
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

  // 4. Issue date. Invoice number is NOT allocated yet — that only
  //    happens at Finalize, so abandoned drafts don't leave gaps in
  //    the sequential BW/INV/2627/NNNN series.
  const issueDateStr =
    data.issueDate ?? new Date().toISOString().slice(0, 10);

  // 5. Insert invoice + lines in a single transaction.
  const result = await db.transaction(async (tx) => {
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
        invoiceNumber: null,
        status: "DRAFT",
        quoteId: quote.id,
        clientId: buyer.id,
        issueDate: issueDateStr,
        supplierState: settings.state!,
        supplierStateCode: supplierStateCode,
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
        buyerStateCode: buyerStateCode,
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

    return { invoiceId: created.id };
  });

  await audit({
    actorId: actor.id,
    action: "INVOICE_DRAFT_CREATE",
    entityType: "invoice",
    entityId: result.invoiceId,
    metadata: {
      quoteId: quote.id,
      quoteNumber: quote.quoteNumber,
      preBuiltTotal: built.grandTotalRounded.toFixed(2),
      isInterState,
      includeLabour: data.includeLabour,
      shipTo: deliveryStateTrimmed,
    },
  });

  revalidatePath("/invoices");
  revalidatePath(`/quotes/${quote.id}`);
  return { ok: true, invoiceId: result.invoiceId };
}

// =============================================================
// DRAFT-edit actions — line CRUD + invoice-level updates
// =============================================================

type InvoiceRow = typeof invoices.$inferSelect;
type LoadResult =
  | { ok: true; invoice: InvoiceRow }
  | { ok: false; error: string };

/**
 * Refuse if the invoice is ISSUED (legally immutable). Returns the
 * invoice row so callers can read the latest place-of-supply etc.
 */
async function loadDraftInvoiceOrError(
  invoiceId: string,
): Promise<LoadResult> {
  const rows = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  const inv = rows[0];
  if (!inv) return { ok: false, error: "Invoice not found" };
  if (inv.status === "ISSUED") {
    return {
      ok: false,
      error: "Invoice is ISSUED — already a legal document, cannot be edited.",
    };
  }
  return { ok: true, invoice: inv };
}

/**
 * Re-aggregate the invoice header totals from the current set of
 * lines. Called by every line-CRUD action so the totals row in the DB
 * stays in sync with the lines. Touches updated_at via the trigger.
 */
async function recomputeAndPersistTotals(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  invoiceId: string,
) {
  const linesNow = await tx
    .select({
      taxableValue: invoiceLines.taxableValue,
      cgstAmount: invoiceLines.cgstAmount,
      sgstAmount: invoiceLines.sgstAmount,
      igstAmount: invoiceLines.igstAmount,
    })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId));

  const totals = recomputeInvoiceTotalsFromLines(
    linesNow.map((l) => ({
      taxableValue: new Decimal(l.taxableValue),
      cgstAmount: new Decimal(l.cgstAmount),
      sgstAmount: new Decimal(l.sgstAmount),
      igstAmount: new Decimal(l.igstAmount),
    })),
  );
  await tx
    .update(invoices)
    .set({
      totalTaxableValue: totals.totalTaxableValue.toFixed(2),
      totalCgst: totals.totalCgst.toFixed(2),
      totalSgst: totals.totalSgst.toFixed(2),
      totalIgst: totals.totalIgst.toFixed(2),
      totalInvoiceValue: totals.grandTotalRounded.toFixed(2),
      roundOff: totals.roundOff.toFixed(2),
    })
    .where(eq(invoices.id, invoiceId));
}

// ── Add a new line to a DRAFT ──────────────────────────────────
const addLineSchema = z.object({
  invoiceId: z.string().uuid(),
  description: z.string().trim().min(1).max(2000),
  hsnCode: z.string().trim().max(20).optional().nullable(),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Quantity must be a positive number"),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Unit price must be a positive number"),
  gstRate: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "GST rate must be a number")
    .default("18"),
  sectionLetter: z.string().trim().max(2).optional().nullable(),
  sectionTitle: z.string().trim().max(200).optional().nullable(),
  isLabourStyle: z.boolean().default(false),
});

export type LineResult = { ok: true } | { ok: false; error: string };

/**
 * The new line as returned by addInvoiceLineAction — lets the editor
 * append optimistically without a router.refresh round-trip.
 */
export interface CreatedInvoiceLine {
  id: string;
  sno: number;
  sectionLetter: string | null;
  sectionTitle: string | null;
  isLabourStyle: boolean;
  skuSnapshot: string | null;
  description: string;
  hsnCode: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  gstRate: string;
  taxableValue: string;
  cgstAmount: string;
  sgstAmount: string;
  igstAmount: string;
  lineTotal: string;
}
export type AddLineResult =
  | { ok: true; line: CreatedInvoiceLine }
  | { ok: false; error: string };

export async function addInvoiceLineAction(
  input: z.input<typeof addLineSchema>,
): Promise<AddLineResult> {
  await requireEmployeeOrAbove();
  const parsed = addLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid line" };
  }
  const data = parsed.data;

  const check = await loadDraftInvoiceOrError(data.invoiceId);
  if (!check.ok) return { ok: false, error: check.error };
  const inv = check.invoice;

  const tax = computeInvoiceLineTax(
    new Decimal(data.quantity),
    new Decimal(data.unitPrice),
    new Decimal(data.gstRate),
    inv.isInterState,
  );

  const created = await db.transaction(async (tx) => {
    // Append at the end of the current sort order.
    const maxRows = (await tx.execute(
      sql`SELECT COALESCE(MAX(sort_order), -1) AS m FROM invoice_lines WHERE invoice_id = ${data.invoiceId}::uuid`,
    )) as unknown as { m: number }[];
    const nextSort = (maxRows[0]?.m ?? -1) + 1;
    const maxSnoRows = (await tx.execute(
      sql`SELECT COALESCE(MAX(sno), 0) AS m FROM invoice_lines WHERE invoice_id = ${data.invoiceId}::uuid`,
    )) as unknown as { m: number }[];
    const nextSno = (maxSnoRows[0]?.m ?? 0) + 1;

    const [row] = await tx
      .insert(invoiceLines)
      .values({
        invoiceId: data.invoiceId,
        sno: nextSno,
        sectionLetter: data.sectionLetter ?? null,
        sectionTitle: data.sectionTitle ?? null,
        isLabourStyle: data.isLabourStyle,
        skuSnapshot: null,
        description: data.description,
        hsnCode: data.hsnCode ?? null,
        quantity: new Decimal(data.quantity).toFixed(2),
        unit: data.unit,
        unitPrice: new Decimal(data.unitPrice).toFixed(2),
        gstRate: new Decimal(data.gstRate).toFixed(2),
        taxableValue: tax.taxableValue.toFixed(2),
        cgstRate: tax.cgstRate.toFixed(2),
        cgstAmount: tax.cgstAmount.toFixed(2),
        sgstRate: tax.sgstRate.toFixed(2),
        sgstAmount: tax.sgstAmount.toFixed(2),
        igstRate: tax.igstRate.toFixed(2),
        igstAmount: tax.igstAmount.toFixed(2),
        lineTotal: tax.lineTotal.toFixed(2),
        sortOrder: nextSort,
      })
      .returning();
    await recomputeAndPersistTotals(tx, data.invoiceId);
    return row;
  });

  revalidatePath(`/invoices/${data.invoiceId}/edit`);
  revalidatePath(`/invoices/${data.invoiceId}`);
  return {
    ok: true,
    line: {
      id: created.id,
      sno: created.sno,
      sectionLetter: created.sectionLetter,
      sectionTitle: created.sectionTitle,
      isLabourStyle: created.isLabourStyle,
      skuSnapshot: created.skuSnapshot,
      description: created.description,
      hsnCode: created.hsnCode,
      quantity: created.quantity,
      unit: created.unit,
      unitPrice: created.unitPrice,
      gstRate: created.gstRate,
      taxableValue: created.taxableValue,
      cgstAmount: created.cgstAmount,
      sgstAmount: created.sgstAmount,
      igstAmount: created.igstAmount,
      lineTotal: created.lineTotal,
    },
  };
}

// ── Update an existing line ────────────────────────────────────
const updateLineSchema = z.object({
  lineId: z.string().uuid(),
  description: z.string().trim().min(1).max(2000).optional(),
  hsnCode: z.string().trim().max(20).optional().nullable(),
  quantity: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  unitPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  gstRate: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  isLabourStyle: z.boolean().optional(),
});

export async function updateInvoiceLineAction(
  input: z.input<typeof updateLineSchema>,
): Promise<LineResult> {
  await requireEmployeeOrAbove();
  const parsed = updateLineSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid update" };
  }
  const data = parsed.data;

  const lineRows = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.id, data.lineId));
  const line = lineRows[0];
  if (!line) return { ok: false, error: "Line not found" };

  const check = await loadDraftInvoiceOrError(line.invoiceId);
  if (!check.ok) return { ok: false, error: check.error };
  const inv = check.invoice;

  // Merge updates with existing values, then recompute tax.
  const qty = new Decimal(data.quantity ?? line.quantity);
  const unitPrice = new Decimal(data.unitPrice ?? line.unitPrice);
  const gstRate = new Decimal(data.gstRate ?? line.gstRate);
  const tax = computeInvoiceLineTax(qty, unitPrice, gstRate, inv.isInterState);

  await db.transaction(async (tx) => {
    await tx
      .update(invoiceLines)
      .set({
        description: data.description ?? line.description,
        hsnCode: data.hsnCode === undefined ? line.hsnCode : data.hsnCode,
        quantity: qty.toFixed(2),
        unit: data.unit ?? line.unit,
        unitPrice: unitPrice.toFixed(2),
        gstRate: gstRate.toFixed(2),
        taxableValue: tax.taxableValue.toFixed(2),
        cgstRate: tax.cgstRate.toFixed(2),
        cgstAmount: tax.cgstAmount.toFixed(2),
        sgstRate: tax.sgstRate.toFixed(2),
        sgstAmount: tax.sgstAmount.toFixed(2),
        igstRate: tax.igstRate.toFixed(2),
        igstAmount: tax.igstAmount.toFixed(2),
        lineTotal: tax.lineTotal.toFixed(2),
        isLabourStyle:
          data.isLabourStyle === undefined
            ? line.isLabourStyle
            : data.isLabourStyle,
      })
      .where(eq(invoiceLines.id, data.lineId));
    await recomputeAndPersistTotals(tx, line.invoiceId);
  });

  revalidatePath(`/invoices/${line.invoiceId}/edit`);
  revalidatePath(`/invoices/${line.invoiceId}`);
  return { ok: true };
}

// ── Delete a line ──────────────────────────────────────────────
const deleteLineSchema = z.object({ lineId: z.string().uuid() });

export async function deleteInvoiceLineAction(
  input: z.input<typeof deleteLineSchema>,
): Promise<LineResult> {
  await requireEmployeeOrAbove();
  const { lineId } = deleteLineSchema.parse(input);
  const lineRows = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.id, lineId));
  const line = lineRows[0];
  if (!line) return { ok: false, error: "Line not found" };

  const check = await loadDraftInvoiceOrError(line.invoiceId);
  if (!check.ok) return { ok: false, error: check.error };

  await db.transaction(async (tx) => {
    await tx.delete(invoiceLines).where(eq(invoiceLines.id, lineId));
    await recomputeAndPersistTotals(tx, line.invoiceId);
  });

  revalidatePath(`/invoices/${line.invoiceId}/edit`);
  revalidatePath(`/invoices/${line.invoiceId}`);
  return { ok: true };
}

// ── Update invoice-level fields (notes, reverse charge, dates) ──
const updateMetaSchema = z.object({
  invoiceId: z.string().uuid(),
  issueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reverseCharge: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  deliveryAddress: z.string().trim().max(500).optional().nullable(),
  deliveryState: z.string().trim().max(80).optional().nullable(),
});

export async function updateInvoiceMetaAction(
  input: z.input<typeof updateMetaSchema>,
): Promise<LineResult> {
  await requireEmployeeOrAbove();
  const parsed = updateMetaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;
  const check = await loadDraftInvoiceOrError(data.invoiceId);
  if (!check.ok) return { ok: false, error: check.error };
  const inv = check.invoice;

  // Ship-to changes recompute place of supply (and possibly flip intra
  // ↔ inter-state). When that happens we must recompute every line's
  // tax breakdown because CGST/SGST ↔ IGST changes per line too.
  let newDeliveryState: string | null = inv.deliveryState;
  let newDeliveryStateCode: string | null = inv.deliveryStateCode;
  let newDeliveryAddress: string | null = inv.deliveryAddress;
  let newPlaceOfSupply: string = inv.placeOfSupply;
  let newPlaceOfSupplyCode: string = inv.placeOfSupplyCode;
  let newIsInterState: boolean = inv.isInterState;

  if (data.deliveryState !== undefined) {
    const trimmed = data.deliveryState?.trim() || null;
    if (trimmed) {
      const code = deriveStateCode(trimmed);
      if (!code) {
        return {
          ok: false,
          error: `Delivery state "${trimmed}" isn't a recognised Indian state.`,
        };
      }
      newDeliveryState = trimmed;
      newDeliveryStateCode = code;
      newPlaceOfSupply = trimmed;
      newPlaceOfSupplyCode = code;
    } else {
      // Cleared — revert place of supply to buyer's billing state.
      newDeliveryState = null;
      newDeliveryStateCode = null;
      newPlaceOfSupply = inv.buyerState ?? inv.placeOfSupply;
      newPlaceOfSupplyCode = inv.buyerStateCode ?? inv.placeOfSupplyCode;
    }
    newIsInterState = newPlaceOfSupplyCode !== inv.supplierStateCode;
  }
  if (data.deliveryAddress !== undefined) {
    newDeliveryAddress = data.deliveryAddress?.trim() || null;
  }

  const interStateFlipped = newIsInterState !== inv.isInterState;

  await db.transaction(async (tx) => {
    await tx
      .update(invoices)
      .set({
        issueDate: data.issueDate ?? inv.issueDate,
        reverseCharge: data.reverseCharge ?? inv.reverseCharge,
        notes: data.notes === undefined ? inv.notes : data.notes,
        deliveryAddress: newDeliveryAddress,
        deliveryState: newDeliveryState,
        deliveryStateCode: newDeliveryStateCode,
        placeOfSupply: newPlaceOfSupply,
        placeOfSupplyCode: newPlaceOfSupplyCode,
        isInterState: newIsInterState,
      })
      .where(eq(invoices.id, data.invoiceId));

    if (interStateFlipped) {
      // Re-derive every line's tax breakdown under the new regime.
      const lines = await tx
        .select()
        .from(invoiceLines)
        .where(eq(invoiceLines.invoiceId, data.invoiceId));
      for (const l of lines) {
        const tax = computeInvoiceLineTax(
          new Decimal(l.quantity),
          new Decimal(l.unitPrice),
          new Decimal(l.gstRate),
          newIsInterState,
        );
        await tx
          .update(invoiceLines)
          .set({
            cgstRate: tax.cgstRate.toFixed(2),
            cgstAmount: tax.cgstAmount.toFixed(2),
            sgstRate: tax.sgstRate.toFixed(2),
            sgstAmount: tax.sgstAmount.toFixed(2),
            igstRate: tax.igstRate.toFixed(2),
            igstAmount: tax.igstAmount.toFixed(2),
            lineTotal: tax.lineTotal.toFixed(2),
          })
          .where(eq(invoiceLines.id, l.id));
      }
      await recomputeAndPersistTotals(tx, data.invoiceId);
    }
  });

  revalidatePath(`/invoices/${data.invoiceId}/edit`);
  revalidatePath(`/invoices/${data.invoiceId}`);
  return { ok: true };
}

// ── Finalize a DRAFT into an ISSUED invoice ────────────────────
const finalizeSchema = z.object({ invoiceId: z.string().uuid() });

export type FinalizeResult =
  | { ok: true; invoiceNumber: string }
  | { ok: false; error: string };

export async function finalizeInvoiceAction(
  input: z.input<typeof finalizeSchema>,
): Promise<FinalizeResult> {
  const actor = await requireEmployeeOrAbove();
  const { invoiceId } = finalizeSchema.parse(input);
  const check = await loadDraftInvoiceOrError(invoiceId);
  if (!check.ok) return { ok: false, error: check.error };
  const inv = check.invoice;

  // Guardrail: refuse to finalize an empty invoice.
  const lineCount = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))) as unknown as { n: number }[];
  if ((lineCount[0]?.n ?? 0) === 0) {
    return {
      ok: false,
      error: "Cannot finalize — invoice has no lines. Add at least one item first.",
    };
  }

  // Allocate the next sequential number for the issue date's FY.
  const settingsRows = await db
    .select({ prefix: companySettings.quoteNumberPrefix })
    .from(companySettings)
    .where(eq(companySettings.id, 1));
  const prefix = settingsRows[0]?.prefix ?? "BW";
  const issueDate = new Date(`${inv.issueDate as unknown as string}T00:00:00Z`);
  const fyStart = fyStartYear(issueDate);

  const result = await db.transaction(async (tx) => {
    // Re-compute totals one more time inside the txn so we never
    // freeze a stale row (e.g. line added after a totals recompute).
    await recomputeAndPersistTotals(tx, invoiceId);

    const numRows = (await tx.execute(
      sql`SELECT next_invoice_number(${prefix}, ${fyStart}::int) AS n`,
    )) as unknown as { n: string }[];
    const invoiceNumber = numRows[0]?.n;
    if (!invoiceNumber) throw new Error("Could not allocate invoice number");

    await tx
      .update(invoices)
      .set({ status: "ISSUED", invoiceNumber })
      .where(eq(invoices.id, invoiceId));
    return invoiceNumber;
  });

  await audit({
    actorId: actor.id,
    action: "INVOICE_FINALIZE",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: { invoiceNumber: result },
  });

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath(`/invoices/${invoiceId}/edit`);
  return { ok: true, invoiceNumber: result };
}

// ── Discard a DRAFT ────────────────────────────────────────────
const deleteDraftSchema = z.object({ invoiceId: z.string().uuid() });

export async function deleteDraftInvoiceAction(
  input: z.input<typeof deleteDraftSchema>,
): Promise<LineResult> {
  const actor = await requireEmployeeOrAbove();
  const { invoiceId } = deleteDraftSchema.parse(input);
  const check = await loadDraftInvoiceOrError(invoiceId);
  if (!check.ok) return { ok: false, error: check.error };

  await db.transaction(async (tx) => {
    // invoice_lines has ON DELETE CASCADE so this clears them too.
    await tx.delete(invoices).where(eq(invoices.id, invoiceId));
  });

  await audit({
    actorId: actor.id,
    action: "INVOICE_DRAFT_DELETE",
    entityType: "invoice",
    entityId: invoiceId,
    metadata: {},
  });

  revalidatePath("/invoices");
  return { ok: true };
}
