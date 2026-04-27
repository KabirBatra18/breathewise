"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import {
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
  computeQuoteTotals,
  computeFinancials,
  type SectionInput,
} from "@/lib/pricing";

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
      .where(
        productIds.length === 1
          ? eq(productCosts.productId, productIds[0]!)
          : sql`${productCosts.productId} = ANY(${productIds}::uuid[])`,
      );
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
        .where(
          sql`${termsClauses.id} = ANY(${data.termsClauseIds}::uuid[])`,
        );
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

  revalidatePath("/quotes");
  revalidatePath(`/quotes/${result.id}`);
  return { ok: true, id: result.id, quoteNumber: result.quoteNumber };
}

export async function deleteDraftQuoteAction(formData: FormData): Promise<void> {
  await requireEmployeeOrAbove();
  const id = z.string().uuid().parse(formData.get("id"));
  const existing = await db.query.quotes.findFirst({ where: eq(quotes.id, id) });
  if (!existing || existing.status !== "DRAFT") {
    throw new Error("Only DRAFT quotes can be deleted.");
  }
  await db.delete(quotes).where(eq(quotes.id, id));
  revalidatePath("/quotes");
  redirect("/quotes");
}

export async function markQuoteStatusAction(
  formData: FormData,
): Promise<void> {
  await requireEmployeeOrAbove();
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
  revalidatePath("/quotes");
  revalidatePath(`/quotes/${id}`);
}

// Used by the client-side combobox to fetch product detail when a user
// picks one from the autocomplete. Returns selling price, GST, MRP, unit,
// description. Cost price is included only when caller is OWNER.
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
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    mrp: product.mrp,
    unitPrice: product.defaultUnitPrice,
    gstRate: product.defaultGstRate,
    unit: product.unit,
    costPrice,
  };
}

