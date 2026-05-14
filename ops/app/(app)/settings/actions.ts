"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { companySettings } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";

const schema = z.object({
  legalName: z.string().trim().min(1).max(200),
  brandName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().min(1).max(200),
  address: z.string().trim().max(500).nullable(),
  phone: z.string().trim().max(40).nullable(),
  email: z.string().trim().max(120).nullable(),
  gstin: z
    .string()
    .trim()
    .nullable()
    .refine(
      (v) =>
        v == null ||
        v === "" ||
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v),
      "GSTIN must be 15 chars in the standard Indian format.",
    ),
  // Tax-invoice fields (added in 0006).
  state: z.string().trim().max(80).nullable(),
  stateCode: z
    .string()
    .trim()
    .nullable()
    .refine(
      (v) => v == null || v === "" || /^[0-9]{2}$/.test(v),
      "State code is 2 digits (e.g. 07 for Delhi).",
    ),
  pan: z
    .string()
    .trim()
    .nullable()
    .refine(
      (v) => v == null || v === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v),
      "PAN must be 10 chars in the standard format (e.g. ABCDE1234F).",
    ),
  bankName: z.string().trim().max(120).nullable(),
  bankAccount: z.string().trim().max(40).nullable(),
  bankIfsc: z
    .string()
    .trim()
    .nullable()
    .refine(
      (v) => v == null || v === "" || /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v),
      "IFSC must be 11 chars (e.g. HDFC0001234).",
    ),
  bankBranch: z.string().trim().max(120).nullable(),
  defaultRoughDiscountPercent: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Discount % must be 0–100"),
  defaultValidityDays: z.coerce.number().int().min(1).max(365),
  quoteNumberPrefix: z.string().trim().min(1).max(8),
});

export type SaveSettingsResult = { ok: true } | { ok: false; error: string };

export async function saveSettingsAction(
  input: z.input<typeof schema>,
): Promise<SaveSettingsResult> {
  const actor = await requireOwner();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  const data = parsed.data;
  await db
    .update(companySettings)
    .set({
      legalName: data.legalName,
      brandName: data.brandName,
      tagline: data.tagline,
      address: data.address || null,
      phone: data.phone || null,
      email: data.email || null,
      gstin: data.gstin || null,
      state: data.state || null,
      stateCode: data.stateCode || null,
      pan: data.pan || null,
      bankName: data.bankName || null,
      bankAccount: data.bankAccount || null,
      bankIfsc: data.bankIfsc || null,
      bankBranch: data.bankBranch || null,
      defaultRoughDiscountPercent: data.defaultRoughDiscountPercent,
      defaultValidityDays: data.defaultValidityDays,
      quoteNumberPrefix: data.quoteNumberPrefix,
      updatedAt: new Date(),
    })
    .where(eq(companySettings.id, 1));

  await audit({
    actorId: actor.id,
    action: "SETTINGS_SAVE",
    entityType: "settings",
    entityId: null,
    metadata: {
      defaultRoughDiscountPercent: data.defaultRoughDiscountPercent,
      defaultValidityDays: data.defaultValidityDays,
      hasGstin: !!data.gstin,
    },
  });

  revalidatePath("/settings");
  // Affects PDF / quote builder defaults globally.
  revalidatePath("/quotes/new");
  revalidatePath("/dashboard");
  return { ok: true };
}
