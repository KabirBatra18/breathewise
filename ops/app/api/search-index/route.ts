import { NextResponse } from "next/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clients, products, quotes } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";

/**
 * Cmd+K search index.
 *
 * Previously this was pre-fetched in app/(app)/layout.tsx on every
 * single page navigation — 3 DB queries on the critical path of
 * every render, costing ~200-500ms TTFB across the app. The user
 * reported "clunky and unresponsive" behaviour; the 2026-06-21 audit
 * pointed at the layout pre-fetch as the single biggest contributor.
 *
 * Now it's a client-fetched endpoint that the CommandPalette lazy-
 * loads on first open (and caches in memory thereafter). The result
 * gets a short `s-maxage` so multiple users in a session don't each
 * re-hit the DB unnecessarily, but you also won't see stale rows
 * after creating a new quote — `revalidatePath` from the action
 * still busts shared caches at the edge.
 *
 * Auth: requireAuth() — same gate as the layout it replaced.
 */
export interface SearchItem {
  type: "quote" | "client" | "product";
  id: string;
  href: string;
  label: string;
  sublabel?: string;
}

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAuth();

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

  const items: SearchItem[] = [
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

  return NextResponse.json(
    { items },
    {
      headers: {
        // Brief edge cache so navigating between pages doesn't re-hit
        // the DB; far shorter than the user could notice staleness for.
        "Cache-Control": "private, max-age=30",
      },
    },
  );
}
