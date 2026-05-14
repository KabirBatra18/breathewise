import { config } from "dotenv";
config({ path: ".env.local" });

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray, sql as drizzleSql } from "drizzle-orm";
import { products, quoteLineItems, quoteSections, quotes } from "../db/schema";
import { Decimal } from "../lib/pricing";

async function main() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING;
  if (!url) throw new Error("no db url");
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);

  // 1. Find products where DP > MRP/1.18 (priced above MRP).
  const allProducts = await db
    .select({
      id: products.id,
      sku: products.sku,
      name: products.name,
      mrp: products.mrp,
      dp: products.defaultUnitPrice,
    })
    .from(products);

  const suspect: { id: string; sku: string | null; name: string; dp: string; mrp: string; impliedMargin: string }[] = [];
  for (const p of allProducts) {
    if (!p.mrp) continue;
    const mrpExGst = new Decimal(p.mrp).div(new Decimal("1.18"));
    if (new Decimal(p.dp).gt(mrpExGst.plus("0.5"))) {
      // Implied: if DP-mode, we're charging more than MRP includes
      const diff = new Decimal(p.dp).mul(new Decimal("1.18")).minus(p.mrp);
      suspect.push({
        id: p.id,
        sku: p.sku,
        name: p.name,
        dp: p.dp,
        mrp: p.mrp,
        impliedMargin: diff.toFixed(2),
      });
    }
  }
  console.log(`Suspect products (DP × 1.18 > MRP): ${suspect.length}`);
  for (const s of suspect) {
    console.log(
      `  ${s.sku ?? "(no sku)"}: ${s.name}`,
    );
    console.log(
      `    DP=₹${s.dp} → DP×1.18=₹${new Decimal(s.dp).mul("1.18").toFixed(2)} | MRP=₹${s.mrp} | over-MRP=₹${s.impliedMargin}`,
    );
  }

  // 2. Check if any quote line uses these products.
  const suspectIds = suspect.map((s) => s.id);
  if (suspectIds.length === 0) {
    console.log("\nNo quote line uses these products.");
    await sql.end();
    return;
  }

  const usages = await db
    .select({
      quoteNumber: quotes.quoteNumber,
      quoteStatus: quotes.status,
      sectionLetter: quoteSections.sectionLetter,
      sectionLabour: quoteSections.isLabourStyle,
      lineQty: quoteLineItems.quantity,
      lineUnitPrice: quoteLineItems.unitPrice,
      lineMrp: quoteLineItems.mrp,
      productId: quoteLineItems.productId,
      productSku: products.sku,
    })
    .from(quoteLineItems)
    .leftJoin(quoteSections, eq(quoteSections.id, quoteLineItems.quoteSectionId))
    .leftJoin(quotes, eq(quotes.id, quoteSections.quoteId))
    .leftJoin(products, eq(products.id, quoteLineItems.productId))
    .where(inArray(quoteLineItems.productId, suspectIds));

  console.log(
    `\nQuote lines using these products: ${usages.length}`,
  );
  for (const u of usages) {
    console.log(
      `  ${u.quoteNumber} (${u.quoteStatus}) §${u.sectionLetter}: ${u.productSku} qty=${u.lineQty} × ₹${u.lineUnitPrice} (mrp=${u.lineMrp})`,
    );
  }

  // 3. For comparison: list products with implied margin > 30%, normal range.
  const normal = allProducts
    .filter((p) => p.mrp)
    .map((p) => {
      const mrpExGst = new Decimal(p.mrp!).div(new Decimal("1.18"));
      const margin = mrpExGst
        .minus(p.dp)
        .div(mrpExGst)
        .mul(100);
      return { ...p, marginPct: margin.toNumber() };
    })
    .filter((p) => p.marginPct >= 30)
    .slice(0, 5);
  console.log("\nSample of healthy DP-mode products (≥ 30% implied margin):");
  for (const p of normal) {
    console.log(
      `  ${p.sku ?? "(no sku)"}: DP=₹${p.dp} | MRP=₹${p.mrp} | implied margin ${p.marginPct.toFixed(1)}%`,
    );
  }

  void drizzleSql;
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
