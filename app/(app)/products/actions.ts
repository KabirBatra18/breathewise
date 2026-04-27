"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { productCosts, products } from "@/db/schema";
import { requireEmployeeOrAbove, requireOwner } from "@/lib/auth/server";
import { PRODUCT_CATEGORIES } from "@/lib/constants";

const categoryEnum = z.enum(
  PRODUCT_CATEGORIES.map((c) => c.value) as [string, ...string[]],
);

const moneyOptional = z
  .union([z.literal(""), z.coerce.number().nonnegative()])
  .transform((v) => (v === "" ? null : v.toFixed(2)));
const moneyRequired = z.coerce
  .number()
  .nonnegative()
  .transform((v) => v.toFixed(2));
const percentRequired = z.coerce
  .number()
  .min(0)
  .max(100)
  .transform((v) => v.toFixed(2));

const productSchema = z.object({
  sku: z
    .union([z.literal(""), z.string().trim().min(1).max(64)])
    .transform((v) => (v === "" ? null : v)),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  category: categoryEnum,
  mrp: moneyOptional,
  defaultUnitPrice: moneyRequired,
  defaultGstRate: percentRequired,
  unit: z.string().trim().min(1).max(20),
  isActive: z
    .union([z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
    .transform((v) => v === "on" || v === "true"),
});

const costSchema = z.object({
  costPrice: z
    .union([z.literal(""), z.coerce.number().nonnegative()])
    .transform((v) => (v === "" ? null : v.toFixed(2))),
  supplier: z
    .union([z.literal(""), z.string().trim().max(200)])
    .transform((v) => (v === "" ? null : v)),
  costNotes: z
    .union([z.literal(""), z.string().trim().max(1000)])
    .transform((v) => (v === "" ? null : v)),
});

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function readForm(formData: FormData) {
  return {
    sku: formData.get("sku"),
    name: formData.get("name"),
    description: formData.get("description"),
    category: formData.get("category"),
    mrp: formData.get("mrp") ?? "",
    defaultUnitPrice: formData.get("defaultUnitPrice"),
    defaultGstRate: formData.get("defaultGstRate") ?? "18",
    unit: formData.get("unit") ?? "pcs",
    isActive: formData.get("isActive") ?? "false",
  };
}

function readCostForm(formData: FormData) {
  return {
    costPrice: formData.get("costPrice") ?? "",
    supplier: formData.get("supplier") ?? "",
    costNotes: formData.get("costNotes") ?? "",
  };
}

export async function createProductAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();

  const parsed = productSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const cost = costSchema.safeParse(readCostForm(formData));
  if (!cost.success) {
    return { ok: false, error: cost.error.issues[0]?.message ?? "Invalid cost" };
  }

  if (parsed.data.sku) {
    const existing = await db.query.products.findFirst({
      where: eq(products.sku, parsed.data.sku),
    });
    if (existing) return { ok: false, error: "SKU already exists." };
  }

  const newId = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(products)
      .values({
        sku: parsed.data.sku,
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        mrp: parsed.data.mrp,
        defaultUnitPrice: parsed.data.defaultUnitPrice,
        defaultGstRate: parsed.data.defaultGstRate,
        unit: parsed.data.unit,
        isActive: parsed.data.isActive,
      })
      .returning({ id: products.id });

    if (cost.data.costPrice !== null) {
      await tx.insert(productCosts).values({
        productId: row.id,
        costPrice: cost.data.costPrice,
        supplier: cost.data.supplier,
        notes: cost.data.costNotes,
        updatedBy: actor.id,
      });
    }
    return row.id;
  });

  revalidatePath("/products");
  redirect(`/products/${newId}`);
}

export async function updateProductAction(
  productId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();

  const parsed = productSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const cost = costSchema.safeParse(readCostForm(formData));
  if (!cost.success) {
    return { ok: false, error: cost.error.issues[0]?.message ?? "Invalid cost" };
  }

  if (parsed.data.sku) {
    const existing = await db.query.products.findFirst({
      where: eq(products.sku, parsed.data.sku),
    });
    if (existing && existing.id !== productId) {
      return { ok: false, error: "SKU already exists on another product." };
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(products)
      .set({
        sku: parsed.data.sku,
        name: parsed.data.name,
        description: parsed.data.description,
        category: parsed.data.category,
        mrp: parsed.data.mrp,
        defaultUnitPrice: parsed.data.defaultUnitPrice,
        defaultGstRate: parsed.data.defaultGstRate,
        unit: parsed.data.unit,
        isActive: parsed.data.isActive,
      })
      .where(eq(products.id, productId));

    if (cost.data.costPrice !== null) {
      await tx
        .insert(productCosts)
        .values({
          productId,
          costPrice: cost.data.costPrice,
          supplier: cost.data.supplier,
          notes: cost.data.costNotes,
          updatedBy: actor.id,
        })
        .onConflictDoUpdate({
          target: productCosts.productId,
          set: {
            costPrice: cost.data.costPrice,
            supplier: cost.data.supplier,
            notes: cost.data.costNotes,
            updatedBy: actor.id,
            updatedAt: sql`NOW()`,
          },
        });
    } else {
      await tx.delete(productCosts).where(eq(productCosts.productId, productId));
    }
  });

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  return { ok: true, id: productId };
}

export async function softDeleteProductAction(formData: FormData): Promise<void> {
  await requireOwner();
  const id = z.string().uuid().parse(formData.get("id"));
  await db
    .update(products)
    .set({ deletedAt: new Date(), isActive: false })
    .where(eq(products.id, id));
  revalidatePath("/products");
  redirect("/products");
}

export async function toggleProductActiveAction(formData: FormData): Promise<void> {
  await requireEmployeeOrAbove();
  const id = z.string().uuid().parse(formData.get("id"));
  const row = await db.query.products.findFirst({ where: eq(products.id, id) });
  if (!row) return;
  await db
    .update(products)
    .set({ isActive: !row.isActive })
    .where(eq(products.id, id));
  revalidatePath("/products");
}
