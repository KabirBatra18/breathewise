"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { verticals } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { audit } from "@/lib/audit/log";
import { VERTICAL_IDS } from "@/lib/verticals/constants";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ─── Slug must be URL-safe + stable since it's used in archive
// folder paths and integration URLs ────────────────────────────────
const SLUG_RE = /^[a-z0-9_]{2,40}$/;
// Hex color with leading #.
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const baseSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(120).optional(),
  brandColor: z.string().trim().regex(COLOR_RE, "Use #RRGGBB hex").optional(),
  whatsappSignature: z.string().trim().min(1).max(200),
  emailFromName: z.string().trim().min(1).max(80),
  websiteUrl: z.string().trim().url().max(200).optional().or(z.literal("")),
  displayOrder: z.coerce.number().int().min(0).max(999).default(0),
});

const createSchema = baseSchema.extend({
  slug: z.string().trim().regex(SLUG_RE, "2-40 chars, lowercase letters/digits/underscore"),
});

const updateSchema = baseSchema.extend({
  id: z.string().uuid(),
});

function clean<T extends Record<string, unknown>>(input: T): T {
  // Coerce empty-string optionals to NULL so the DB stores absence
  // rather than blank strings, which matters for downstream "is this
  // set?" checks (tagline fallback to settings, websiteUrl link guards).
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = v === "" ? null : v;
  }
  return out as T;
}

export async function createVerticalAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = createSchema.safeParse({
    slug: formData.get("slug"),
    brandName: formData.get("brandName"),
    tagline: formData.get("tagline") || undefined,
    brandColor: formData.get("brandColor") || undefined,
    whatsappSignature: formData.get("whatsappSignature"),
    emailFromName: formData.get("emailFromName"),
    websiteUrl: formData.get("websiteUrl") || undefined,
    displayOrder: formData.get("displayOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = clean(parsed.data);

  const existing = await db.query.verticals.findFirst({
    where: eq(verticals.slug, parsed.data.slug),
  });
  if (existing) return { ok: false, error: "A vertical with this slug already exists." };

  const inserted = await db
    .insert(verticals)
    .values({
      id: sql`gen_random_uuid()`,
      slug: data.slug,
      brandName: data.brandName,
      tagline: data.tagline ?? null,
      brandColor: data.brandColor ?? null,
      whatsappSignature: data.whatsappSignature,
      emailFromName: data.emailFromName,
      websiteUrl: data.websiteUrl ?? null,
      displayOrder: data.displayOrder,
      isActive: true,
    })
    .returning({ id: verticals.id });

  await audit({
    actorId: actor.id,
    action: "VERTICAL_CREATE",
    entityType: "vertical",
    entityId: inserted[0]?.id ?? null,
    metadata: { slug: data.slug, brandName: data.brandName },
  });
  revalidatePath("/settings/verticals");
  return { ok: true };
}

export async function updateVerticalAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireOwner();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    brandName: formData.get("brandName"),
    tagline: formData.get("tagline") || undefined,
    brandColor: formData.get("brandColor") || undefined,
    whatsappSignature: formData.get("whatsappSignature"),
    emailFromName: formData.get("emailFromName"),
    websiteUrl: formData.get("websiteUrl") || undefined,
    displayOrder: formData.get("displayOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = clean(parsed.data);

  const target = await db.query.verticals.findFirst({
    where: eq(verticals.id, data.id),
  });
  if (!target) return { ok: false, error: "Vertical not found." };

  await db
    .update(verticals)
    .set({
      brandName: data.brandName,
      tagline: data.tagline ?? null,
      brandColor: data.brandColor ?? null,
      whatsappSignature: data.whatsappSignature,
      emailFromName: data.emailFromName,
      websiteUrl: data.websiteUrl ?? null,
      displayOrder: data.displayOrder,
    })
    .where(eq(verticals.id, data.id));

  await audit({
    actorId: actor.id,
    action: "VERTICAL_UPDATE",
    entityType: "vertical",
    entityId: data.id,
    metadata: { slug: target.slug },
  });
  revalidatePath("/settings/verticals");
  return { ok: true };
}

export async function toggleVerticalActiveAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = z.string().uuid().parse(formData.get("id"));

  // The two seed verticals (BreatheWise, UTHS Security) are special — they're
  // referenced by historical rows as the backfill defaults. Deactivating
  // them only hides them from the picker on NEW quotes; existing quotes
  // continue to render with their original branding (they reference by
  // FK and the row still exists). Safe to allow toggling.
  void VERTICAL_IDS;

  const target = await db.query.verticals.findFirst({ where: eq(verticals.id, id) });
  if (!target) return;
  const nextActive = !target.isActive;
  await db.update(verticals).set({ isActive: nextActive }).where(eq(verticals.id, id));
  await audit({
    actorId: actor.id,
    action: nextActive ? "VERTICAL_REACTIVATE" : "VERTICAL_DEACTIVATE",
    entityType: "vertical",
    entityId: id,
    metadata: { slug: target.slug },
  });
  revalidatePath("/settings/verticals");
}
