"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { clients } from "@/db/schema";
import { requireEmployeeOrAbove, requireOwner } from "@/lib/auth/server";

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

/**
 * Map free-text state names to the standard CBIC 2-digit GST state
 * codes. Used to auto-populate clients.state_code so the user never
 * has to memorise codes — they just type "Delhi" and we record "07".
 * Returns null for unrecognised names; the invoice-conversion dialog
 * surfaces those and points the user back here.
 */
function deriveStateCode(state: string | null): string | null {
  if (!state) return null;
  const k = state.trim().toLowerCase();
  const map: Record<string, string> = {
    "jammu and kashmir": "01",
    "himachal pradesh": "02",
    "punjab": "03",
    "chandigarh": "04",
    "uttarakhand": "05",
    "haryana": "06",
    "delhi": "07",
    "rajasthan": "08",
    "uttar pradesh": "09",
    "bihar": "10",
    "sikkim": "11",
    "arunachal pradesh": "12",
    "nagaland": "13",
    "manipur": "14",
    "mizoram": "15",
    "tripura": "16",
    "meghalaya": "17",
    "assam": "18",
    "west bengal": "19",
    "jharkhand": "20",
    "odisha": "21",
    "chhattisgarh": "22",
    "madhya pradesh": "23",
    "gujarat": "24",
    "dadra and nagar haveli and daman and diu": "26",
    "maharashtra": "27",
    "karnataka": "29",
    "goa": "30",
    "lakshadweep": "31",
    "kerala": "32",
    "tamil nadu": "33",
    "puducherry": "34",
    "andaman and nicobar islands": "35",
    "telangana": "36",
    "andhra pradesh": "37",
    "ladakh": "38",
  };
  return map[k] ?? null;
}

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
  revalidatePath("/clients");
  redirect(`/clients/${row.id}`);
}

export async function updateClientAction(
  clientId: string,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireEmployeeOrAbove();
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
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  return { ok: true, id: clientId };
}

export async function softDeleteClientAction(formData: FormData): Promise<void> {
  await requireOwner();
  const id = z.string().uuid().parse(formData.get("id"));
  await db
    .update(clients)
    .set({ deletedAt: new Date() })
    .where(eq(clients.id, id));
  revalidatePath("/clients");
  redirect("/clients");
}
