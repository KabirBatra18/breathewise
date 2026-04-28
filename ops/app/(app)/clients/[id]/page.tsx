import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { ClientForm, type ClientFormValues } from "@/components/clients/client-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { softDeleteClientAction } from "../actions";

export const metadata = { title: "Edit client" };

export default async function ClientPage({
  params,
}: {
  params: { id: string };
}) {
  const me = await requireAuth();

  const row = await db.query.clients.findFirst({
    where: eq(clients.id, params.id),
  });
  if (!row || row.deletedAt) notFound();

  const initial: ClientFormValues = {
    id: row.id,
    name: row.name,
    companyName: row.companyName,
    email: row.email,
    phone: row.phone,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    gstin: row.gstin,
    notes: row.notes,
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <Link
          href="/clients"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to clients
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{row.name}</h1>
      </div>

      <ClientForm initial={initial} />

      {me.role === "OWNER" ? (
        <Card>
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={softDeleteClientAction}>
              <input type="hidden" name="id" value={row.id} />
              <Button type="submit" variant="destructive" size="sm">
                Archive client
              </Button>
              <p className="mt-2 text-xs text-muted-foreground">
                Archived clients are hidden from search. Existing quotes are unaffected.
              </p>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
