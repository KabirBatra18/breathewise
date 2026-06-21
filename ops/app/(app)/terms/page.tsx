import { asc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { termsClauses, verticals } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TermsList } from "@/components/terms/term-editor";

export const metadata = { title: "Terms" };

export default async function TermsPage() {
  await requireOwner();
  const [rows, verticalRows] = await Promise.all([
    db
      .select()
      .from(termsClauses)
      .where(isNull(termsClauses.deletedAt))
      .orderBy(asc(termsClauses.sortOrder)),
    db
      .select({ id: verticals.id, brandName: verticals.brandName })
      .from(verticals)
      .where(eq(verticals.isActive, true))
      .orderBy(asc(verticals.displayOrder)),
  ]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Terms &amp; conditions
        </h1>
        <p className="text-sm text-muted-foreground">
          The clause library that auto-fills new quotes. Each quote
          snapshots its T&amp;Cs at save — editing a clause here only
          affects future quotes.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardDescription>Owner-only</CardDescription>
          <CardTitle>Clause library</CardTitle>
        </CardHeader>
        <CardContent>
          <TermsList
            rows={rows.map((r) => ({
              id: r.id,
              title: r.title,
              body: r.body,
              category: r.category,
              appliesTo: r.appliesTo,
              isDefault: r.isDefault,
              sortOrder: r.sortOrder,
              verticalId: r.verticalId,
            }))}
            verticals={verticalRows}
          />
        </CardContent>
      </Card>
    </div>
  );
}
