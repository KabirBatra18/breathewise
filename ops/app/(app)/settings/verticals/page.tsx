import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { verticals } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { Badge } from "@/components/ui/badge";
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
import { Info } from "lucide-react";
import { NewVerticalForm } from "./vertical-form";
import { VerticalRowActions } from "./vertical-row-actions";

export const metadata = { title: "Verticals" };

export default async function VerticalsPage() {
  await requireOwner();
  const list = await db
    .select()
    .from(verticals)
    .orderBy(asc(verticals.displayOrder), asc(verticals.brandName));

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Verticals</h1>
        <p className="text-sm text-muted-foreground">
          Brands operated under Urban Tech Home Solutions. Each vertical drives
          the PDF header, WhatsApp signature, and default T&amp;Cs on quotes
          issued under it. Owner-only.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-2">
            <p className="font-medium">How verticals work</p>
            <ul className="ml-4 list-disc space-y-1 text-xs text-muted-foreground">
              <li>
                <strong>UTHS is the legal entity</strong> — single GSTIN,
                single bank account, single GST filing. Every invoice prints
                &ldquo;Urban Tech Home Solutions&rdquo; in the legal block,
                regardless of vertical.
              </li>
              <li>
                <strong>Verticals are presentation only</strong> — PDF
                header brand name + colour, WhatsApp signature, email
                From name, and the default T&amp;C set that auto-loads
                onto each new quote (Phase 5 of the multi-vertical work).
              </li>
              <li>
                <strong>Invoice numbers are shared</strong>: one
                continuous UTHS/INV/NNNN/YYYY sequence regardless of
                vertical. Per Rule 46 of CGST Rules &mdash; multiple
                series is allowed, but single is simpler for CA reporting.
              </li>
              <li>
                <strong>Hide vs Delete</strong>: vertical rows can be
                hidden from the quote builder picker but not deleted &mdash;
                existing quotes/invoices reference them via FK. Hiding
                is enough for &ldquo;we no longer take this kind of
                work&rdquo;; existing customer documents stay branded.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a vertical</CardTitle>
          <CardDescription>
            New brands appear in the quote builder picker immediately. The
            two seeded verticals (BreatheWise, UTHS Security) are managed
            here too — edit their branding via the row actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewVerticalForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All verticals</CardTitle>
          <CardDescription>
            {list.length} vertical{list.length === 1 ? "" : "s"}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>WhatsApp signature</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="text-muted-foreground">
                    {v.displayOrder}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {v.brandColor ? (
                        <span
                          className="inline-block h-3 w-3 rounded-full border"
                          style={{ background: v.brandColor }}
                          aria-hidden
                        />
                      ) : null}
                      <div>
                        <p className="font-medium">{v.brandName}</p>
                        {v.tagline ? (
                          <p className="text-xs text-muted-foreground">
                            {v.tagline}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {v.slug}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {v.whatsappSignature}
                  </TableCell>
                  <TableCell>
                    {v.isActive ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Hidden</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <VerticalRowActions
                      vertical={{
                        id: v.id,
                        slug: v.slug,
                        brandName: v.brandName,
                        tagline: v.tagline,
                        brandColor: v.brandColor,
                        whatsappSignature: v.whatsappSignature,
                        emailFromName: v.emailFromName,
                        websiteUrl: v.websiteUrl,
                        displayOrder: v.displayOrder,
                        isActive: v.isActive,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
