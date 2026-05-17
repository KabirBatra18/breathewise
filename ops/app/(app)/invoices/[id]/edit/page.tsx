import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoiceLines, invoices, products, quotes } from "@/db/schema";
import { requireEmployeeOrAbove } from "@/lib/auth/server";
import { Breadcrumbs } from "@/components/ui/breadcrumb";
import {
  InvoiceEditor,
  type EditorLine,
  type EditorInvoice,
} from "@/components/invoices/invoice-editor";
import type { ProductOption } from "@/components/quotes/product-picker";

export const metadata = { title: "Edit invoice" };

/**
 * Editor page for a DRAFT invoice. ISSUED invoices redirect to the
 * read-only detail page — legal documents can't be edited.
 */
export default async function EditInvoicePage({
  params,
}: {
  params: { id: string };
}) {
  await requireEmployeeOrAbove();

  const invRows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.id));
  const inv = invRows[0];
  if (!inv) notFound();

  // Legal documents are immutable — bounce to the detail view.
  if (inv.status === "ISSUED") {
    redirect(`/invoices/${inv.id}`);
  }

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, inv.id))
    .orderBy(asc(invoiceLines.sortOrder));

  // Catalog for the "Add from catalog" dialog. Same shape the quote
  // builder uses — ProductPicker filters/groups it client-side.
  const productRows = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      category: products.category,
      subcategory: products.subcategory,
      mrp: products.mrp,
    })
    .from(products)
    .where(and(isNull(products.deletedAt), eq(products.isActive, true)))
    .orderBy(asc(products.name));
  const productOptions: ProductOption[] = productRows.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    mrp: p.mrp,
  }));

  // Source quote — pulled for the breadcrumb so the user can navigate
  // back to the PI if they need to cross-check.
  const srcRows = await db
    .select({ id: quotes.id, quoteNumber: quotes.quoteNumber })
    .from(quotes)
    .where(eq(quotes.id, inv.quoteId));
  const src = srcRows[0];

  const editorInvoice: EditorInvoice = {
    id: inv.id,
    status: inv.status,
    issueDate: inv.issueDate as unknown as string,
    dateOfRemoval: (inv.dateOfRemoval as unknown as string | null) ?? null,
    reverseCharge: inv.reverseCharge,
    includeLabour: inv.includeLabour,
    notes: inv.notes,
    placeOfSupply: inv.placeOfSupply,
    placeOfSupplyCode: inv.placeOfSupplyCode,
    isInterState: inv.isInterState,
    supplierState: inv.supplierState,
    buyerName: inv.buyerName,
    buyerCompany: inv.buyerCompany,
    deliveryAddress: inv.deliveryAddress,
    deliveryState: inv.deliveryState,
    sourceQuoteNumber: src?.quoteNumber ?? null,
  };

  const editorLines: EditorLine[] = lines.map((l) => ({
    id: l.id,
    sno: l.sno,
    sectionLetter: l.sectionLetter,
    sectionTitle: l.sectionTitle,
    isLabourStyle: l.isLabourStyle,
    skuSnapshot: l.skuSnapshot,
    description: l.description,
    hsnCode: l.hsnCode,
    quantity: l.quantity,
    unit: l.unit,
    unitPrice: l.unitPrice,
    gstRate: l.gstRate,
    taxableValue: l.taxableValue,
    cgstAmount: l.cgstAmount,
    sgstAmount: l.sgstAmount,
    igstAmount: l.igstAmount,
    lineTotal: l.lineTotal,
  }));

  return (
    <div className="space-y-6 p-8">
      <Breadcrumbs
        items={[
          { label: "Invoices", href: "/invoices" },
          {
            label: src?.quoteNumber
              ? `Draft from ${src.quoteNumber}`
              : "Draft",
            href: `/invoices/${inv.id}`,
          },
          { label: "Edit" },
        ]}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Edit draft invoice
          </h1>
          <p className="text-sm text-muted-foreground">
            Add or remove line items, tweak quantities and prices, then click
            Finalize to issue. The source quote is untouched.
          </p>
        </div>
      </div>

      <InvoiceEditor
        invoice={editorInvoice}
        initialLines={editorLines}
        products={productOptions}
      />
    </div>
  );
}
