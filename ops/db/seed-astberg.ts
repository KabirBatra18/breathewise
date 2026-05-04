/**
 * Seed the Astberg catalog into `products` + `product_costs`.
 *
 * Reads `db/data/astberg-catalog.json` and upserts each SKU.
 *
 * Idempotent: if a SKU already exists (matched by sku), this script
 * UPDATES name, description, category, mrp, defaultUnitPrice, and the
 * linked productCosts.costPrice. It will NOT clobber a manually-set
 * isActive flag (keeps existing value if row exists).
 *
 * Run:  pnpm db:seed:astberg
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { products, productCosts } from "./schema";
import { Decimal } from "../lib/pricing/decimal";
import {
  computeCostPrice,
  computeDefaultUnitPrice,
  ASTBERG_CONSTANTS,
  type AstbergPricedSKU,
} from "../lib/pricing/astberg-rules";

interface CatalogJSON {
  metadata: { supplier: string; gstRatePercent: number };
  categories: {
    name: string;
    subcategories: {
      name: string;
      skus: Array<{
        sku: string;
        name: string;
        is_erv: boolean;
        mrp: number | null;
        dp_basic?: number | null;
        gst_18?: number | null;
        dp?: number | null;
        size_mm?: string | number;
        airflow_m3h?: string | number;
        pressure_pa?: string | number;
        watts?: string | number;
        amp?: number;
        db?: string | number;
        filtration?: string;
        unit?: string;
        notes?: string;
      }>;
    }[];
  }[];
}

// Map JSON top-level category + ERV flag to the existing PRODUCT_CATEGORIES enum.
function mapCategory(jsonCategory: string, subcategory: string, isERV: boolean): string {
  if (isERV) return "FRESH_AIR";
  if (jsonCategory === "Accessories") return "ACCESSORY";
  // Fresh-air-side equipment lives in Specialty Fans
  const freshAirSubcats = [
    "AHI Series",        // Booster
    "AFP Series",        // Fresh Air Box
    "AFV Series",        // Fresh Air Purifier
    "AFV-DP Series",     // Cabinet Fan w/ Pre-Filter
    "ABF Series",        // Air Box Fan
    "ASF —",             // Ultra Slim Fan (in PI was used for fresh air)
    "ASHT Series",       // Portable Blower (used for fresh air supply)
  ];
  if (freshAirSubcats.some((p) => subcategory.startsWith(p))) return "FRESH_AIR";
  // Default: everything else → EXHAUST (most inline fans, propeller, ceiling, etc.)
  return "EXHAUST";
}

function buildDescription(
  name: string,
  subcategory: string,
  sku: CatalogJSON["categories"][0]["subcategories"][0]["skus"][0],
): string {
  const parts: string[] = [name, `[${subcategory}]`];
  const specs: string[] = [];
  if (sku.airflow_m3h) specs.push(`${sku.airflow_m3h} m³/h`);
  if (sku.pressure_pa) specs.push(`${sku.pressure_pa} Pa`);
  if (sku.watts) specs.push(`${sku.watts} W`);
  if (sku.amp) specs.push(`${sku.amp} A`);
  if (sku.db) specs.push(`${sku.db} dB`);
  if (sku.size_mm) specs.push(`size: ${sku.size_mm}mm`);
  if (sku.filtration) specs.push(`filter: ${sku.filtration}`);
  if (specs.length) parts.push(`(${specs.join(" · ")})`);
  if (sku.notes) parts.push(`Note: ${sku.notes}`);
  return parts.join(" ");
}

function dec(v: number | null | undefined): Decimal | null {
  if (v == null) return null;
  return new Decimal(v);
}

async function main() {
  const url =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL / POSTGRES_URL_NON_POOLING / POSTGRES_URL not set");
  }

  const jsonPath = resolve(process.cwd(), "db/data/astberg-catalog.json");
  const catalog: CatalogJSON = JSON.parse(readFileSync(jsonPath, "utf-8"));

  const client = postgres(url, { max: 1, prepare: false });
  const db = drizzle(client);

  let inserted = 0;
  let updated = 0;
  let skippedNoPricing = 0;
  let skippedNoSku = 0;

  try {
    for (const cat of catalog.categories) {
      for (const sub of cat.subcategories) {
        for (const row of sub.skus) {
          const skuCode = row.sku?.trim();
          if (!skuCode) {
            skippedNoSku++;
            continue;
          }

          const priced: AstbergPricedSKU = {
            sku: skuCode,
            name: row.name,
            isERV: !!row.is_erv,
            mrp: dec(row.mrp ?? null),
            dpBasic: dec(row.dp_basic ?? null),
            dp: dec(row.dp ?? null),
          };

          const defaultUnitPrice = computeDefaultUnitPrice(priced);
          if (!defaultUnitPrice) {
            console.warn(`  ⚠ Skipping ${skuCode}: no pricing in source PDF`);
            skippedNoPricing++;
            continue;
          }

          const costPrice = computeCostPrice(priced);
          const categoryEnum = mapCategory(cat.name, sub.name, priced.isERV);
          const description = buildDescription(row.name, sub.name, row);
          const unit = row.unit ?? "pcs";

          // Upsert product
          const existing = await db
            .select({ id: products.id })
            .from(products)
            .where(eq(products.sku, skuCode));

          if (existing.length > 0) {
            const id = existing[0].id;
            await db
              .update(products)
              .set({
                name: row.name,
                description,
                category: categoryEnum,
                mrp: priced.mrp ? priced.mrp.toFixed(2) : null,
                defaultUnitPrice: defaultUnitPrice.toFixed(2),
                defaultGstRate: "18.00",
                unit,
                updatedAt: new Date(),
              })
              .where(eq(products.id, id));

            // Upsert cost
            if (costPrice) {
              const existingCost = await db
                .select({ productId: productCosts.productId })
                .from(productCosts)
                .where(eq(productCosts.productId, id));
              if (existingCost.length > 0) {
                await db
                  .update(productCosts)
                  .set({
                    costPrice: costPrice.toFixed(2),
                    supplier: ASTBERG_CONSTANTS.supplier,
                    notes: `Auto-seeded from astberg-catalog.json. ` +
                      (priced.isERV
                        ? `ERV: cost = MRP/1.18 × 0.80.`
                        : `Non-ERV: cost = DP-Basic × 0.80.`),
                    updatedAt: new Date(),
                  })
                  .where(eq(productCosts.productId, id));
              } else {
                await db.insert(productCosts).values({
                  productId: id,
                  costPrice: costPrice.toFixed(2),
                  supplier: ASTBERG_CONSTANTS.supplier,
                  notes: `Auto-seeded from astberg-catalog.json. ` +
                    (priced.isERV
                      ? `ERV: cost = MRP/1.18 × 0.80.`
                      : `Non-ERV: cost = DP-Basic × 0.80.`),
                });
              }
            }
            updated++;
          } else {
            const [newProduct] = await db
              .insert(products)
              .values({
                sku: skuCode,
                name: row.name,
                description,
                category: categoryEnum,
                mrp: priced.mrp ? priced.mrp.toFixed(2) : null,
                defaultUnitPrice: defaultUnitPrice.toFixed(2),
                defaultGstRate: "18.00",
                unit,
                isActive: true,
              })
              .returning({ id: products.id });

            if (costPrice && newProduct) {
              await db.insert(productCosts).values({
                productId: newProduct.id,
                costPrice: costPrice.toFixed(2),
                supplier: ASTBERG_CONSTANTS.supplier,
                notes: `Auto-seeded from astberg-catalog.json. ` +
                  (priced.isERV
                    ? `ERV: cost = MRP/1.18 × 0.80.`
                    : `Non-ERV: cost = DP-Basic × 0.80.`),
              });
            }
            inserted++;
          }
        }
      }
    }
    console.log(`\n✓ Astberg catalog sync complete`);
    console.log(`  inserted          : ${inserted}`);
    console.log(`  updated           : ${updated}`);
    console.log(`  skipped (no SKU)  : ${skippedNoSku}`);
    console.log(`  skipped (no price): ${skippedNoPricing}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
