import { NextResponse } from "next/server";
import { format } from "date-fns";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients, invoiceLines, invoices, quotes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { fillTemplate, type OverlayField } from "@/lib/pdf-templates/overlay";

/**
 * Completion & Handover Certificate — pdf-lib overlay on the source
 * template (lib/pdf-templates/handover-certificate.pdf).
 *
 * Fills the Project Details table from the invoice + quote + client,
 * and the Equipment Installed table from the invoice lines (non-labour
 * rows only — labour/engineering charges aren't physical equipment).
 * Location and Serial No columns stay blank per the user's call (we
 * don't track those today).
 *
 * Issued invoices only — drafts have no allocated number yet, and a
 * handover cert before issuance doesn't make sense.
 */

function joinAddress(c: typeof clients.$inferSelect): string {
  return [c.addressLine1, c.addressLine2, c.city, c.state, c.pincode]
    .filter((s) => s && s.trim() !== "")
    .join(", ");
}

function clientContact(c: typeof clients.$inferSelect): string {
  return [c.phone, c.email].filter((s) => s && s.trim() !== "").join(" · ");
}

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await requireAuth();

  const invRows = await db.select().from(invoices).where(eq(invoices.id, params.id));
  const inv = invRows[0];
  if (!inv) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (inv.status === "DRAFT") {
    return NextResponse.json(
      {
        error:
          "Finalize this invoice first — the Handover Certificate cross-references an issued invoice number.",
      },
      { status: 409 },
    );
  }

  const [cRows, qRows, lines] = await Promise.all([
    db.select().from(clients).where(eq(clients.id, inv.clientId)),
    db.select().from(quotes).where(eq(quotes.id, inv.quoteId)),
    db
      .select()
      .from(invoiceLines)
      .where(eq(invoiceLines.invoiceId, inv.id))
      .orderBy(asc(invoiceLines.sortOrder)),
  ]);
  const c = cRows[0];
  const q = qRows[0];
  if (!c || !q) {
    return NextResponse.json({ error: "Client or quote missing" }, { status: 404 });
  }

  const clientAddress = joinAddress(c);
  const siteAddress =
    (q.projectSiteAddress && q.projectSiteAddress.trim()) || clientAddress;
  const clientName = c.companyName ? `${c.name} · ${c.companyName}` : c.name;
  const contact = clientContact(c);
  const today = format(new Date(), "d MMMM yyyy");
  const agreementDate = q.agreementSignedDate
    ? format(
        new Date(`${q.agreementSignedDate as unknown as string}T00:00:00`),
        "d MMMM yyyy",
      )
    : "";

  // Equipment rows from invoice lines (skip labour-style charges, they
  // aren't physical equipment). Cap at 6 to match the template's table
  // size — overflow is handled by the existing template note: "Add
  // additional rows as required. Attach a separate equipment schedule
  // if the list is extensive."
  const equipmentLines = lines.filter((l) => !l.isLabourStyle).slice(0, 6);

  // Header table — right column starts ~x=195 (table column boundary).
  // Y values are the baselines of the left-column labels.
  const headerFields: OverlayField[] = [
    { page: 0, x: 195, y: 546.8, text: today,                       maxWidth: 340 },
    { page: 0, x: 195, y: 519.0, text: inv.invoiceNumber ?? "",     maxWidth: 340 },
    { page: 0, x: 195, y: 491.3, text: agreementDate,               maxWidth: 340 },
    { page: 0, x: 195, y: 469.3, text: clientName,                  maxWidth: 340 },
    { page: 0, x: 195, y: 447.3, text: contact,                     maxWidth: 340 },
    { page: 0, x: 195, y: 425.3, text: siteAddress,                 maxWidth: 340 },
    // Date Installation Commenced / Completed intentionally left
    // blank — not tracked today.
  ];

  // Equipment table — rows 1..6 at baselines y = 256.4, 234.4, ...,
  // 146.4 (Δ = 22). Equipment Model column starts at x ≈ 100; Qty
  // column right-aligned around x ≈ 250. We left-align Qty for
  // simplicity (the template's "Qty" header sits at x=243.5).
  const equipmentFields: OverlayField[] = [];
  const rowYs = [256.4, 234.4, 212.4, 190.4, 168.4, 146.4];
  equipmentLines.forEach((l, i) => {
    const y = rowYs[i];
    if (y === undefined) return;
    // Equipment Model column is ~141pt wide. SKU alone keeps the cell
    // legible; full descriptions belong on the invoice. When there's
    // no SKU snapshot (custom lines) fall back to the description and
    // let the overlay helper truncate with an ellipsis if needed.
    const model = l.skuSnapshot ?? l.description;
    const qty = `${Number(l.quantity)} ${l.unit}`;
    equipmentFields.push(
      { page: 0, x: 100, y, text: model, maxWidth: 135, fontSize: 10 },
      { page: 0, x: 245, y, text: qty,   maxWidth: 30,  fontSize: 10 },
    );
  });

  // Signature block — page 3 (index 2).
  // Client side: print the client name above the signature box; rest
  // is blank for ink. Service Provider side: pre-fill the standard
  // name / date / place (Kabir / today / New Delhi).
  const sigFields: OverlayField[] = [
    { page: 2, x: 59.1,  y: 559.3, text: clientName,      maxWidth: 230 },
    { page: 2, x: 331,   y: 506.8, text: "Kabir Batra",   maxWidth: 200 },
    { page: 2, x: 326,   y: 492.3, text: today,           maxWidth: 200 },
    { page: 2, x: 329,   y: 477.8, text: "New Delhi",     maxWidth: 200 },
  ];

  const bytes = await fillTemplate("handover-certificate", [
    ...headerFields,
    ...equipmentFields,
    ...sigFields,
  ]);

  const safeNumber = (inv.invoiceNumber ?? "DRAFT").replace(/\//g, "-");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeNumber}-handover-certificate.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
