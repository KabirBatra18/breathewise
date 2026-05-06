"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
  companySettings,
  products,
  productCosts,
  quoteLineItems,
  quoteSections,
  quoteTerms,
  quoteTierFinancials,
  quotes,
  termsClauses,
} from "@/db/schema";
import { requireAuth, requireEmployeeOrAbove } from "@/lib/auth/server";
import {
  Decimal,
  computeQuoteTotals,
  computeFinancials,
  toMoney,
  type SectionInput,
} from "@/lib/pricing";
import { defaultDescriptionFor } from "@/lib/products/descriptions";
import { audit } from "@/lib/audit/log";

const lineSchema = z.object({
  productId: z.string().uuid().nullable().optional(),
  sno: z.number().int().nonnegative(),
  description: z.string().trim().min(1).max(2000),
  mrp: z.string().nullable().optional(),
  quantity: z.string(),
  unitPrice: z.string(),
  unit: z.string().min(1).max(20),
});

const sectionSchema = z.object({
  letter: z.string().regex(/^[A-Z]$/),
  title: z.string().trim().min(1).max(200),
  gstRate: z.string(),
  isLabourStyle: z.boolean(),
  appliesDiscount: z.boolean(),
  lines: z.array(lineSchema).min(1),
});

const saveSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  quoteType: z.literal("ROUGH"),
  issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  validityDays: z.number().int().min(1).max(365),
  discountPercent: z.string(),
  sections: z.array(sectionSchema).min(1),
  termsClauseIds: z.array(z.string().uuid()).default([]),
  // Whether to render the "You save ₹X vs list price" bar on the PDF.
  // Default false so tiny / cosmetic savings don't render as silly.
  showSavingsOnPdf: z.boolean().default(false),
});

export type SaveQuoteInput = z.infer<typeof saveSchema>;
export type SaveQuoteResult =
  | { ok: true; id: string; quoteNumber: string }
  | { ok: false; error: string };

async function nextQuoteNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const result = await db.execute<{ next_quote_number: string }>(
    sql`SELECT next_quote_number('BW', ${year}::int) AS next_quote_number`,
  );
  const value = (result as unknown as { next_quote_number: string }[])[0]
    ?.next_quote_number;
  if (!value) throw new Error("Could not allocate quote number");
  return value;
}

