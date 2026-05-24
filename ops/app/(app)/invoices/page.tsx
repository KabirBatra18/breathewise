import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Download } from "lucide-react";
import { db } from "@/lib/db/client";
import { clients, invoices, quotes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/ui/status-badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Decimal, ZERO, toMoney } from "@/lib/pricing/decimal";
import { formatIndianNumber } from "@/lib/pricing/format";
import { DeleteDraftButton } from "@/components/invoices/delete-draft-button";
import { PdfPreviewButton } from "@/components/ui/pdf-preview-button";

export const metadata = { title: "Invoices" };

export default async function InvoicesListPage() {
  await requireAuth();

  const rows = await db
    .select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      issueDate: invoices.issueDate,
      updatedAt: invoices.updatedAt,
      totalInvoiceValue: invoices.totalInvoiceValue,
      totalTaxableValue: invoices.totalTaxableValue,
      totalCgst: invoices.totalCgst,
      totalSgst: invoices.totalSgst,
      totalIgst: invoices.totalIgst,
      isInterState: invoices.isInterState,
      reverseCharge: invoices.reverseCharge,
      placeOfSupply: invoices.placeOfSupply,
      quoteNumber: quotes.quoteNumber,
      quoteId: quotes.id,
      clientName: clients.name,
      clientCompany: clients.companyName,
    })
    .from(invoices)
    .leftJoin(quotes, eq(quotes.id, invoices.quoteId))
    .leftJoin(clients, eq(clients.id, invoices.clientId))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt));

  const drafts = rows.filter((r) => r.status === "DRAFT");
  const issued = rows.filter((r) => r.status === "ISSUED");
  const canceled = rows.filter((r) => r.status === "CANCELED");

  // Aggregate tiles (issued only — drafts and canceled don't count)
  const totalBilled = toMoney(
    issued.reduce((a, r) => a.plus(new Decimal(r.totalInvoiceValue)), ZERO),
  );
  const totalTaxable = toMoney(
    issued.reduce((a, r) => a.plus(new Decimal(r.totalTaxableValue)), ZERO),
  );
  const totalGst = toMoney(
    issued.reduce(
      (a, r) =>
        a
          .plus(new Decimal(r.totalCgst))
          .plus(new Decimal(r.totalSgst))
          .plus(new Decimal(r.totalIgst)),
      ZERO,
    ),
  );

  return (
    <div className="space-y-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Tax invoices
          </h1>
          <p className="text-sm text-muted-foreground">
            GST-compliant invoices raised from accepted quotes. Each invoice
            is frozen at issue — line items and tax break-up don&apos;t move
            when the source quote is edited.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Tile label="Issued invoices" rawText={`${issued.length}`} />
        <Tile label="Drafts" rawText={`${drafts.length}`} />
        <Tile label="Total billed (₹)" value={totalBilled} />
        <Tile label="GST collected (₹)" value={totalGst} />
      </div>

      {drafts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>
              Editable. Numbers get allocated only when you finalize, so deleted
              drafts leave no gaps in the issued sequence.
            </CardDescription>
            <CardTitle>
              Drafts ({drafts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>From quote</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Last edited</TableHead>
                  <TableHead className="text-right">Current total (₹)</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">
                      {r.quoteId ? (
                        <Link
                          href={`/quotes/${r.quoteId}`}
                          className="hover:underline"
                        >
                          {r.quoteNumber}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {[r.clientName, r.clientCompany]
                        .filter(Boolean)
                        .join(" · ")}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.updatedAt
                        ? new Date(r.updatedAt).toISOString().slice(0, 10)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      ₹
                      {formatIndianNumber(new Decimal(r.totalInvoiceValue))}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          size="sm"
                          render={<Link href={`/invoices/${r.id}/edit`} />}
                        >
                          Open editor
                        </Button>
                        <DeleteDraftButton
                          invoiceId={r.id}
                          quoteNumber={r.quoteNumber}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardDescription>
            {issued.length === 0
              ? "No invoices issued yet"
              : `${issued.length} issued invoice${issued.length === 1 ? "" : "s"} · Σ taxable ₹${formatIndianNumber(totalTaxable)}`}
          </CardDescription>
          <CardTitle>Issued invoices</CardTitle>
        </CardHeader>
        <CardContent>
          {issued.length === 0 ? (
            <p className="rounded-lg border-2 border-dashed p-12 text-center text-sm text-muted-foreground">
              No issued invoices yet. Open an accepted quote, click{" "}
              <strong>Convert to Tax Invoice</strong> to spawn a draft, edit
              the lines, then click Finalize.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Source quote</TableHead>
                  <TableHead>Place of supply</TableHead>
                  <TableHead className="text-right">Taxable</TableHead>
                  <TableHead className="text-right">GST</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {issued.map((r) => {
                  const gst = toMoney(
                    new Decimal(r.totalCgst)
                      .plus(new Decimal(r.totalSgst))
                      .plus(new Decimal(r.totalIgst)),
                  );
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/invoices/${r.id}`}
                          className="hover:underline"
                        >
                          {r.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {r.issueDate as unknown as string}
                      </TableCell>
                      <TableCell>
                        {[r.clientName, r.clientCompany]
                          .filter(Boolean)
                          .join(" · ")}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.quoteId ? (
                          <Link
                            href={`/quotes/${r.quoteId}`}
                            className="hover:underline"
                          >
                            {r.quoteNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.placeOfSupply}{" "}
                        <ToneBadge tone={r.isInterState ? "violet" : "sky"}>
                          {r.isInterState ? "IGST" : "CGST+SGST"}
                        </ToneBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatIndianNumber(new Decimal(r.totalTaxableValue))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-amber-700 dark:text-amber-400">
                        {formatIndianNumber(gst)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        ₹
                        {formatIndianNumber(new Decimal(r.totalInvoiceValue))}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <PdfPreviewButton
                            url={`/api/invoices/${r.id}/pdf?copy=client`}
                            filename={`${(r.invoiceNumber ?? "invoice").replace(/\//g, "-")}-client.pdf`}
                            title={`Tax Invoice ${r.invoiceNumber ?? ""} — Client Copy`}
                            description="Original for Recipient + T&Cs."
                          >
                            <Download className="h-3.5 w-3.5" />
                            Client
                          </PdfPreviewButton>
                          <PdfPreviewButton
                            url={`/api/invoices/${r.id}/pdf`}
                            filename={`${(r.invoiceNumber ?? "invoice").replace(/\//g, "-")}.pdf`}
                            title={`Tax Invoice ${r.invoiceNumber ?? ""} — All Copies`}
                            description="Original / Duplicate / Triplicate."
                            variant="outline"
                          >
                            <Download className="h-3.5 w-3.5" />
                            3 copies
                          </PdfPreviewButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {canceled.length > 0 ? (
        <Card>
          <CardHeader>
            <CardDescription>
              {canceled.length} canceled invoice{canceled.length === 1 ? "" : "s"}.
              Numbers preserved (no gaps) — these are not part of any total.
            </CardDescription>
            <CardTitle>Canceled invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead className="text-right">Was ₹</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {canceled.map((r) => (
                  <TableRow key={r.id} className="text-muted-foreground">
                    <TableCell className="font-mono text-sm line-through">
                      <Link
                        href={`/invoices/${r.id}`}
                        className="hover:underline"
                      >
                        {r.invoiceNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.issueDate as unknown as string}
                    </TableCell>
                    <TableCell>
                      {[r.clientName, r.clientCompany]
                        .filter(Boolean)
                        .join(" · ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums line-through">
                      ₹{formatIndianNumber(new Decimal(r.totalInvoiceValue))}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        render={<Link href={`/invoices/${r.id}`} />}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Tile({
  label,
  value,
  rawText,
}: {
  label: string;
  value?: Decimal;
  rawText?: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold tabular-nums">
        {value !== undefined ? `₹${formatIndianNumber(value)}` : rawText}
      </p>
    </div>
  );
}
