"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { clients } from "@/db/schema";
import { requireEmployeeOrAbove, requireOwner } from "@/lib/auth/server";
import { deriveStateCode } from "@/lib/gst/state-codes";
import { audit } from "@/lib/audit/log";

// Indian phone: 10 digits, optional country code +91/91/0
const phoneSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(
        /^(\+?91[-\s]?|0)?[6-9]\d{9}$/,
        "Enter a valid Indian phone number",
      ),
  ])
  .transform((v) => (v === "" ? null : v));

// GSTIN: 15 chars alphanumeric per the standard format
const gstinSchema = z
  .union([
    z.literal(""),
    z
      .string()
      .trim()
      .regex(
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        "GSTIN must be 15 characters in the standard format",
      ),
  ])
  .transform((v) => (v === "" ? null : v));

const optionalText = (max: number) =>
  z
    .union([z.literal(""), z.string().trim().max(max)])
    .transform((v) => (v === "" ? null : v));

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  companyName: optionalText(200),
  email: z
    .union([z.literal(""), z.string().trim().email().max(200)])
    .transform((v) => (v === "" ? null : v)),
  phone: phoneSchema,
  addressLine1: optionalText(200),
  addressLine2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  pincode: optionalText(10),
  gstin: gstinSchema,
  notes: optionalText(2000),
});


export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    addressLine1: formData.get("addressLine1") ?? "",
    addressLine2: formData.get("addressLine2") ?? "",
    city: formData.get("city") ?? "",
    state: formData.get("state") ?? "",
    pincode: formData.get("pincode") ?? "",
    gstin: formData.get("gstin") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

export async function createClientAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireEmployeeOrAbove();
  const parsed = clientSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const [row] = await db
    .insert(clients)
    .values({
      ...parsed.data,
      stateCode: deriveStateCode(parsed.data.state),
      createdBy: actor.id,
    })
    .returning({ id: clients.id });
  await audit({
    actorId: actor.id,
    action: "CLIENT_CREATE",
    entityType: "client",
    entityId: row.id,
    metadata: { name: parsed.data.name, gstin: parsed.data.gstin ?? null },
  });
  revalidatePath("/clients");
  redirect(`/clients/${row.id}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const actor = await requireEmployeeOrAbove();
  const parsedId = z.string().uuid().safeParse(clientId);
  if (!parsedId.success) {
    return { ok: false, error: "Invalid client id." };
  }
  const parsed = clientSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  await db
    .update(clients)
    .set({
      ...parsed.data,
      stateCode: deriveStateCode(parsed.data.state),
    })
    .where(eq(clients.id, clientId));
  await audit({
    actorId: actor.id,
    action: "CLIENT_UPDATE",
    entityType: "client",
    entityId: clientId,
    metadata: { name: parsed.data.name },
  });
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, id: clientId };
}

export async function softDeleteClientAction(formData: FormData): Promise<void> {
  const actor = await requireOwner();
  const id = z.string().uuid().parse(formData.get("id"));
  await db
    .update(clients)
    .set({ deletedAt: new Date() })
    .where(eq(clients.id, id));
  await audit({
    actorId: actor.id,
    action: "CLIENT_SOFT_DELETE",
    entityType: "client",
    entityId: id,
    metadata: {},
  });
  revalidatePath("/clients");
  redirect("/clients");
}
