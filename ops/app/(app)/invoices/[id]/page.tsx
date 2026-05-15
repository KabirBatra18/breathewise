import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { invoiceLines, invoices, quotes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import {
  InvoiceStatusBadge,
  ToneBadge,
} from "@/components/ui/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Decimal } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";
import { amountInWords } from "@/lib/pricing/words";

export const metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAuth();

  const rows = await db.select().from(invoices).where(eq(invoices.id, params.id));
  const inv = rows[0];
  if (!inv) notFound();

  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, inv.id))
    .orderBy(asc(invoiceLines.sortOrder));

  const srcRows = await db
    .select({ id: quotes.id, quoteNumber: quotes.quoteNumber })
    .from(quotes)
    .where(eq(quotes.id, inv.quoteId));
  const src = srcRows[0];
  const isDraft = inv.status === "DRAFT";

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/invoices"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to invoices
          </Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight font-mono">
            {inv.invoiceNumber ?? "Untitled DRAFT"}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <InvoiceStatusBadge status={inv.status} />
            {isDraft ? (
              <span>— editable, no legal status yet</span>
            ) : (
              <>
                <span>
                  Issued {inv.issueDate as unknown as string} · Place of supply{" "}
                  {inv.placeOfSupply} ({inv.placeOfSupplyCode})
                </span>
                <ToneBadge tone={inv.isInterState ? "violet" : "sky"}>
                  {inv.isInterState ? "Inter-state (IGST)" : "Intra-state (CGST + SGST)"}
                </ToneBadge>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft ? (
            <Button
              size="sm"
              render={<Link href={`/invoices/${inv.id}/edit`} />}
            >
              Edit draft
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              render={
                <a
                  href={`/api/invoices/${inv.id}/pdf`}
                  target="_blank"
                  rel="noopener"
                />
              }
            >
              <Download className="h-4 w-4" />
              Download PDF
            </Button>
          )}
          {src ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/quotes/${src.id}`} />}
            >
              View source quote ({src.quoteNumber})
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Supplier</CardDescription>
            <CardTitle>{inv.supplierLegalName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {inv.supplierAddress ? <p>{inv.supplierAddress}</p> : null}
            <p>
              State: <strong>{inv.supplierState}</strong>{" "}
              <span className="text-muted-foreground">
                ({inv.supplierStateCode})
              </span>
            </p>
            {inv.supplierGstin ? (
              <p>
                GSTIN: <span className="font-mono">{inv.supplierGstin}</span>
              </p>
            ) : null}
            {inv.supplierPan ? <p>PAN: {inv.supplierPan}</p> : null}
            {inv.supplierPhone ? <p>Phone: {inv.supplierPhone}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription>
              {inv.deliveryAddress || inv.deliveryState
                ? "Bill To"
                : "Recipient"}
            </CardDescription>
            <CardTitle>
              {inv.buyerName}
              {inv.buyerCompany ? ` · ${inv.buyerCompany}` : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {inv.buyerAddress ? <p>{inv.buyerAddress}</p> : null}
            <p>
              State: <strong>{inv.buyerState ?? "—"}</strong>
              {inv.buyerStateCode ? (
                <span className="text-muted-foreground">
                  {" "}({inv.buyerStateCode})
                </span>
              ) : null}
            </p>
            <p>
              GSTIN:{" "}
              {inv.buyerGstin ? (
                <span className="font-mono">{inv.buyerGstin}</span>
              ) : (
                <span className="text-muted-foreground">Unregistered</span>
              )}
            </p>
            {inv.buyerPhone ? <p>Phone: {inv.buyerPhone}</p> : null}
          </CardContent>
        </Card>
      </div>

      {inv.deliveryAddress || inv.deliveryState ? (
        <Card>
          <CardHeader>
            <CardDescription>Place of delivery</CardDescription>
            <CardTitle>Ship To</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {inv.deliveryAddress ? <p>{inv.deliveryAddress}</p> : null}
            {inv.deliveryState ? (
              <p>
                State: <strong>{inv.deliveryState}</strong>
                {inv.deliveryStateCode ? (
                  <span className="text-muted-foreground">
                    {" "}({inv.deliveryStateCode})
                  </span>
                ) : null}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Place of supply uses this state, which is what determines
              CGST+SGST vs IGST on this invoice.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <CardDescription>
            Reverse charge: {inv.reverseCharge ? "Yes" : "No"} · Labour
            included: {inv.includeLabour ? "Yes" : "No"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">SNo</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Taxable</TableHead>
                {inv.isInterState ? (
                  <TableHead className="text-right">IGST</TableHead>
                ) : (
                  <>
                    <TableHead className="text-right">CGST</TableHead>
                    <TableHead className="text-right">SGST</TableHead>
                  </>
                )}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.sno}</TableCell>
                  <TableCell className="text-sm">
                    {l.skuSnapshot ? (
                      <div className="font-mono text-[11px] font-semibold">
                        {l.skuSnapshot}
                      </div>
                    ) : null}
                    <div>{l.description}</div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{l.hsnCode ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {Number(l.quantity)} {l.unit}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIndianNumber(new Decimal(l.unitPrice))}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatIndianNumber(new Decimal(l.taxableValue))}
                  </TableCell>
                  {inv.isInterState ? (
                    <TableCell className="text-right tabular-nums">
                      {Number(l.igstRate).toFixed(0)}% ·{" "}
                      {formatIndianNumber(new Decimal(l.igstAmount))}
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className="text-right tabular-nums">
                        {Number(l.cgstRate).toFixed(1)}% ·{" "}
                        {formatIndianNumber(new Decimal(l.cgstAmount))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(l.sgstRate).toFixed(1)}% ·{" "}
                        {formatIndianNumber(new Decimal(l.sgstAmount))}
                      </TableCell>
                    </>
                  )}
                  <TableCell className="text-right tabular-nums font-semibold">
                    {formatIndianNumber(new Decimal(l.lineTotal))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Total taxable value" value={inv.totalTaxableValue} />
          {inv.isInterState ? (
            <Row label="Total IGST" value={inv.totalIgst} />
          ) : (
            <>
              <Row label="Total CGST" value={inv.totalCgst} />
              <Row label="Total SGST" value={inv.totalSgst} />
            </>
          )}
          {!new Decimal(inv.roundOff).isZero() ? (
            <Row label="Round off" value={inv.roundOff} />
          ) : null}
          <Separator className="my-2" />
          <Row
            label="Grand total"
            value={inv.totalInvoiceValue}
            bold
            large
          />
          <p className="text-sm italic text-muted-foreground">
            {amountInWords(new Decimal(inv.totalInvoiceValue))}
          </p>
        </CardContent>
      </Card>

      {(inv.bankName || inv.bankAccount || inv.bankIfsc) ? (
        <Card>
          <CardHeader>
            <CardDescription>Bank for payment</CardDescription>
            <CardTitle>Banking details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Bank</p>
              <p className="font-medium">{inv.bankName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">A/c No.</p>
              <p className="font-mono">{inv.bankAccount ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">IFSC</p>
              <p className="font-mono">{inv.bankIfsc ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Branch</p>
              <p>{inv.bankBranch ?? "—"}</p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {inv.notes ? (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{inv.notes}</p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  large,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={bold ? "font-semibold" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={[
          large ? "text-xl" : "text-sm",
          bold ? "font-semibold" : "",
          "tabular-nums",
        ].join(" ")}
      >
        ₹{formatIndianNumber(new Decimal(value))}
      </span>
    </div>
  );
}
