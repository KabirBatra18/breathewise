import { NextResponse } from "next/server";
import { format } from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients, quotes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { fillTemplate, type OverlayField } from "@/lib/pdf-templates/overlay";

/**
 * Project Services Agreement — pdf-lib overlay on the source template.
 *
 * The template (lib/pdf-templates/services-agreement.pdf) is the
 * original document, byte-for-byte. We draw typed text on top of the
 * blank underscore lines for: Date of Agreement, Quotation No., Client
 * Name, Client Address, Project Site Address, and the Service Provider
 * signature block (Name / Designation / Date / Place — always the same
 * for the proprietor). Client-side fields stay blank for ink.
 *
 * Coordinates were extracted with scripts/inspect-pdf-positions.ts.
 */

function joinAddress(c: typeof clients.$inferSelect): string {
  return [c.addressLine1, c.addressLine2, c.city, c.state, c.pincode]
    .filter((s) => s && s.trim() !== "")
    .join(", ");
}

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await requireAuth();

  const qRows = await db.select().from(quotes).where(eq(quotes.id, params.id));
  const q = qRows[0];
  if (!q) return NextResponse.json({ error: "Quote not found" }, { status: 404 });

  const cRows = await db.select().from(clients).where(eq(clients.id, q.clientId));
  const c = cRows[0];
  if (!c) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Fall back to client address when no separate site address is set.
  const clientAddress = joinAddress(c);
  const siteAddress =
    (q.projectSiteAddress && q.projectSiteAddress.trim()) || clientAddress;

  const agreementDate = q.agreementSignedDate
    ? format(new Date(`${q.agreementSignedDate as unknown as string}T00:00:00`), "d MMMM yyyy")
    : format(new Date(), "d MMMM yyyy");

  const today = format(new Date(), "d MMMM yyyy");
  const clientName = c.companyName
    ? `${c.name} · ${c.companyName}`
    : c.name;

  // Field positions (page index 0 = first page). y is the text baseline.
  // Max widths are the underscore-line lengths minus a 5pt safety margin.
  const fields: OverlayField[] = [
    // Header block — page 1
    { page: 0, x: 156,   y: 632.5, text: agreementDate,           maxWidth: 380 },
    { page: 0, x: 56,    y: 604.3, text: q.quoteNumber,           maxWidth: 480 },
    { page: 0, x: 124,   y: 515.0, text: clientName,              maxWidth: 410 },
    { page: 0, x: 137,   y: 498.9, text: clientAddress,           maxWidth: 395 },
    { page: 0, x: 166,   y: 482.8, text: siteAddress,             maxWidth: 365 },

    // Signature block — Service Provider side, page 5 (index 4)
    // x ≈ 59.1 is the left edge of the labels. Text starts after the
    // colon-space of each label.
    { page: 4, x: 92,    y: 197.7, text: "Kabir Batra",           maxWidth: 200 },
    { page: 4, x: 121,   y: 183.2, text: "Proprietor",            maxWidth: 200 },
    { page: 4, x: 86,    y: 168.7, text: today,                   maxWidth: 200 },
    { page: 4, x: 90,    y: 154.2, text: "New Delhi",             maxWidth: 200 },

    // Client side party name (printed above the signature block)
    { page: 4, x: 296.6, y: 250.2, text: clientName,              maxWidth: 220 },
  ];

  const bytes = await fillTemplate("services-agreement", fields);

  const safeNumber = q.quoteNumber.replace(/\//g, "-");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNumber}-services-agreement.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