export async function saveRoughQuoteAction(
  input: SaveQuoteInput,
): Promise<SaveQuoteResult> {
  const actor = await requireEmployeeOrAbove();

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid quote data" };
  }
  const data = parsed.data;

  // Snapshot cost prices server-side (employees never send them).
  const productIds = Array.from(
    new Set(
      data.sections
        .flatMap((s) => s.lines)
        .map((l) => l.productId)
        .filter((v): v is string => Boolean(v)),
    ),
  );
  const costMap = new Map<string, string>();
  if (productIds.length > 0) {
    const rows = await db
      .select({
        productId: productCosts.productId,
        costPrice: productCosts.costPrice,
      })
      .from(productCosts)
      .where(inArray(productCosts.productId, productIds));
    for (const row of rows) costMap.set(row.productId, row.costPrice);
  }

  const sectionsForCalc: SectionInput[] = data.sections.map((s) => ({
    discountPercent: data.discountPercent,
    gstRate: s.gstRate,
    isLabourStyle: s.isLabourStyle,
    appliesDiscount: s.appliesDiscount,
    lines: s.lines.map((l) => ({
      qty: l.quantity,
      unitPrice: l.unitPrice,
      costPriceSnapshot: l.productId ? costMap.get(l.productId) ?? null : null,
    })),
  }));

  const totals = computeQuoteTotals(sectionsForCalc);
  const financials = computeFinancials(sectionsForCalc);

  const result = await db.transaction(async (tx) => {
    let quoteId = data.id;
    let quoteNumber: string;

    if (quoteId) {
      const existing = await tx.query.quotes.findFirst({
        where: eq(quotes.id, quoteId),
      });
      if (!existing) throw new Error("Quote not found");
      if (existing.status !== "DRAFT") {
        throw new Error("Only DRAFT quotes can be edited.");
      }
      quoteNumber = existing.quoteNumber;
      await tx
        .update(quotes)
        .set({
          clientId: data.clientId,
          quoteType: "ROUGH",
          status: "DRAFT",
          roughDiscountPercent: data.discountPercent,
          validityDays: data.validityDays,
          issueDate: data.issueDate,
          showSavingsOnPdf: data.showSavingsOnPdf,
        })
        .where(eq(quotes.id, quoteId));

      await tx.delete(quoteSections).where(eq(quoteSections.quoteId, quoteId));
      await tx.delete(quoteTerms).where(eq(quoteTerms.quoteId, quoteId));
    } else {
      quoteNumber = await nextQuoteNumber();
      const [row] = await tx
        .insert(quotes)
        .values({
          quoteNumber,
          clientId: data.clientId,
          quoteType: "ROUGH",
          status: "DRAFT",
          roughDiscountPercent: data.discountPercent,
          validityDays: data.validityDays,
          issueDate: data.issueDate,
          showSavingsOnPdf: data.showSavingsOnPdf,
          createdBy: actor.id,
        })
        .returning({ id: quotes.id });
      quoteId = row.id;
    }

    for (const [sectionIndex, s] of data.sections.entries()) {
      const [section] = await tx
        .insert(quoteSections)
        .values({
          quoteId: quoteId!,
          sectionLetter: s.letter,
          title: s.title,
          gstRate: s.gstRate,
          sortOrder: sectionIndex,
          isLabourStyle: s.isLabourStyle,
          appliesDiscount: s.appliesDiscount,
        })
        .returning({ id: quoteSections.id });

      for (const [lineIndex, l] of s.lines.entries()) {
        await tx.insert(quoteLineItems).values({
          quoteSectionId: section.id,
          productId: l.productId ?? null,
          sno: l.sno,
          description: l.description,
          mrp: l.mrp ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unit: l.unit,
          sortOrder: lineIndex,
          costPriceSnapshot: l.productId
            ? costMap.get(l.productId) ?? null
            : null,
        });
      }
    }

    if (data.termsClauseIds.length > 0) {
      const clauseRows = await tx
        .select()
        .from(termsClauses)
        .where(inArray(termsClauses.id, data.termsClauseIds));
      const orderById = new Map(
        data.termsClauseIds.map((id, idx) => [id, idx]),
      );
      const sorted = clauseRows.sort(
        (a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0),
      );
      for (const [idx, clause] of sorted.entries()) {
        await tx.insert(quoteTerms).values({
          quoteId: quoteId!,
          clauseId: clause.id,
          titleSnapshot: clause.title,
          bodySnapshot: clause.body,
          sortOrder: idx,
        });
      }
    }

    return { id: quoteId!, quoteNumber };
  });

  // Persist a (non-frozen) financials snapshot under the ROUGH tier.
  await db
    .insert(quoteTierFinancials)
    .values({
      quoteId: result.id,
      tierLabel: "ROUGH",
      discountPercent: data.discountPercent,
      revenuePreDiscount: financials.revenuePreDiscount.toFixed(2),
      discountAmount: financials.discountAmount.toFixed(2),
      revenuePostDiscount: financials.revenuePostDiscount.toFixed(2),
      gstAmount: financials.gstAmount.toFixed(2),
      totalInvoiceValue: financials.totalInvoiceValue.toFixed(2),
      costOfGoods: financials.costOfGoods.toFixed(2),
      grossMargin: financials.grossMargin.toFixed(2),
      grossMarginPercent: financials.grossMarginPercent.toFixed(2),
      isFrozen: false,
    })
    .onConflictDoUpdate({
      target: [quoteTierFinancials.quoteId, quoteTierFinancials.tierLabel],
      set: {
        discountPercent: data.discountPercent,
        revenuePreDiscount: financials.revenuePreDiscount.toFixed(2),
        discountAmount: financials.discountAmount.toFixed(2),
        revenuePostDiscount: financials.revenuePostDiscount.toFixed(2),
        gstAmount: financials.gstAmount.toFixed(2),
        totalInvoiceValue: financials.totalInvoiceValue.toFixed(2),
        costOfGoods: financials.costOfGoods.toFixed(2),
        grossMargin: financials.grossMargin.toFixed(2),
        grossMarginPercent: financials.grossMarginPercent.toFixed(2),
        computedAt: sql`NOW()`,
      },
    });

  // Touch totals for read in case caller wants to verify.
  void totals;

  await audit({
    actorId: actor.id,
    action: data.id ? "QUOTE_UPDATE" : "QUOTE_CREATE",
    entityType: "quote",
    entityId: result.id,
    metadata: {
      quoteNumber: result.quoteNumber,
      sectionsCount: data.sections.length,
      grandTotal: financials.totalInvoiceValue.toFixed(2),
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${result.id}`);
  return { ok: true, id: result.id, quoteNumber: result.quoteNumber };
}

export async function deleteDraftQuoteAction(formData: FormData): Promise<void> {
  const actor = await requireEmployeeOrAbove();
  const id = z.string().uuid().parse(formData.get("id"));
  const existing = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!existing || existing.status !== "DRAFT") {
    throw new Error("Only DRAFT quotes can be deleted.");
  }
  await db.delete(quotes).where(eq(quotes.id, id));
  await audit({
    actorId: actor.id,
    action: "QUOTE_DELETE",
    entityType: "quote",
    entityId: id,
    metadata: { quoteNumber: existing.quoteNumber },
  });
  revalidatePath("/quotes");
  redirect("/quotes");
}

export async function markQuoteStatusAction(
  formData: FormData,
): Promise<void> {
  const actor = await requireEmployeeOrAbove();
  const id = z.string().uuid().parse(formData.get("id"));
  const status = z
    .enum(["ACCEPTED", "REJECTED", "CANCELLED"])
    .parse(formData.get("status"));
  await db
    .update(quotes)
    .set({
      status,
      closedAt: new Date(),
      closedReason: status,
    })
    .where(eq(quotes.id, id));
  await audit({
    actorId: actor.id,
    action: `QUOTE_${status}`,
    entityType: "quote",
    entityId: id,
  });
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

const acceptSchema = z.object({
  id: z.string().uuid(),
  // GST-inclusive final negotiated total. Empty / null falls back to the
  // ROUGH-tier total from quote_tier_financials at read time.
  acceptedTotal: z
    .string()
    .trim()
    .refine((s) => s === "" || /^\d+(\.\d{1,2})?$/.test(s), {
      message: "Final total must be a positive number",
    })
    .optional(),
  acceptedNotes: z.string().trim().max(2000).optional(),
});

export type AcceptResult = { ok: true } | { ok: false; error: string };

export async function acceptQuoteAction(
  input: z.input<typeof acceptSchema>,
): Promise<AcceptResult> {
  const actor = await requireEmployeeOrAbove();
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { id, acceptedTotal, acceptedNotes } = parsed.data;

  const q = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!q) return { ok: false, error: "Quote not found" };
  if (q.status === "ACCEPTED" || q.status === "ADVANCE_PAID") {
    return { ok: false, error: "Quote is already accepted." };
  }

  await db
    .update(quotes)
    .set({
      status: "ACCEPTED",
      closedAt: new Date(),
      closedReason: "ACCEPTED",
      acceptedTotal: acceptedTotal && acceptedTotal !== "" ? acceptedTotal : null,
      acceptedNotes: acceptedNotes && acceptedNotes !== "" ? acceptedNotes : null,
    })
    .where(eq(quotes.id, id));

  await audit({
    actorId: actor.id,
    action: "QUOTE_ACCEPT",
    entityType: "quote",
    entityId: id,
    metadata: {
      acceptedTotal: acceptedTotal || null,
      hasNotes: !!acceptedNotes,
    },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
  revalidatePath("/payments");
  revalidatePath("/dashboard");
  return { ok: true };
}

/**
 * Duplicates a quote — copies sections + lines into a fresh DRAFT
 * quote with a new number. Same client by default; the user can swap
 * the client on the new draft. Useful when quoting the same setup to
 * a similar building (e.g. another 3BHK flat in the same tower).
 *
 * Skips: send history, payments, accepted_total, audit references.
 */
export async function duplicateQuoteAction(formData: FormData): Promise<void> {
  const actor = await requireEmployeeOrAbove();
  const sourceId = z.string().uuid().parse(formData.get("id"));

  const source = await db.query.quotes.findFirst({
    where: eq(quotes.id, sourceId),
  });
  if (!source) throw new Error("Source quote not found");

  const sourceSections = await db
    .select()
    .from(quoteSections)
    .where(eq(quoteSections.quoteId, source.id));
  const sourceLines = await db
    .select()
    .from(quoteLineItems)
    .where(
      inArray(
        quoteLineItems.quoteSectionId,
        sourceSections.map((s) => s.id),
      ),
    );
  const sourceTermsRows = await db
    .select()
    .from(quoteTerms)
    .where(eq(quoteTerms.quoteId, source.id));

  const newId = await db.transaction(async (tx) => {
    const now = new Date();
    const year = now.getFullYear();
    const r = await tx.execute<{ next_quote_number: string }>(
      sql`SELECT next_quote_number('BW', ${year}::int) AS next_quote_number`,
    );
    const quoteNumber = (r as unknown as { next_quote_number: string }[])[0]
      ?.next_quote_number;
    if (!quoteNumber) throw new Error("Could not allocate quote number");

    const [created] = await tx
      .insert(quotes)
      .values({
        quoteNumber,
        clientId: source.clientId,
        quoteType: "ROUGH",
        status: "DRAFT",
        roughDiscountPercent: source.roughDiscountPercent,
        validityDays: source.validityDays,
        issueDate: now.toISOString().slice(0, 10),
        createdBy: actor.id,
      })
      .returning({ id: quotes.id });

    // Copy sections and remap their IDs so we can rewire line items.
    const sectionIdMap = new Map<string, string>();
    for (const s of sourceSections) {
      const [newSection] = await tx
        .insert(quoteSections)
        .values({
          quoteId: created.id,
          sectionLetter: s.sectionLetter,
          title: s.title,
          gstRate: s.gstRate,
          sortOrder: s.sortOrder,
          isLabourStyle: s.isLabourStyle,
          appliesDiscount: s.appliesDiscount,
        })
        .returning({ id: quoteSections.id });
      sectionIdMap.set(s.id, newSection.id);
    }

    if (sourceLines.length > 0) {
      await tx.insert(quoteLineItems).values(
        sourceLines.map((l) => ({
          quoteSectionId: sectionIdMap.get(l.quoteSectionId)!,
          productId: l.productId,
          sno: l.sno,
          description: l.description,
          mrp: l.mrp,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unit: l.unit,
          sortOrder: l.sortOrder,
          costPriceSnapshot: l.costPriceSnapshot,
        })),
      );
    }

    if (sourceTermsRows.length > 0) {
      await tx.insert(quoteTerms).values(
        sourceTermsRows.map((t) => ({
          quoteId: created.id,
          clauseId: t.clauseId,
          titleSnapshot: t.titleSnapshot,
          bodySnapshot: t.bodySnapshot,
          sortOrder: t.sortOrder,
        })),
      );
    }

    return created.id;
  });

  await audit({
    actorId: actor.id,
    action: "QUOTE_DUPLICATE",
    entityType: "quote",
    entityId: newId,
    metadata: { sourceQuoteId: source.id, sourceQuoteNumber: source.quoteNumber },
  });

  revalidatePath("/quotes");
  redirect(`/quotes/${newId}`);
}

/**
 * Spawns a fresh draft quote linked to an accepted parent. Same client,
 * empty sections, ready for the user to add the new equipment. The
 * parent_quote_id link makes both quotes show up as a "project" on the
 * detail page and roll up into one outstanding balance.
 *
 * Redirects to the new draft on success — used as a form action so the
 * user lands directly on the addendum's edit page.
 */
export async function createAddendumAction(formData: FormData): Promise<void> {
  const actor = await requireEmployeeOrAbove();
  const parentId = z.string().uuid().parse(formData.get("parentId"));

  const parent = await db.query.quotes.findFirst({
    where: eq(quotes.id, parentId),
  });
  if (!parent) throw new Error("Parent quote not found");
  if (
    parent.status !== "ACCEPTED" &&
    parent.status !== "ADVANCE_PAID" &&
    parent.status !== "SENT" &&
    parent.status !== "NEGOTIATING"
  ) {
    throw new Error(
      "Addendums can only be added to live (sent or accepted) projects.",
    );
  }

  const settings = await db.query.companySettings.findFirst({
    where: eq(companySettings.id, 1),
  });
  const validityDays = settings?.defaultValidityDays ?? 15;
  const discountPercent = settings?.defaultRoughDiscountPercent ?? "5.00";

  const childId = await db.transaction(async (tx) => {
    const now = new Date();
    const year = now.getFullYear();
    const r = await tx.execute<{ next_quote_number: string }>(
      sql`SELECT next_quote_number('BW', ${year}::int) AS next_quote_number`,
    );
    const quoteNumber = (r as unknown as { next_quote_number: string }[])[0]
      ?.next_quote_number;
    if (!quoteNumber) throw new Error("Could not allocate quote number");

    const [child] = await tx
      .insert(quotes)
      .values({
        quoteNumber,
        clientId: parent.clientId,
        quoteType: "ROUGH",
        parentQuoteId: parent.id,
        status: "DRAFT",
        roughDiscountPercent: discountPercent,
        validityDays,
        issueDate: new Date().toISOString().slice(0, 10),
        createdBy: actor.id,
      })
      .returning({ id: quotes.id });
    return child.id;
  });

  await audit({
    actorId: actor.id,
    action: "QUOTE_ADDENDUM",
    entityType: "quote",
    entityId: childId,
    metadata: { parentQuoteId: parent.id, parentQuoteNumber: parent.quoteNumber },
  });

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${parentId}`);
  redirect(`/quotes/${childId}`);
}

// Used by the client-side combobox to fetch product detail when a user
// picks one from the autocomplete. Returns selling price, GST, MRP, unit,
// description, and both Astberg-DP and MRP-derived ex-GST rates so the
// quote builder can offer a per-line "Quoted at" toggle. Cost price is
// included only when caller is OWNER.
export async function fetchProductForLine(productId: string) {
  const me = await requireAuth();
  const product = await db.query.products.findFirst({
    where: eq(products.id, productId),
  });
  if (!product) return null;
  let costPrice: string | null = null;
  if (me.role === "OWNER") {
    const cost = await db.query.productCosts.findFirst({
      where: eq(productCosts.productId, productId),
    });
    costPrice = cost?.costPrice ?? null;
  }

  // defaultUnitPrice is already stored as an ex-GST rate per Astberg's
  // resale model (= DP for non-ERV, = MRP/1.18 for ERV). We also expose
  // the MRP-derived ex-GST rate so the line UI can switch between them.
  const dpRate = product.defaultUnitPrice;
  const mrpRate = product.mrp
    ? toMoney(new Decimal(product.mrp).div(new Decimal("1.18"))).toFixed(2)
    : null;
  // For ERV-style entries dpRate already equals mrpRate (within 1 paisa).
  // The UI uses this flag to hide the toggle when there's no real choice.
  const hasMrpUplift =
    mrpRate != null && Number(mrpRate) - Number(dpRate) > 0.5;

  // Prefer the consumer-facing one-liner from the subcategory map.
  // Falls back to the auto-built spec sheet only when we don't have
  // a canned line yet (e.g. legacy AST- products, a new subcategory).
  const friendlyDescription =
    defaultDescriptionFor(product.subcategory) ?? product.description;

  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: friendlyDescription,
    mrp: product.mrp,
    unitPrice: product.defaultUnitPrice,
    gstRate: product.defaultGstRate,
    unit: product.unit,
    costPrice,
    dpRate,
    mrpRate,
    hasMrpUplift,
  };
}

