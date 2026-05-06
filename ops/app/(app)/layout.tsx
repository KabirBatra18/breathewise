import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Sidebar } from "@/components/app/sidebar";
import {
  CommandPalette,
  type SearchItem,
} from "@/components/app/command-palette";
import { db } from "@/lib/db/client";
import { clients, products, quotes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAuth();

  // Lightweight search index for the Cmd+K palette. Whole tree is small
  // (~250 rows) so we ship the lot to the client and filter locally —
  // simpler + zero RTT per keystroke.
  const [quoteRows, clientRows, productRows] = await Promise.all([
    db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        clientId: quotes.clientId,
      })
      .from(quotes)
      .orderBy(desc(quotes.createdAt))
      .limit(200),
    db
      .select({
        id: clients.id,
        name: clients.name,
        companyName: clients.companyName,
        phone: clients.phone,
      })
      .from(clients)
      .where(isNull(clients.deletedAt))
      .orderBy(asc(clients.name)),
    db
      .select({
        id: products.id,
        sku: products.sku,
        name: products.name,
        subcategory: products.subcategory,
      })
      .from(products)
      .where(and(isNull(products.deletedAt), eq(products.isActive, true)))
      .orderBy(asc(products.name)),
  ]);

  const clientById = new Map<string, string>();
  for (const c of clientRows) {
    clientById.set(
      c.id,
      [c.name, c.companyName].filter(Boolean).join(" — ") || c.name,
    );
  }

  const searchItems: SearchItem[] = [
    ...quoteRows.map<SearchItem>((q) => ({
      type: "quote",
      id: q.id,
      href: `/quotes/${q.id}`,
      label: q.quoteNumber,
      sublabel: clientById.get(q.clientId),
    })),
    ...clientRows.map<SearchItem>((c) => ({
      type: "client",
      id: c.id,
      href: `/clients/${c.id}`,
      label: [c.name, c.companyName].filter(Boolean).join(" — ") || c.name,
      sublabel: c.phone ?? undefined,
    })),
    ...productRows.map<SearchItem>((p) => ({
      type: "product",
      id: p.id,
      href: `/products/${p.id}`,
      label: p.name,
      sublabel: [p.sku, p.subcategory].filter(Boolean).join(" · ") || undefined,
    })),
  ];

  return (
    <div className="flex min-h-svh">
      <Sidebar role={user.role as "OWNER" | "EMPLOYEE" | "VIEWER"} name={user.fullName} />
      <main className="flex-1 overflow-auto">{children}</main>
      <CommandPalette items={searchItems} />
    </div>
  );
}
