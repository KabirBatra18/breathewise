import Link from "next/link";
import { and, desc, ilike, isNull, or } from "drizzle-orm";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db/client";
import { clients } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  await requireAuth();
  const q = searchParams.q?.trim();

  const where = and(
    isNull(clients.deletedAt),
    q
      ? or(
          ilike(clients.name, `%${q}%`),
          ilike(clients.phone, `%${q}%`),
          ilike(clients.email, `%${q}%`),
          ilike(clients.companyName, `%${q}%`),
        )
      : undefined,
  );

  const rows = await db
    .select()
    .from(clients)
    .where(where)
    .orderBy(desc(clients.createdAt));

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
          <p className="text-sm text-muted-foreground">
            Customers you quote and install for.
          </p>
        </div>
        <Button render={<Link href="/clients/new" />}>
          <Plus className="h-4 w-4" />
          New client
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search name, phone, email, company"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>{rows.length} client{rows.length === 1 ? "" : "s"}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-muted py-12 text-center text-sm text-muted-foreground">
              No clients yet.{" "}
              <Link className="text-foreground underline" href="/clients/new">
                Add the first one
              </Link>
              .
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>City</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link href={`/clients/${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.companyName ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{c.phone ?? "—"}</TableCell>
                    <TableCell className="text-sm">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.city ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
