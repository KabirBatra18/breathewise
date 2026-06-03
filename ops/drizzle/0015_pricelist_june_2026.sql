-- Migration 0015 — Astberg June 2026 catalog price refresh.
--
-- WHAT THIS DOES
-- This migration applies a bulk price update to the product catalog
-- against the Astberg Pricelist dated June 2026, which arrived as three
-- PDFs:
--
--   ERVs/HRVs     →  Astberg pricelist (erv)
--   Fans          →  Astberg pricelist (fan)
--   Accessories   →  Astberg pricelist (acc)
--
-- A diff between the existing DB rows and the parsed PDF lines was
-- produced by the offline workflow at /tmp/pricelist-diff.json. This
-- migration writes the result of that diff:
--
--   • 196 existing products    →  UPDATE mrp + default_unit_price
--                                 and UPSERT product_costs.cost_price
--   •  14 brand-new SKUs       →  INSERT into products + product_costs
--   •  11 catalog-only SKUs    →  INTENTIONALLY UNTOUCHED.
--                                 Per the user's directive, SKUs that
--                                 exist only in the DB (no match on
--                                 the new pricelist) are left alone —
--                                 they may be legacy/in-flight items
--                                 the supplier just didn't reprint.
--
-- PRICING RULES APPLIED (in the parser, not in this SQL)
-- For ERV rows the cost is derived as MRP * 0.80 / 1.18, since the
-- 'ERV cost formula' the user uses is "DP minus our 4% margin minus
-- 18% GST", i.e. cost = MRP × 0.80 × (1/1.18). For fans/accessories
-- the supplier's published DP is taken at face value and cost is
-- DP / 1.18.
--
-- This SQL DOES NOT compute prices. The engine that does the
-- formulas is /lib/pricing.ts; we are not touching it. Whatever
-- numbers landed in /tmp/pricelist-diff.json are what we write.
--
-- IDEMPOTENCY
--   • UPDATEs are no-ops on re-run (every target value is explicit).
--   • New INSERTs use ON CONFLICT (sku) DO NOTHING for products and
--     ON CONFLICT (product_id) DO UPDATE for product_costs (its PK
--     is product_id).
--   • product_cost_history INSERTs are guarded by a WHERE NOT EXISTS
--     scoped to (product_id, new_cost) within the last 24 hours, so
--     re-running within that window does not double-log.
--
-- TRIGGER NOTE
-- The base schema (0000) defines a trigger
--   product_costs_history_trg AFTER INSERT OR UPDATE OF cost_price
-- which itself appends a row to product_cost_history. The explicit
-- history INSERT here runs BEFORE the cost UPDATE/INSERT, with a
-- changed_at < 1 day NOT EXISTS guard so we don't append twice on a
-- re-run. The trigger will still fire on the cost write itself —
-- that's expected, the forensic trail will show both rows: the
-- "previous_cost / new_cost" pair we explicitly captured here, plus
-- the trigger's own audit row. Acceptable: more audit is fine,
-- duplicate audit is the cost of being explicit about deltas.
--
-- TRANSACTION
-- This file is run by ops/drizzle/migrate.ts inside a sql.begin
-- block, so the entire migration is already wrapped in a single
-- Postgres transaction. We deliberately do NOT emit an inner
-- BEGIN/COMMIT here — that would conflict with the runner's wrapper
-- (Postgres has no nested transactions; an inner COMMIT would end
-- the outer one mid-migration and the runner's
-- "INSERT INTO _bw_migrations" record-write would then run outside
-- the transaction). Atomicity is preserved by the runner.
--
-- SOURCE OF TRUTH
--   /tmp/pricelist-diff.json   (workflow output, June 2026 PDFs)
--   counts:  match=196   new=14   catalog_only=11


-- =========================================================================
-- SECTION A — Existing products (UPDATE mrp/dp, UPSERT cost, log history)
-- =========================================================================

-- AF-100  (fan)  Astberg AF 100 Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4264.41, 4535.20
FROM products p
WHERE p.sku = 'AF-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 4535.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 7990.00, default_unit_price = 6690.00 WHERE sku = 'AF-100';
UPDATE product_costs SET cost_price = 4535.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AF-100');

-- AF-125  (fan)  Astberg AF 125 Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4400.00, 4671.20
FROM products p
WHERE p.sku = 'AF-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 4671.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 8290.00, default_unit_price = 6890.00 WHERE sku = 'AF-125';
UPDATE product_costs SET cost_price = 4671.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AF-125');

-- AF-150  (fan)  Astberg AF 150 Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5145.76, 5484.80
FROM products p
WHERE p.sku = 'AF-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5484.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9790.00, default_unit_price = 8090.00 WHERE sku = 'AF-150';
UPDATE product_costs SET cost_price = 5484.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AF-150');

-- AF-200  (fan)  Astberg AF 200 Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6772.88, 7315.20
FROM products p
WHERE p.sku = 'AF-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 7315.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 12990.00, default_unit_price = 10790.00 WHERE sku = 'AF-200';
UPDATE product_costs SET cost_price = 7315.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AF-200');

-- AF-250  (fan)  Astberg AF 250 Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 13213.56, 14162.40
FROM products p
WHERE p.sku = 'AF-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 14162.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 24990.00, default_unit_price = 20890.00 WHERE sku = 'AF-250';
UPDATE product_costs SET cost_price = 14162.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AF-250');

-- AF-315  (fan)  Astberg AF 315 Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 15586.44, 16739.20
FROM products p
WHERE p.sku = 'AF-315'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 16739.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 29690.00, default_unit_price = 24690.00 WHERE sku = 'AF-315';
UPDATE product_costs SET cost_price = 16739.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AF-315');

-- ATMK-300-AC  (fan)  Astberg ATMK 300 AC Mixed Flow Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 17620.34, 18298.40
FROM products p
WHERE p.sku = 'ATMK-300-AC'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 18298.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 33990.00, default_unit_price = 26990.00 WHERE sku = 'ATMK-300-AC';
UPDATE product_costs SET cost_price = 18298.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ATMK-300-AC');

-- ASMK-300-AC  (fan)  Astberg ASMK 300 AC Mixed Flow Fan with Silencer
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 29145.76, 31180.00
FROM products p
WHERE p.sku = 'ASMK-300-AC'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 31180.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 54990.00, default_unit_price = 45990.00 WHERE sku = 'ASMK-300-AC';
UPDATE product_costs SET cost_price = 31180.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASMK-300-AC');

-- ASMK-355-AC  (fan)  Astberg ASMK 355 AC Mixed Flow Fan with Silencer
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 39993.22, 42027.20
FROM products p
WHERE p.sku = 'ASMK-355-AC'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 42027.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 74490.00, default_unit_price = 61990.00 WHERE sku = 'ASMK-355-AC';
UPDATE product_costs SET cost_price = 42027.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASMK-355-AC');

-- ASMK-400-AC  (fan)  Astberg ASMK 400 AC Mixed Flow Fan with Silencer
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 47789.83, 50840.80
FROM products p
WHERE p.sku = 'ASMK-400-AC'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 50840.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 89990.00, default_unit_price = 74990.00 WHERE sku = 'ASMK-400-AC';
UPDATE product_costs SET cost_price = 50840.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASMK-400-AC');

-- ASMK-400-EC  (fan)  Astberg ASMK 400 EC MOTOR Mixed Flow Fan with Silencer
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 62366.10, 66433.60
FROM products p
WHERE p.sku = 'ASMK-400-EC'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 66433.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 117990.00, default_unit_price = 97990.00 WHERE sku = 'ASMK-400-EC';
UPDATE product_costs SET cost_price = 66433.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASMK-400-EC');

-- AFB-200  (fan)  Astberg AFB 200 Black Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6298.31, 6501.60
FROM products p
WHERE p.sku = 'AFB-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6501.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 11490.00, default_unit_price = 9590.00 WHERE sku = 'AFB-200';
UPDATE product_costs SET cost_price = 6501.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFB-200');

-- AFB-250  (fan)  Astberg AFB 250 Black Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 12196.61, 12535.20
FROM products p
WHERE p.sku = 'AFB-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 12535.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 21990.00, default_unit_price = 18490.00 WHERE sku = 'AFB-250';
UPDATE product_costs SET cost_price = 12535.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFB-250');

-- AFB-315  (fan)  Astberg AFB 315 Black Mix Flow Inline Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 14569.49, 14908.80
FROM products p
WHERE p.sku = 'AFB-315'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 14908.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 26390.00, default_unit_price = 21990.00 WHERE sku = 'AFB-315';
UPDATE product_costs SET cost_price = 14908.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFB-315');

-- AEE-100  (fan)  Astberg AEE 100 Circular Duct Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4332.20, 4535.20
FROM products p
WHERE p.sku = 'AEE-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 4535.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 7990.00, default_unit_price = 6690.00 WHERE sku = 'AEE-100';
UPDATE product_costs SET cost_price = 4535.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEE-100');

-- AEE-125  (fan)  Astberg AEE 125 Circular Duct Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4603.39, 4806.40
FROM products p
WHERE p.sku = 'AEE-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 4806.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 8490.00, default_unit_price = 7090.00 WHERE sku = 'AEE-125';
UPDATE product_costs SET cost_price = 4806.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEE-125');

-- AEE-150  (fan)  Astberg AEE 150 Circular Duct Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5891.53, 6128.80
FROM products p
WHERE p.sku = 'AEE-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6128.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 10890.00, default_unit_price = 9040.00 WHERE sku = 'AEE-150';
UPDATE product_costs SET cost_price = 6128.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEE-150');

-- AEE-200  (fan)  Astberg AEE 200 Circular Duct Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6976.27, 7315.20
FROM products p
WHERE p.sku = 'AEE-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 7315.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 12990.00, default_unit_price = 10790.00 WHERE sku = 'AEE-200';
UPDATE product_costs SET cost_price = 7315.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEE-200');

-- AEE-250  (fan)  Astberg AEE 250 Circular Duct Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 7179.66, 7518.40
FROM products p
WHERE p.sku = 'AEE-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 7518.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 13390.00, default_unit_price = 11090.00 WHERE sku = 'AEE-250';
UPDATE product_costs SET cost_price = 7518.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEE-250');

-- AEE-315  (fan)  Astberg AEE 315 Circular Duct Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 8467.80, 8806.40
FROM products p
WHERE p.sku = 'AEE-315'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 8806.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 15690.00, default_unit_price = 12990.00 WHERE sku = 'AEE-315';
UPDATE product_costs SET cost_price = 8806.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEE-315');

-- AEE-400  (fan)  Astberg AEE 400 Circular Duct Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 16942.37, 16942.40
FROM products p
WHERE p.sku = 'AEE-400'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 16942.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 29990.00, default_unit_price = 24990.00 WHERE sku = 'AEE-400';
UPDATE product_costs SET cost_price = 16942.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEE-400');

-- TYPHOON-100-125  (fan)  Astberg Typhoon 100/125
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4942.37, 5145.60
FROM products p
WHERE p.sku = 'TYPHOON-100-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5145.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9190.00, default_unit_price = 7590.00 WHERE sku = 'TYPHOON-100-125';
UPDATE product_costs SET cost_price = 5145.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'TYPHOON-100-125');

-- TYPHOON-150-160  (fan)  Astberg Typhoon 150/160
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5552.54, 5756.00
FROM products p
WHERE p.sku = 'TYPHOON-150-160'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5756.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 10490.00, default_unit_price = 8490.00 WHERE sku = 'TYPHOON-150-160';
UPDATE product_costs SET cost_price = 5756.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'TYPHOON-150-160');

-- AEC-150  (fan)  Astberg AEC 150 Inline Fan with Speed Controller
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6705.08, 6908.80
FROM products p
WHERE p.sku = 'AEC-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6908.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 12290.00, default_unit_price = 10190.00 WHERE sku = 'AEC-150';
UPDATE product_costs SET cost_price = 6908.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEC-150');

-- AEC-160  (fan)  Astberg AEC 160 Inline Fan with Speed Controller
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 8806.78, 9281.60
FROM products p
WHERE p.sku = 'AEC-160'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 9281.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 16490.00, default_unit_price = 13690.00 WHERE sku = 'AEC-160';
UPDATE product_costs SET cost_price = 9281.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEC-160');

-- AEC-200  (fan)  Astberg AEC 200 Inline Fan with Speed Controller
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 11857.63, 12400.00
FROM products p
WHERE p.sku = 'AEC-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 12400.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 21990.00, default_unit_price = 18290.00 WHERE sku = 'AEC-200';
UPDATE product_costs SET cost_price = 12400.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEC-200');

-- AMJ-100B  (fan)  Astberg AMJ 100B Micro Jet Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 3179.66, 3315.20
FROM products p
WHERE p.sku = 'AMJ-100B'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 3315.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 6090.00, default_unit_price = 4890.00 WHERE sku = 'AMJ-100B';
UPDATE product_costs SET cost_price = 3315.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AMJ-100B');

-- ADD-100-125  (fan)  Astberg ADD 100/125 Mix Flow Silent Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 9484.75, 9756.00
FROM products p
WHERE p.sku = 'ADD-100-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 9756.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 17490.00, default_unit_price = 14390.00 WHERE sku = 'ADD-100-125';
UPDATE product_costs SET cost_price = 9756.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-100-125');

-- ADD-150-FAN  (fan)  Astberg ADD 150 Mix Flow Silent Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 11179.66, 11722.40
FROM products p
WHERE p.sku = 'ADD-150-FAN'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 11722.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 20790.00, default_unit_price = 17290.00 WHERE sku = 'ADD-150-FAN';
UPDATE product_costs SET cost_price = 11722.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-150-FAN');

-- ADD-200-FAN  (fan)  Astberg ADD 200 Mix Flow Silent Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 14230.51, 15180.00
FROM products p
WHERE p.sku = 'ADD-200-FAN'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 15180.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 26890.00, default_unit_price = 22390.00 WHERE sku = 'ADD-200-FAN';
UPDATE product_costs SET cost_price = 15180.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-200-FAN');

-- AHT-15-34  (fan)  Astberg AHT 15-34 Metal Kitchen Circular Inline Duct Blower Ventilation Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5416.95, 5688.00
FROM products p
WHERE p.sku = 'AHT-15-34'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5688.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 10390.00, default_unit_price = 8390.00 WHERE sku = 'AHT-15-34';
UPDATE product_costs SET cost_price = 5688.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHT-15-34');

-- AHT-20-55  (fan)  Astberg AHT 20-55 Metal Kitchen Circular Inline Duct Blower Ventilation Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 10840.68, 11518.40
FROM products p
WHERE p.sku = 'AHT-20-55'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 11518.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 20690.00, default_unit_price = 16990.00 WHERE sku = 'AHT-20-55';
UPDATE product_costs SET cost_price = 11518.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHT-20-55');

-- AHT-20-65B  (fan)  Astberg AHT 20-65B Metal Kitchen Circular Inline Duct Blower Ventilation Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 12874.58, 13552.80
FROM products p
WHERE p.sku = 'AHT-20-65B'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 13552.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 24790.00, default_unit_price = 19990.00 WHERE sku = 'AHT-20-65B';
UPDATE product_costs SET cost_price = 13552.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHT-20-65B');

-- ASE-1003  (fan)  Astberg ASE 1003 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5416.95, 5688.00
FROM products p
WHERE p.sku = 'ASE-1003'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5688.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 10390.00, default_unit_price = 8390.00 WHERE sku = 'ASE-1003';
UPDATE product_costs SET cost_price = 5688.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASE-1003');

-- ASE-1501  (fan)  Astberg ASE 1501 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6094.92, 6366.40
FROM products p
WHERE p.sku = 'ASE-1501'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6366.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 11290.00, default_unit_price = 9390.00 WHERE sku = 'ASE-1501';
UPDATE product_costs SET cost_price = 6366.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASE-1501');

-- ASE-1502  (fan)  Astberg ASE 1502 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6094.92, 6366.40
FROM products p
WHERE p.sku = 'ASE-1502'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6366.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 11290.00, default_unit_price = 9390.00 WHERE sku = 'ASE-1502';
UPDATE product_costs SET cost_price = 6366.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASE-1502');

-- ASE-1503  (fan)  Astberg ASE 1503 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6433.90, 6704.80
FROM products p
WHERE p.sku = 'ASE-1503'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6704.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 11990.00, default_unit_price = 9890.00 WHERE sku = 'ASE-1503';
UPDATE product_costs SET cost_price = 6704.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASE-1503');

-- ASP-1001  (fan)  Astberg ASP 1001 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4942.37, 5145.60
FROM products p
WHERE p.sku = 'ASP-1001'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5145.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9190.00, default_unit_price = 7590.00 WHERE sku = 'ASP-1001';
UPDATE product_costs SET cost_price = 5145.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASP-1001');

-- ASP-1002  (fan)  Astberg ASP 1002 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4942.37, 5145.60
FROM products p
WHERE p.sku = 'ASP-1002'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5145.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9190.00, default_unit_price = 7590.00 WHERE sku = 'ASP-1002';
UPDATE product_costs SET cost_price = 5145.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASP-1002');

-- ASP-1010  (fan)  Astberg ASP 1010 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5145.76, 5383.20
FROM products p
WHERE p.sku = 'ASP-1010'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5383.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9590.00, default_unit_price = 7940.00 WHERE sku = 'ASP-1010';
UPDATE product_costs SET cost_price = 5383.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASP-1010');

-- ASP-5050  (fan)  Astberg ASP 5050 Ceiling Mount Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 7111.86, 7451.20
FROM products p
WHERE p.sku = 'ASP-5050'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 7451.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 13490.00, default_unit_price = 10990.00 WHERE sku = 'ASP-5050';
UPDATE product_costs SET cost_price = 7451.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASP-5050');

-- ASP-MOTION-SENSOR  (fan)  Astberg Motion Sensor with Timer (optional add-on)
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2705.08, 2840.80
FROM products p
WHERE p.sku = 'ASP-MOTION-SENSOR'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2840.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 5290.00, default_unit_price = 4190.00 WHERE sku = 'ASP-MOTION-SENSOR';
UPDATE product_costs SET cost_price = 2840.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASP-MOTION-SENSOR');

-- APT-10-21S  (fan)  Astberg APT 10-21S Ceiling Mount Cassette Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 3383.05, 3654.40
FROM products p
WHERE p.sku = 'APT-10-21S'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 3654.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 6690.00, default_unit_price = 5390.00 WHERE sku = 'APT-10-21S';
UPDATE product_costs SET cost_price = 3654.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APT-10-21S');

-- APT-10-24SL  (fan)  Astberg APT 10-24SL Ceiling Mount Cassette Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 3654.24, 3959.20
FROM products p
WHERE p.sku = 'APT-10-24SL'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 3959.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 7290.00, default_unit_price = 5840.00 WHERE sku = 'APT-10-24SL';
UPDATE product_costs SET cost_price = 3959.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APT-10-24SL');

-- APT-15-27SL  (fan)  Astberg APT 15-27SL Ceiling Mount Cassette Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4874.58, 5145.60
FROM products p
WHERE p.sku = 'APT-15-27SL'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5145.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9490.00, default_unit_price = 7590.00 WHERE sku = 'APT-15-27SL';
UPDATE product_costs SET cost_price = 5145.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APT-15-27SL');

-- ASL-1005  (fan)  Astberg ASL 1005 Ceiling Mounted Exhaust Fan with Light
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6772.88, 6772.80
FROM products p
WHERE p.sku = 'ASL-1005'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6772.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 12490.00, default_unit_price = 9990.00 WHERE sku = 'ASL-1005';
UPDATE product_costs SET cost_price = 6772.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASL-1005');

-- AHA-12  (fan)  Astberg AHA 12 Propeller Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4738.98, 5010.40
FROM products p
WHERE p.sku = 'AHA-12'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5010.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9090.00, default_unit_price = 7390.00 WHERE sku = 'AHA-12';
UPDATE product_costs SET cost_price = 5010.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHA-12');

-- AHA-14  (fan)  Astberg AHA 14 Propeller Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5416.95, 5756.00
FROM products p
WHERE p.sku = 'AHA-14'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5756.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 10490.00, default_unit_price = 8490.00 WHERE sku = 'AHA-14';
UPDATE product_costs SET cost_price = 5756.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHA-14');

-- AHA-16  (fan)  Astberg AHA 16 Propeller Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6433.90, 6772.80
FROM products p
WHERE p.sku = 'AHA-16'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6772.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 11990.00, default_unit_price = 9990.00 WHERE sku = 'AHA-16';
UPDATE product_costs SET cost_price = 6772.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHA-16');

-- AHA-20  (fan)  Astberg AHA 20 Propeller Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 10162.71, 10637.60
FROM products p
WHERE p.sku = 'AHA-20'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 10637.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 18890.00, default_unit_price = 15690.00 WHERE sku = 'AHA-20';
UPDATE product_costs SET cost_price = 10637.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHA-20');

-- AHA-26  (fan)  Astberg AHA 26 Propeller Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 12535.59, 12874.40
FROM products p
WHERE p.sku = 'AHA-26'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 12874.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 22990.00, default_unit_price = 18990.00 WHERE sku = 'AHA-26';
UPDATE product_costs SET cost_price = 12874.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHA-26');

-- AHI-75SD  (fan)  Astberg AHI 75SD Booster Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1620.34, 1756.00
FROM products p
WHERE p.sku = 'AHI-75SD'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1756.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3390.00, default_unit_price = 2590.00 WHERE sku = 'AHI-75SD';
UPDATE product_costs SET cost_price = 1756.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHI-75SD');

-- AHI-100SD  (fan)  Astberg AHI 100SD Booster Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1823.73, 1959.20
FROM products p
WHERE p.sku = 'AHI-100SD'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1959.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3590.00, default_unit_price = 2890.00 WHERE sku = 'AHI-100SD';
UPDATE product_costs SET cost_price = 1959.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHI-100SD');

-- AHI-150SD  (fan)  Astberg AHI 150SD Booster Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2366.10, 2569.60
FROM products p
WHERE p.sku = 'AHI-150SD'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2569.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 4590.00, default_unit_price = 3790.00 WHERE sku = 'AHI-150SD';
UPDATE product_costs SET cost_price = 2569.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHI-150SD');

-- AHI-200SD  (fan)  Astberg AHI 200SD Booster Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 3789.83, 4060.80
FROM products p
WHERE p.sku = 'AHI-200SD'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 4060.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 7290.00, default_unit_price = 5990.00 WHERE sku = 'AHI-200SD';
UPDATE product_costs SET cost_price = 4060.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHI-200SD');

-- AFP-350R  (fan)  Astberg AFP 350R 2-IN-1 Fresh Air Box
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 18976.27, 18976.00
FROM products p
WHERE p.sku = 'AFP-350R'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 18976.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 34490.00, default_unit_price = 27990.00 WHERE sku = 'AFP-350R';
UPDATE product_costs SET cost_price = 18976.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFP-350R');

-- AFV-45DF  (fan)  Astberg AFV 45DF Fresh Air Purifier
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 15586.44, 16264.80
FROM products p
WHERE p.sku = 'AFV-45DF'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 16264.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 29490.00, default_unit_price = 23990.00 WHERE sku = 'AFV-45DF';
UPDATE product_costs SET cost_price = 16264.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFV-45DF');

-- AFV-75DF  (fan)  Astberg AFV 75DF Fresh Air Purifier
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 18976.27, 19451.20
FROM products p
WHERE p.sku = 'AFV-75DF'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 19451.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 35990.00, default_unit_price = 28690.00 WHERE sku = 'AFV-75DF';
UPDATE product_costs SET cost_price = 19451.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFV-75DF');

-- ASF-25  (fan)  Astberg ASF 25 Ultra Slim Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6772.88, 7383.20
FROM products p
WHERE p.sku = 'ASF-25'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 7383.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 13490.00, default_unit_price = 10890.00 WHERE sku = 'ASF-25';
UPDATE product_costs SET cost_price = 7383.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASF-25');

-- AFV-15DP  (fan)  Astberg AFV 15DP Cabinet Fan with Pre-Filter
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 10162.71, 10433.60
FROM products p
WHERE p.sku = 'AFV-15DP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 10433.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 18990.00, default_unit_price = 15390.00 WHERE sku = 'AFV-15DP';
UPDATE product_costs SET cost_price = 10433.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFV-15DP');

-- AFV-18DP  (fan)  Astberg AFV 18DP Cabinet Fan with Pre-Filter
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 11518.64, 11722.40
FROM products p
WHERE p.sku = 'AFV-18DP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 11722.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 21990.00, default_unit_price = 17290.00 WHERE sku = 'AFV-18DP';
UPDATE product_costs SET cost_price = 11722.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFV-18DP');

-- AFV-19DP  (fan)  Astberg AFV 19DP Cabinet Fan with Pre-Filter
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 12196.61, 12874.40
FROM products p
WHERE p.sku = 'AFV-19DP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 12874.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 23290.00, default_unit_price = 18990.00 WHERE sku = 'AFV-19DP';
UPDATE product_costs SET cost_price = 12874.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFV-19DP');

-- AFV-23DP  (fan)  Astberg AFV 23DP Cabinet Fan with Pre-Filter
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 18637.29, 19654.40
FROM products p
WHERE p.sku = 'AFV-23DP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 19654.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 35290.00, default_unit_price = 28990.00 WHERE sku = 'AFV-23DP';
UPDATE product_costs SET cost_price = 19654.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFV-23DP');

-- AFV-28DP  (fan)  Astberg AFV 28DP Cabinet Fan with Pre-Filter
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 24061.02, 25416.80
FROM products p
WHERE p.sku = 'AFV-28DP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 25416.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 45290.00, default_unit_price = 37490.00 WHERE sku = 'AFV-28DP';
UPDATE product_costs SET cost_price = 25416.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFV-28DP');

-- ABF-30P  (fan)  Astberg ABF 30P Air Box Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 35925.42, 37281.60
FROM products p
WHERE p.sku = 'ABF-30P'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 37281.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 65990.00, default_unit_price = 54990.00 WHERE sku = 'ABF-30P';
UPDATE product_costs SET cost_price = 37281.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ABF-30P');

-- ABF-50P  (fan)  Astberg ABF 50P Air Box Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 47450.85, 48806.40
FROM products p
WHERE p.sku = 'ABF-50P'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 48806.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 86390.00, default_unit_price = 71990.00 WHERE sku = 'ABF-50P';
UPDATE product_costs SET cost_price = 48806.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ABF-50P');

-- ASHT-250  (fan)  Astberg ASHT 250 Portable Blower Fan + 5m Duct
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 10501.69, 11518.40
FROM products p
WHERE p.sku = 'ASHT-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 11518.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 20490.00, default_unit_price = 16990.00 WHERE sku = 'ASHT-250';
UPDATE product_costs SET cost_price = 11518.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASHT-250');

-- ASHT-300  (fan)  Astberg ASHT 300 Portable Blower Fan + 5m Duct
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 11518.64, 12060.80
FROM products p
WHERE p.sku = 'ASHT-300'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 12060.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 21990.00, default_unit_price = 17790.00 WHERE sku = 'ASHT-300';
UPDATE product_costs SET cost_price = 12060.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASHT-300');

-- ASHT-DUCT-12-10M  (fan)  Astberg 12 inch Duct (10 metre) for ASHT
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6094.92, 6298.40
FROM products p
WHERE p.sku = 'ASHT-DUCT-12-10M'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6298.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 11390.00, default_unit_price = 9290.00 WHERE sku = 'ASHT-DUCT-12-10M';
UPDATE product_costs SET cost_price = 6298.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASHT-DUCT-12-10M');

-- ARMD-12  (fan)  Astberg ARMD 12 Roof and Wall Exhaust Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 22366.10, 23722.40
FROM products p
WHERE p.sku = 'ARMD-12'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 23722.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 42990.00, default_unit_price = 34990.00 WHERE sku = 'ARMD-12';
UPDATE product_costs SET cost_price = 23722.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARMD-12');

-- ARMD-14  (fan)  Astberg ARMD 14 Roof and Wall Exhaust Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 24400.00, 26095.20
FROM products p
WHERE p.sku = 'ARMD-14'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 26095.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 46990.00, default_unit_price = 38490.00 WHERE sku = 'ARMD-14';
UPDATE product_costs SET cost_price = 26095.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARMD-14');

-- ARMD-18  (fan)  Astberg ARMD 18 Roof and Wall Exhaust Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 33891.53, 35925.60
FROM products p
WHERE p.sku = 'ARMD-18'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 35925.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 64490.00, default_unit_price = 52990.00 WHERE sku = 'ARMD-18';
UPDATE product_costs SET cost_price = 35925.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARMD-18');

-- AL-30  (fan)  Astberg AL 30 Exhaust Fan with Light
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 4738.98, 4739.20
FROM products p
WHERE p.sku = 'AL-30'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 4739.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 8490.00, default_unit_price = 6990.00 WHERE sku = 'AL-30';
UPDATE product_costs SET cost_price = 4739.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AL-30');

-- AURA-6C-03  (fan)  Astberg Aura 6C-03 Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5416.95, 5416.80
FROM products p
WHERE p.sku = 'AURA-6C-03'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5416.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 9590.00, default_unit_price = 7990.00 WHERE sku = 'AURA-6C-03';
UPDATE product_costs SET cost_price = 5416.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AURA-6C-03');

-- DISC-4C  (fan)  Astberg Disc 4C Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1484.75, 1484.80
FROM products p
WHERE p.sku = 'DISC-4C'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1484.80
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2890.00, default_unit_price = 2190.00 WHERE sku = 'DISC-4C';
UPDATE product_costs SET cost_price = 1484.80, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'DISC-4C');

-- SLIM-6C  (fan)  Astberg Slim 6C Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2366.10, 2366.40
FROM products p
WHERE p.sku = 'SLIM-6C'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2366.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 4190.00, default_unit_price = 3490.00 WHERE sku = 'SLIM-6C';
UPDATE product_costs SET cost_price = 2366.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'SLIM-6C');

-- EURO-4A  (fan)  Astberg Euro 4A Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2569.49, 2569.60
FROM products p
WHERE p.sku = 'EURO-4A'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2569.60
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 4990.00, default_unit_price = 3790.00 WHERE sku = 'EURO-4A';
UPDATE product_costs SET cost_price = 2569.60, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'EURO-4A');

-- EURO-6A  (fan)  Astberg Euro 6A Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 3383.05, 3383.20
FROM products p
WHERE p.sku = 'EURO-6A'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 3383.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 6090.00, default_unit_price = 4990.00 WHERE sku = 'EURO-6A';
UPDATE product_costs SET cost_price = 3383.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'EURO-6A');

-- RIO-4C  (fan)  Astberg Rio 4C Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2298.31, 2298.40
FROM products p
WHERE p.sku = 'RIO-4C'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2298.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 4090.00, default_unit_price = 3390.00 WHERE sku = 'RIO-4C';
UPDATE product_costs SET cost_price = 2298.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'RIO-4C');

-- E150-SC  (fan)  Astberg E 150 SC Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2094.92, 2095.20
FROM products p
WHERE p.sku = 'E150-SC'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2095.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3790.00, default_unit_price = 3090.00 WHERE sku = 'E150-SC';
UPDATE product_costs SET cost_price = 2095.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'E150-SC');

-- NEO-6SC  (fan)  Astberg Neo 6SC Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2162.71, 2162.40
FROM products p
WHERE p.sku = 'NEO-6SC'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2162.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3990.00, default_unit_price = 3190.00 WHERE sku = 'NEO-6SC';
UPDATE product_costs SET cost_price = 2162.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'NEO-6SC');

-- ERA-6C  (fan)  Astberg Era 6C Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2162.71, 2162.40
FROM products p
WHERE p.sku = 'ERA-6C'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2162.40
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3990.00, default_unit_price = 3190.00 WHERE sku = 'ERA-6C';
UPDATE product_costs SET cost_price = 2162.40, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ERA-6C');

-- QUADRO-4C  (fan)  Astberg Quadro 4C Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1823.73, 1824.00
FROM products p
WHERE p.sku = 'QUADRO-4C'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1824.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3390.00, default_unit_price = 2690.00 WHERE sku = 'QUADRO-4C';
UPDATE product_costs SET cost_price = 1824.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'QUADRO-4C');

-- QUADRO-5C  (fan)  Astberg Quadro 5C Domestic Fan
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2094.92, 2095.20
FROM products p
WHERE p.sku = 'QUADRO-5C'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2095.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3890.00, default_unit_price = 3090.00 WHERE sku = 'QUADRO-5C';
UPDATE product_costs SET cost_price = 2095.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'QUADRO-5C');

-- ADD-75  (acc)  Astberg ABS Disk Diffuser ADD 75mm / 3 inch
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 254.24, 271.18
FROM products p
WHERE p.sku = 'ADD-75'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 271.18
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 480.00, default_unit_price = 400.00 WHERE sku = 'ADD-75';
UPDATE product_costs SET cost_price = 271.18, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-75');

-- ADD-100  (acc)  Astberg ABS Disk Diffuser ADD 100mm / 4 inch
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 277.97, 294.91
FROM products p
WHERE p.sku = 'ADD-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 294.91
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 520.00, default_unit_price = 435.00 WHERE sku = 'ADD-100';
UPDATE product_costs SET cost_price = 294.91, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-100');

-- ADD-125  (acc)  Astberg ABS Disk Diffuser ADD 125mm / 5 inch
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 349.15, 369.49
FROM products p
WHERE p.sku = 'ADD-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 369.49
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 660.00, default_unit_price = 545.00 WHERE sku = 'ADD-125';
UPDATE product_costs SET cost_price = 369.49, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-125');

-- ADD-150  (acc)  Astberg ABS Disk Diffuser ADD 150mm / 6 inch
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 383.05, 406.78
FROM products p
WHERE p.sku = 'ADD-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 406.78
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 725.00, default_unit_price = 600.00 WHERE sku = 'ADD-150';
UPDATE product_costs SET cost_price = 406.78, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-150');

-- ADD-200  (acc)  Astberg ABS Disk Diffuser ADD 200mm / 8 inch
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 474.58, 501.70
FROM products p
WHERE p.sku = 'ADD-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 501.70
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 920.00, default_unit_price = 740.00 WHERE sku = 'ADD-200';
UPDATE product_costs SET cost_price = 501.70, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ADD-200');

-- APP-100A  (acc)  Astberg APP 100A Round Air Outlet
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 467.80, 494.91
FROM products p
WHERE p.sku = 'APP-100A'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 494.91
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 920.00, default_unit_price = 730.00 WHERE sku = 'APP-100A';
UPDATE product_costs SET cost_price = 494.91, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APP-100A');

-- ASD-100  (acc)  Astberg ASD 100 — 3-Step Diffuser 100mm / 4 inch
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 559.32, 576.27
FROM products p
WHERE p.sku = 'ASD-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 576.27
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1025.00, default_unit_price = 850.00 WHERE sku = 'ASD-100';
UPDATE product_costs SET cost_price = 576.27, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASD-100');

-- ASD-150  (acc)  Astberg ASD 150 — 3-Step Diffuser 150mm / 6 inch
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 661.02, 677.97
FROM products p
WHERE p.sku = 'ASD-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 677.97
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1250.00, default_unit_price = 1000.00 WHERE sku = 'ASD-150';
UPDATE product_costs SET cost_price = 677.97, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASD-150');

-- ARD-100  (acc)  Astberg ARD 100 Rotating Grill Diffuser 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 322.03, 338.98
FROM products p
WHERE p.sku = 'ARD-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 338.98
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 600.00, default_unit_price = 500.00 WHERE sku = 'ARD-100';
UPDATE product_costs SET cost_price = 338.98, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-100');

-- ARD-125  (acc)  Astberg ARD 125 Rotating Grill Diffuser 125mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 359.32, 379.66
FROM products p
WHERE p.sku = 'ARD-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 379.66
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 680.00, default_unit_price = 560.00 WHERE sku = 'ARD-125';
UPDATE product_costs SET cost_price = 379.66, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-125');

-- ARD-150  (acc)  Astberg ARD 150 Rotating Grill Diffuser 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 389.83, 413.56
FROM products p
WHERE p.sku = 'ARD-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 413.56
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 760.00, default_unit_price = 610.00 WHERE sku = 'ARD-150';
UPDATE product_costs SET cost_price = 413.56, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-150');

-- ARG-75  (acc)  Astberg ARG 75 Round Grill 75mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 254.24, 271.18
FROM products p
WHERE p.sku = 'ARG-75'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 271.18
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 480.00, default_unit_price = 400.00 WHERE sku = 'ARG-75';
UPDATE product_costs SET cost_price = 271.18, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARG-75');

-- ARG-100  (acc)  Astberg ARG 100 Round Grill 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 277.97, 294.91
FROM products p
WHERE p.sku = 'ARG-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 294.91
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 520.00, default_unit_price = 435.00 WHERE sku = 'ARG-100';
UPDATE product_costs SET cost_price = 294.91, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARG-100');

-- ARG-125  (acc)  Astberg ARG 125 Round Grill 125mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 349.15, 369.49
FROM products p
WHERE p.sku = 'ARG-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 369.49
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 660.00, default_unit_price = 545.00 WHERE sku = 'ARG-125';
UPDATE product_costs SET cost_price = 369.49, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARG-125');

-- ARG-150  (acc)  Astberg ARG 150 Round Grill 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 389.83, 413.56
FROM products p
WHERE p.sku = 'ARG-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 413.56
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 760.00, default_unit_price = 610.00 WHERE sku = 'ARG-150';
UPDATE product_costs SET cost_price = 413.56, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARG-150');

-- ARG-200  (acc)  Astberg ARG 200 Round Grill 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 474.58, 501.70
FROM products p
WHERE p.sku = 'ARG-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 501.70
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 920.00, default_unit_price = 740.00 WHERE sku = 'ARG-200';
UPDATE product_costs SET cost_price = 501.70, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARG-200');

-- ARG-150P  (acc)  Astberg ARG 150P Round Grill 150mm — Grey Color
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 406.78, 430.51
FROM products p
WHERE p.sku = 'ARG-150P'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 430.51
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 765.00, default_unit_price = 635.00 WHERE sku = 'ARG-150P';
UPDATE product_costs SET cost_price = 430.51, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARG-150P');

-- AYJ-100  (acc)  Astberg AYJ 100 Y Joint PVC 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 318.64, 338.98
FROM products p
WHERE p.sku = 'AYJ-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 338.98
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 600.00, default_unit_price = 500.00 WHERE sku = 'AYJ-100';
UPDATE product_costs SET cost_price = 338.98, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AYJ-100');

-- AYJ-150  (acc)  Astberg AYJ 150 Y Joint PVC 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 355.93, 379.66
FROM products p
WHERE p.sku = 'AYJ-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 379.66
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 680.00, default_unit_price = 560.00 WHERE sku = 'AYJ-150';
UPDATE product_costs SET cost_price = 379.66, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AYJ-150');

-- ASC-100  (acc)  Astberg ASC 100 Outer Steel Cowl SS304 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 461.02, 488.14
FROM products p
WHERE p.sku = 'ASC-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 488.14
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 900.00, default_unit_price = 720.00 WHERE sku = 'ASC-100';
UPDATE product_costs SET cost_price = 488.14, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASC-100');

-- ASC-150  (acc)  Astberg ASC 150 Outer Steel Cowl SS304 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 596.61, 630.51
FROM products p
WHERE p.sku = 'ASC-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 630.51
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1150.00, default_unit_price = 930.00 WHERE sku = 'ASC-150';
UPDATE product_costs SET cost_price = 630.51, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASC-150');

-- ASC-200  (acc)  Astberg ASC 200 Outer Steel Cowl SS304 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 983.05, 1040.68
FROM products p
WHERE p.sku = 'ASC-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1040.68
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1930.00, default_unit_price = 1535.00 WHERE sku = 'ASC-200';
UPDATE product_costs SET cost_price = 1040.68, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASC-200');

-- ASC-250  (acc)  Astberg ASC 250 Outer Steel Cowl SS304 250mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2027.12, 2135.59
FROM products p
WHERE p.sku = 'ASC-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2135.59
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 4250.00, default_unit_price = 3150.00 WHERE sku = 'ASC-250';
UPDATE product_costs SET cost_price = 2135.59, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASC-250');

-- ASC-100-P  (acc)  Astberg ASC 100 P Outer Steel Cowl Powder Coated SUS304 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 738.98, 779.66
FROM products p
WHERE p.sku = 'ASC-100-P'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 779.66
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1480.00, default_unit_price = 1150.00 WHERE sku = 'ASC-100-P';
UPDATE product_costs SET cost_price = 779.66, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASC-100-P');

-- ASC-150-P  (acc)  Astberg ASC 150 P Outer Steel Cowl Powder Coated SUS304 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1050.85, 1111.86
FROM products p
WHERE p.sku = 'ASC-150-P'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1111.86
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2050.00, default_unit_price = 1640.00 WHERE sku = 'ASC-150-P';
UPDATE product_costs SET cost_price = 1111.86, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASC-150-P');

-- ASC-200-P  (acc)  Astberg ASC 200 P Outer Steel Cowl Powder Coated SUS304 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1633.90, 1728.82
FROM products p
WHERE p.sku = 'ASC-200-P'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1728.82
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3175.00, default_unit_price = 2550.00 WHERE sku = 'ASC-200-P';
UPDATE product_costs SET cost_price = 1728.82, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASC-200-P');

-- AWC-100  (acc)  Astberg AWC 100 ABS Wall Cowl 100mm
UPDATE products SET mrp = 1390.00, default_unit_price = 1100.00 WHERE sku = 'AWC-100';
UPDATE product_costs SET cost_price = 745.76, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AWC-100');

-- AWC-150  (acc)  Astberg AWC 150 ABS Wall Cowl 150mm
UPDATE products SET mrp = 1790.00, default_unit_price = 1450.00 WHERE sku = 'AWC-150';
UPDATE product_costs SET cost_price = 983.05, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AWC-150');

-- ASG-100  (acc)  Astberg ASG 100 Outer Flat Grill Steel 100mm (Bird Mesh Inside)
UPDATE products SET mrp = 790.00, default_unit_price = 625.00 WHERE sku = 'ASG-100';
UPDATE product_costs SET cost_price = 423.73, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASG-100');

-- ASG-150  (acc)  Astberg ASG 150 Outer Flat Grill Steel 150mm (Bird Mesh Inside)
UPDATE products SET mrp = 1090.00, default_unit_price = 875.00 WHERE sku = 'ASG-150';
UPDATE product_costs SET cost_price = 593.22, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASG-150');

-- ASG-100P  (acc)  Astberg ASG 100P Outer Flat Grill Steel Powder Coated 100mm
UPDATE products SET mrp = 890.00, default_unit_price = 725.00 WHERE sku = 'ASG-100P';
UPDATE product_costs SET cost_price = 491.53, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASG-100P');

-- ASG-150P  (acc)  Astberg ASG 150P Outer Flat Grill Steel Powder Coated 150mm
UPDATE products SET mrp = 1190.00, default_unit_price = 975.00 WHERE sku = 'ASG-150P';
UPDATE product_costs SET cost_price = 661.02, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASG-150P');

-- AVG-100  (acc)  Astberg AVG 100 Varanda Grill 100mm (Outer Grill ABS, Mesh Inside)
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 355.93, 355.94
FROM products p
WHERE p.sku = 'AVG-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 355.94
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 690.00, default_unit_price = 525.00 WHERE sku = 'AVG-100';
UPDATE product_costs SET cost_price = 355.94, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AVG-100');

-- AVG-150  (acc)  Astberg AVG 150 Varanda Grill 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 355.93, 355.94
FROM products p
WHERE p.sku = 'AVG-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 355.94
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 690.00, default_unit_price = 525.00 WHERE sku = 'AVG-150';
UPDATE product_costs SET cost_price = 355.94, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AVG-150');

-- APF-100  (acc)  Astberg APF 100 ABS Pre Filter 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 762.71, 813.56
FROM products p
WHERE p.sku = 'APF-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 813.56
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1575.00, default_unit_price = 1200.00 WHERE sku = 'APF-100';
UPDATE product_costs SET cost_price = 813.56, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APF-100');

-- APF-150  (acc)  Astberg APF 150 ABS Pre Filter 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 901.69, 955.94
FROM products p
WHERE p.sku = 'APF-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 955.94
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1800.00, default_unit_price = 1410.00 WHERE sku = 'APF-150';
UPDATE product_costs SET cost_price = 955.94, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APF-150');

-- AEB-75  (acc)  Astberg AEB 75 ABS Ball Jet Nozzle 75mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 711.86, 752.54
FROM products p
WHERE p.sku = 'AEB-75'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 752.54
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1390.00, default_unit_price = 1110.00 WHERE sku = 'AEB-75';
UPDATE product_costs SET cost_price = 752.54, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-75');

-- AEB-100  (acc)  Astberg AEB 100 ABS Ball Jet Nozzle 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 745.76, 786.44
FROM products p
WHERE p.sku = 'AEB-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 786.44
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1490.00, default_unit_price = 1160.00 WHERE sku = 'AEB-100';
UPDATE product_costs SET cost_price = 786.44, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-100');

-- AEB-150  (acc)  Astberg AEB 150 ABS Ball Jet Nozzle 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1288.14, 1362.71
FROM products p
WHERE p.sku = 'AEB-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1362.71
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2490.00, default_unit_price = 2010.00 WHERE sku = 'AEB-150';
UPDATE product_costs SET cost_price = 1362.71, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-150');

-- AEB-200  (acc)  Astberg AEB 200 ABS Ball Jet Nozzle 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1491.53, 1583.05
FROM products p
WHERE p.sku = 'AEB-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1583.05
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2890.00, default_unit_price = 2335.00 WHERE sku = 'AEB-200';
UPDATE product_costs SET cost_price = 1583.05, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-200');

-- AEB-250  (acc)  Astberg AEB 250 ABS Ball Jet Nozzle 250mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1898.31, 2016.95
FROM products p
WHERE p.sku = 'AEB-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2016.95
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3590.00, default_unit_price = 2975.00 WHERE sku = 'AEB-250';
UPDATE product_costs SET cost_price = 2016.95, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-250');

-- AEB-315  (acc)  Astberg AEB 315 ABS Ball Jet Nozzle 315mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2372.88, 2515.26
FROM products p
WHERE p.sku = 'AEB-315'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2515.26
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 4490.00, default_unit_price = 3710.00 WHERE sku = 'AEB-315';
UPDATE product_costs SET cost_price = 2515.26, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-315');

-- AEB-350  (acc)  Astberg AEB 350 ABS Ball Jet Nozzle 350mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2474.58, 2627.12
FROM products p
WHERE p.sku = 'AEB-350'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2627.12
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 4690.00, default_unit_price = 3875.00 WHERE sku = 'AEB-350';
UPDATE product_costs SET cost_price = 2627.12, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-350');

-- AEB-400  (acc)  Astberg AEB 400 ABS Ball Jet Nozzle 400mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2813.56, 2983.05
FROM products p
WHERE p.sku = 'AEB-400'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2983.05
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 5290.00, default_unit_price = 4400.00 WHERE sku = 'AEB-400';
UPDATE product_costs SET cost_price = 2983.05, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AEB-400');

-- AGD-110  (acc)  Astberg AGD 110 Gravity Damper 110mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 288.14, 305.09
FROM products p
WHERE p.sku = 'AGD-110'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 305.09
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 560.00, default_unit_price = 450.00 WHERE sku = 'AGD-110';
UPDATE product_costs SET cost_price = 305.09, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AGD-110');

-- AGD-150  (acc)  Astberg AGD 150 Gravity Damper 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 338.98, 359.32
FROM products p
WHERE p.sku = 'AGD-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 359.32
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 690.00, default_unit_price = 530.00 WHERE sku = 'AGD-150';
UPDATE product_costs SET cost_price = 359.32, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AGD-150');

-- APB-100  (acc)  Astberg APB 100 Air Purification Box 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5416.95, 5755.94
FROM products p
WHERE p.sku = 'APB-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 5755.94
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 10490.00, default_unit_price = 8490.00 WHERE sku = 'APB-100';
UPDATE product_costs SET cost_price = 5755.94, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APB-100');

-- APB-150  (acc)  Astberg APB 150 Air Purification Box 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 6094.92, 6433.90
FROM products p
WHERE p.sku = 'APB-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6433.90
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 12490.00, default_unit_price = 9490.00 WHERE sku = 'APB-150';
UPDATE product_costs SET cost_price = 6433.90, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APB-150');

-- APB-200  (acc)  Astberg APB 200 Air Purification Box 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 12671.19, 13416.95
FROM products p
WHERE p.sku = 'APB-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 13416.95
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 23790.00, default_unit_price = 19790.00 WHERE sku = 'APB-200';
UPDATE product_costs SET cost_price = 13416.95, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APB-200');

-- APB-250  (acc)  Astberg APB 250 Air Purification Box 250mm — UV Light Filter Box
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 14230.51, 15118.65
FROM products p
WHERE p.sku = 'APB-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 15118.65
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 26990.00, default_unit_price = 22300.00 WHERE sku = 'APB-250';
UPDATE product_costs SET cost_price = 15118.65, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'APB-250');

-- AVC-100  (acc)  Astberg AVC 100 ABS Air Volume Control Valve 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 406.78, 430.51
FROM products p
WHERE p.sku = 'AVC-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 430.51
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 790.00, default_unit_price = 635.00 WHERE sku = 'AVC-100';
UPDATE product_costs SET cost_price = 430.51, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AVC-100');

-- AVC-150  (acc)  Astberg AVC 150 ABS Air Volume Control Valve 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 474.58, 501.70
FROM products p
WHERE p.sku = 'AVC-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 501.70
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 920.00, default_unit_price = 740.00 WHERE sku = 'AVC-150';
UPDATE product_costs SET cost_price = 501.70, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AVC-150');

-- AVC-200  (acc)  Astberg AVC 200 ABS Air Volume Control Valve 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 542.37, 576.27
FROM products p
WHERE p.sku = 'AVC-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 576.27
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1025.00, default_unit_price = 850.00 WHERE sku = 'AVC-200';
UPDATE product_costs SET cost_price = 576.27, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AVC-200');

-- ABC-100  (acc)  Astberg ABC 100 Beam Crosser Lantel Device Adaptor 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1288.14, 1389.83
FROM products p
WHERE p.sku = 'ABC-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1389.83
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2575.00, default_unit_price = 2050.00 WHERE sku = 'ABC-100';
UPDATE product_costs SET cost_price = 1389.83, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ABC-100');

-- ABC-150  (acc)  Astberg ABC 150 Beam Crosser Lantel Device Adaptor 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1677.97, 1796.61
FROM products p
WHERE p.sku = 'ABC-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1796.61
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3310.00, default_unit_price = 2650.00 WHERE sku = 'ABC-150';
UPDATE product_costs SET cost_price = 1796.61, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ABC-150');

-- ALM-100  (acc)  Astberg ALM 100 Aluminium Flexible Duct 100mm — 3 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 406.78, 440.68
FROM products p
WHERE p.sku = 'ALM-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 440.68
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 800.00, default_unit_price = 650.00 WHERE sku = 'ALM-100';
UPDATE product_costs SET cost_price = 440.68, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ALM-100');

-- ALM-125  (acc)  Astberg ALM 125 Aluminium Flexible Duct 125mm — 3 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 447.46, 491.53
FROM products p
WHERE p.sku = 'ALM-125'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 491.53
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 900.00, default_unit_price = 725.00 WHERE sku = 'ALM-125';
UPDATE product_costs SET cost_price = 491.53, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ALM-125');

-- ALM-150  (acc)  Astberg ALM 150 Aluminium Flexible Duct 150mm — 3 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 535.59, 576.27
FROM products p
WHERE p.sku = 'ALM-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 576.27
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1025.00, default_unit_price = 850.00 WHERE sku = 'ALM-150';
UPDATE product_costs SET cost_price = 576.27, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ALM-150');

-- ALM-200  (acc)  Astberg ALM 200 Aluminium Flexible Duct 200mm — 3 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 813.56, 881.35
FROM products p
WHERE p.sku = 'ALM-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 881.35
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1600.00, default_unit_price = 1300.00 WHERE sku = 'ALM-200';
UPDATE product_costs SET cost_price = 881.35, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ALM-200');

-- ALM-250  (acc)  Astberg ALM 250 Aluminium Flexible Duct 250mm — 3 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1084.75, 1169.49
FROM products p
WHERE p.sku = 'ALM-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1169.49
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2150.00, default_unit_price = 1725.00 WHERE sku = 'ALM-250';
UPDATE product_costs SET cost_price = 1169.49, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ALM-250');

-- AFD-100  (acc)  Astberg AFD 100 Insulated PVC Flexible Duct 100mm — 10 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1186.44, 1254.24
FROM products p
WHERE p.sku = 'AFD-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1254.24
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2325.00, default_unit_price = 1850.00 WHERE sku = 'AFD-100';
UPDATE product_costs SET cost_price = 1254.24, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFD-100');

-- AFD-150  (acc)  Astberg AFD 150 Insulated PVC Flexible Duct 150mm — 5 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1661.02, 1745.76
FROM products p
WHERE p.sku = 'AFD-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1745.76
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3150.00, default_unit_price = 2575.00 WHERE sku = 'AFD-150';
UPDATE product_costs SET cost_price = 1745.76, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFD-150');

-- AFD-200  (acc)  Astberg AFD 200 Insulated PVC Flexible Duct 200mm — 5 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1796.61, 1891.53
FROM products p
WHERE p.sku = 'AFD-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1891.53
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3490.00, default_unit_price = 2790.00 WHERE sku = 'AFD-200';
UPDATE product_costs SET cost_price = 1891.53, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFD-200');

-- AFD-250  (acc)  Astberg AFD 250 Insulated PVC Flexible Duct 250mm — 5 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1898.31, 2000.00
FROM products p
WHERE p.sku = 'AFD-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2000.00
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3690.00, default_unit_price = 2950.00 WHERE sku = 'AFD-250';
UPDATE product_costs SET cost_price = 2000.00, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFD-250');

-- AFD-315  (acc)  Astberg AFD 315 Insulated PVC Flexible Duct 315mm — 5 metres
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 2033.90, 2162.71
FROM products p
WHERE p.sku = 'AFD-315'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 2162.71
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 3890.00, default_unit_price = 3190.00 WHERE sku = 'AFD-315';
UPDATE product_costs SET cost_price = 2162.71, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFD-315');

-- ARD-150-100  (acc)  Astberg ARD 150-100 ABS Reducer 150mm to 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 288.14, 305.09
FROM products p
WHERE p.sku = 'ARD-150-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 305.09
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 560.00, default_unit_price = 450.00 WHERE sku = 'ARD-150-100';
UPDATE product_costs SET cost_price = 305.09, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-150-100');

-- ARD-200-150  (acc)  Astberg ARD 200-150 ABS Reducer 200mm to 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 355.93, 372.88
FROM products p
WHERE p.sku = 'ARD-200-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 372.88
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 725.00, default_unit_price = 550.00 WHERE sku = 'ARD-200-150';
UPDATE product_costs SET cost_price = 372.88, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-200-150');

-- ARD-250-200  (acc)  Astberg ARD 250-200 ABS Reducer 250mm to 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 389.83, 413.56
FROM products p
WHERE p.sku = 'ARD-250-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 413.56
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 760.00, default_unit_price = 610.00 WHERE sku = 'ARD-250-200';
UPDATE product_costs SET cost_price = 413.56, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-250-200');

-- ARD-315-250  (acc)  Astberg ARD 315-250 ABS Reducer 315mm to 250mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 671.19, 711.86
FROM products p
WHERE p.sku = 'ARD-315-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 711.86
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1350.00, default_unit_price = 1050.00 WHERE sku = 'ARD-315-250';
UPDATE product_costs SET cost_price = 711.86, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-315-250');

-- ANR-100  (acc)  Astberg ANR 100 Noise Reducer 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 881.36, 942.38
FROM products p
WHERE p.sku = 'ANR-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 942.38
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1700.00, default_unit_price = 1390.00 WHERE sku = 'ANR-100';
UPDATE product_costs SET cost_price = 942.38, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ANR-100');

-- ANR-150  (acc)  Astberg ANR 150 Noise Reducer 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 983.05, 1033.90
FROM products p
WHERE p.sku = 'ANR-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1033.90
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 1890.00, default_unit_price = 1525.00 WHERE sku = 'ANR-150';
UPDATE product_costs SET cost_price = 1033.90, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ANR-150');

-- ANR-200  (acc)  Astberg ANR 200 Noise Reducer 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 1186.44, 1254.24
FROM products p
WHERE p.sku = 'ANR-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 1254.24
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 2325.00, default_unit_price = 1850.00 WHERE sku = 'ANR-200';
UPDATE product_costs SET cost_price = 1254.24, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ANR-200');

-- ACL-100  (acc)  Astberg ACL 100 PVC Clamp 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 40.68, 44.74
FROM products p
WHERE p.sku = 'ACL-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 44.74
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 84.00, default_unit_price = 66.00 WHERE sku = 'ACL-100';
UPDATE product_costs SET cost_price = 44.74, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ACL-100');

-- ACL-150  (acc)  Astberg ACL 150 PVC Clamp 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 57.63, 63.05
FROM products p
WHERE p.sku = 'ACL-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 63.05
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 115.00, default_unit_price = 93.00 WHERE sku = 'ACL-150';
UPDATE product_costs SET cost_price = 63.05, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ACL-150');

-- ACL-200  (acc)  Astberg ACL 200 PVC Clamp 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 108.47, 118.65
FROM products p
WHERE p.sku = 'ACL-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 118.65
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 210.00, default_unit_price = 175.00 WHERE sku = 'ACL-200';
UPDATE product_costs SET cost_price = 118.65, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ACL-200');

-- ACL-250  (acc)  Astberg ACL 250 PVC Clamp 250mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 169.49, 186.44
FROM products p
WHERE p.sku = 'ACL-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 186.44
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 330.00, default_unit_price = 275.00 WHERE sku = 'ACL-250';
UPDATE product_costs SET cost_price = 186.44, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ACL-250');

-- ACL-315  (acc)  Astberg ACL 315 PVC Clamp 315mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 355.93, 389.83
FROM products p
WHERE p.sku = 'ACL-315'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 389.83
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 715.00, default_unit_price = 575.00 WHERE sku = 'ACL-315';
UPDATE product_costs SET cost_price = 389.83, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ACL-315');

-- ASL-100  (acc)  Astberg ASL 100 Steel Grip Clamp 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 37.29, 40.68
FROM products p
WHERE p.sku = 'ASL-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 40.68
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 75.00, default_unit_price = 60.00 WHERE sku = 'ASL-100';
UPDATE product_costs SET cost_price = 40.68, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASL-100');

-- ASL-150  (acc)  Astberg ASL 150 Steel Grip Clamp 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 40.68, 44.06
FROM products p
WHERE p.sku = 'ASL-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 44.06
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 80.00, default_unit_price = 65.00 WHERE sku = 'ASL-150';
UPDATE product_costs SET cost_price = 44.06, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASL-150');

-- ASL-200  (acc)  Astberg ASL 200 Steel Grip Clamp 200mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 44.07, 47.46
FROM products p
WHERE p.sku = 'ASL-200'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 47.46
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 85.00, default_unit_price = 70.00 WHERE sku = 'ASL-200';
UPDATE product_costs SET cost_price = 47.46, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASL-200');

-- ASL-250  (acc)  Astberg ASL 250 Steel Grip Clamp 250mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 47.46, 50.85
FROM products p
WHERE p.sku = 'ASL-250'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 50.85
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 90.00, default_unit_price = 75.00 WHERE sku = 'ASL-250';
UPDATE product_costs SET cost_price = 50.85, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASL-250');

-- ASL-315  (acc)  Astberg ASL 315 Steel Grip Clamp 315mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 50.85, 54.24
FROM products p
WHERE p.sku = 'ASL-315'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 54.24
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 95.00, default_unit_price = 80.00 WHERE sku = 'ASL-315';
UPDATE product_costs SET cost_price = 54.24, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASL-315');

-- AOG-100  (acc)  Astberg AOG 100 ABS Oblique Air Grill 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 457.63, 457.62
FROM products p
WHERE p.sku = 'AOG-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 457.62
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 890.00, default_unit_price = 675.00 WHERE sku = 'AOG-100';
UPDATE product_costs SET cost_price = 457.62, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AOG-100');

-- AOG-150  (acc)  Astberg AOG 150 ABS Oblique Air Grill 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 457.63, 457.62
FROM products p
WHERE p.sku = 'AOG-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 457.62
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 890.00, default_unit_price = 675.00 WHERE sku = 'AOG-150';
UPDATE product_costs SET cost_price = 457.62, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AOG-150');

-- AFG-100  (acc)  Astberg AFG 100 ABS Fancy Air Grill 100mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 355.93, 355.94
FROM products p
WHERE p.sku = 'AFG-100'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 355.94
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 690.00, default_unit_price = 525.00 WHERE sku = 'AFG-100';
UPDATE product_costs SET cost_price = 355.94, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFG-100');

-- AFG-150  (acc)  Astberg AFG 150 ABS Fancy Air Grill 150mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 457.63, 457.62
FROM products p
WHERE p.sku = 'AFG-150'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 457.62
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 890.00, default_unit_price = 675.00 WHERE sku = 'AFG-150';
UPDATE product_costs SET cost_price = 457.62, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AFG-150');

-- ABB-150-7  (acc)  Astberg ABB 150-7 Branch Box (Supervisor 150mm, Branch 75mm)
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 3722.03, 4016.95
FROM products p
WHERE p.sku = 'ABB-150-7'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 4016.95
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 7190.00, default_unit_price = 5925.00 WHERE sku = 'ABB-150-7';
UPDATE product_costs SET cost_price = 4016.95, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ABB-150-7');

-- ABB-200-8  (acc)  Astberg ABB 200-8 Metal Branch Box (Supervisor 200mm, Branch 75mm)
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 5755.93, 6230.51
FROM products p
WHERE p.sku = 'ABB-200-8'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 6230.51
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 11000.00, default_unit_price = 9190.00 WHERE sku = 'ABB-200-8';
UPDATE product_costs SET cost_price = 6230.51, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ABB-200-8');

-- ARD-100-75PE  (acc)  Astberg ARD 100-75PE ABS Reducer 100mm to 75mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 355.93, 372.88
FROM products p
WHERE p.sku = 'ARD-100-75PE'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 372.88
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 725.00, default_unit_price = 550.00 WHERE sku = 'ARD-100-75PE';
UPDATE product_costs SET cost_price = 372.88, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ARD-100-75PE');

-- AJT-75  (acc)  Astberg AJT 75 PE Pipe Connector 75mm
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 254.24, 271.18
FROM products p
WHERE p.sku = 'AJT-75'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 271.18
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 480.00, default_unit_price = 400.00 WHERE sku = 'AJT-75';
UPDATE product_costs SET cost_price = 271.18, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AJT-75');

-- AYJ-100X100X75PE  (acc)  Astberg AYJ 100x100x75PE — PE Pipe Oblique Connector
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 389.83, 372.88
FROM products p
WHERE p.sku = 'AYJ-100X100X75PE'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 372.88
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 760.00, default_unit_price = 610.00 WHERE sku = 'AYJ-100X100X75PE';
UPDATE product_costs SET cost_price = 372.88, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AYJ-100X100X75PE');

-- AYJ-100X75X75PE  (acc)  Astberg AYJ 100x75x75PE — Y Type Connector
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 389.83, 413.56
FROM products p
WHERE p.sku = 'AYJ-100X75X75PE'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 413.56
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 760.00, default_unit_price = 610.00 WHERE sku = 'AYJ-100X75X75PE';
UPDATE product_costs SET cost_price = 413.56, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AYJ-100X75X75PE');

-- ASF-50THP  (erv)  Astberg ASF 50THP
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 103993.22, 111857.63
FROM products p
WHERE p.sku = 'ASF-50THP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 111857.63
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 164990.00, default_unit_price = 139822.03 WHERE sku = 'ASF-50THP';
UPDATE product_costs SET cost_price = 111857.63, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'ASF-50THP');

-- AT-501  (erv)  Astberg AT 501
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 21627.12, 22705.08
FROM products p
WHERE p.sku = 'AT-501'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 22705.08
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 33490.00, default_unit_price = 28381.36 WHERE sku = 'AT-501';
UPDATE product_costs SET cost_price = 22705.08, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AT-501');

-- AHE-D-20THA  (erv)  Astberg AHE-D 20THA
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 34569.49, 35925.42
FROM products p
WHERE p.sku = 'AHE-D-20THA'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 35925.42
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 52990.00, default_unit_price = 44906.78 WHERE sku = 'AHE-D-20THA';
UPDATE product_costs SET cost_price = 35925.42, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-D-20THA');

-- AHE-25THP  (erv)  Astberg AHE 25 THP
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 46711.86, 50162.71
FROM products p
WHERE p.sku = 'AHE-25THP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 50162.71
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 73990.00, default_unit_price = 62703.39 WHERE sku = 'AHE-25THP';
UPDATE product_costs SET cost_price = 50162.71, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-25THP');

-- AHE-35THP  (erv)  Astberg AHE 35 THP
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 57281.36, 61349.15
FROM products p
WHERE p.sku = 'AHE-35THP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 61349.15
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 90490.00, default_unit_price = 76686.44 WHERE sku = 'AHE-35THP';
UPDATE product_costs SET cost_price = 61349.15, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-35THP');

-- AHE-50THP  (erv)  Astberg AHE 50 THP — Energy Recovery Ventilator (ERV/HRV) with HEPA + Carbon + Dust Filter, 500CMH
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 70162.71, 74569.49
FROM products p
WHERE p.sku = 'AHE-50THP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 74569.49
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 109990.00, default_unit_price = 93211.86 WHERE sku = 'AHE-50THP';
UPDATE product_costs SET cost_price = 74569.49, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-50THP');

-- AHE-80THP  (erv)  Astberg AHE 80 THP
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 84738.98, 90162.71
FROM products p
WHERE p.sku = 'AHE-80THP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 90162.71
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 132990.00, default_unit_price = 112703.39 WHERE sku = 'AHE-80THP';
UPDATE product_costs SET cost_price = 90162.71, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-80THP');

-- AHE-100THP  (erv)  Astberg AHE 100 THP
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 111857.63, 116603.39
FROM products p
WHERE p.sku = 'AHE-100THP'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 116603.39
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 171990.00, default_unit_price = 145754.24 WHERE sku = 'AHE-100THP';
UPDATE product_costs SET cost_price = 116603.39, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-100THP');

-- AHE-130TH  (erv)  Astberg AHE 130 TH
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 108806.78, 113891.53
FROM products p
WHERE p.sku = 'AHE-130TH'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 113891.53
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 167990.00, default_unit_price = 142364.41 WHERE sku = 'AHE-130TH';
UPDATE product_costs SET cost_price = 113891.53, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-130TH');

-- AHE-150THB  (erv)  Astberg AHE 150 THB
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 131179.66, 140332.20
FROM products p
WHERE p.sku = 'AHE-150THB'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 140332.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 206990.00, default_unit_price = 175415.25 WHERE sku = 'AHE-150THB';
UPDATE product_costs SET cost_price = 140332.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-150THB');

-- AHE-200THB  (erv)  Astberg AHE 200 THB
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 163044.07, 173552.54
FROM products p
WHERE p.sku = 'AHE-200THB'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 173552.54
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 255990.00, default_unit_price = 216940.68 WHERE sku = 'AHE-200THB';
UPDATE product_costs SET cost_price = 173552.54, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-200THB');

-- AHE-300THB  (erv)  Astberg AHE 300 THB
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 213213.56, 226433.90
FROM products p
WHERE p.sku = 'AHE-300THB'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 226433.90
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 333990.00, default_unit_price = 283042.37 WHERE sku = 'AHE-300THB';
UPDATE product_costs SET cost_price = 226433.90, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-300THB');

-- AHE-400THB  (erv)  Astberg AHE 400 THB
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 262705.08, 278637.29
FROM products p
WHERE p.sku = 'AHE-400THB'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 278637.29
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 410990.00, default_unit_price = 348296.61 WHERE sku = 'AHE-400THB';
UPDATE product_costs SET cost_price = 278637.29, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-400THB');

-- AHE-500THB  (erv)  Astberg AHE 500 THB
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 319315.25, 338637.29
FROM products p
WHERE p.sku = 'AHE-500THB'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 338637.29
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 499490.00, default_unit_price = 423296.61 WHERE sku = 'AHE-500THB';
UPDATE product_costs SET cost_price = 338637.29, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHE-500THB');

-- AHC-500TH  (erv)  Astberg AHC 500TH
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 56203.39, 60332.20
FROM products p
WHERE p.sku = 'AHC-500TH'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 60332.20
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 88990.00, default_unit_price = 75415.25 WHERE sku = 'AHC-500TH';
UPDATE product_costs SET cost_price = 60332.20, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHC-500TH');

-- AHC-800TH  (erv)  Astberg AHC 800TH
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 70440.68, 74908.47
FROM products p
WHERE p.sku = 'AHC-800TH'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 74908.47
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 110490.00, default_unit_price = 93635.59 WHERE sku = 'AHC-800TH';
UPDATE product_costs SET cost_price = 74908.47, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHC-800TH');

-- AHC-1000TH  (erv)  Astberg AHC 1000TH
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 88745.76, 94908.47
FROM products p
WHERE p.sku = 'AHC-1000TH'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 94908.47
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 139990.00, default_unit_price = 118635.59 WHERE sku = 'AHC-1000TH';
UPDATE product_costs SET cost_price = 94908.47, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'AHC-1000TH');

-- DARWIN-AVD25  (erv)  Astberg Darwin AVD25
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 64061.02, 67111.86
FROM products p
WHERE p.sku = 'DARWIN-AVD25'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 67111.86
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 98990.00, default_unit_price = 83889.83 WHERE sku = 'DARWIN-AVD25';
UPDATE product_costs SET cost_price = 67111.86, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'DARWIN-AVD25');

-- DARWIN-AVD35  (erv)  Astberg Darwin AVD35
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 73152.54, 78637.29
FROM products p
WHERE p.sku = 'DARWIN-AVD35'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 78637.29
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 115990.00, default_unit_price = 98296.61 WHERE sku = 'DARWIN-AVD35';
UPDATE product_costs SET cost_price = 78637.29, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'DARWIN-AVD35');

-- DARWIN-AVD50  (erv)  Astberg Darwin AVD50
INSERT INTO product_cost_history (product_id, previous_cost, new_cost)
SELECT p.id, 86433.90, 94230.51
FROM products p
WHERE p.sku = 'DARWIN-AVD50'
  AND NOT EXISTS (
    SELECT 1 FROM product_cost_history h
    WHERE h.product_id = p.id
      AND h.new_cost = 94230.51
      AND h.changed_at > NOW() - INTERVAL '1 day'
  );
UPDATE products SET mrp = 138990.00, default_unit_price = 117788.14 WHERE sku = 'DARWIN-AVD50';
UPDATE product_costs SET cost_price = 94230.51, updated_at = NOW()
WHERE product_id = (SELECT id FROM products WHERE sku = 'DARWIN-AVD50');

-- =========================================================================
-- SECTION B — New SKUs introduced by the June 2026 pricelist
-- =========================================================================

-- NEW: ATMK-355-AC  (fan)  Astberg ATMK 355 AC Mixed Flow Fan
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('ATMK-355-AC', 'Astberg ATMK 355 AC Mixed Flow Fan', 'ATMK Mixed Flow Fan Series', 'FRESH_AIR', 38990.00, 32490.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 22027.20, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'ATMK-355-AC'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: ATMK-409-AC  (fan)  Astberg ATMK 409 AC Mixed Flow Fan
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('ATMK-409-AC', 'Astberg ATMK 409 AC Mixed Flow Fan', 'ATMK Mixed Flow Fan Series', 'FRESH_AIR', 53990.00, 44990.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 30501.60, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'ATMK-409-AC'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: AEC-150-BLACK  (fan)  Astberg AEC 150 Black Inline Fan with Wired Remote Speed Controller
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('AEC-150-BLACK', 'Astberg AEC 150 Black Inline Fan with Wired Remote Speed Controller', 'AEC Series (Speed Controller)', 'FRESH_AIR', 12890.00, 10690.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 7247.20, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'AEC-150-BLACK'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: ASC-100-GREY  (acc)  Astberg ASC 100 Outer Steel Cowl 100mm — Grey Painted
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('ASC-100-GREY', 'Astberg ASC 100 Outer Steel Cowl 100mm — Grey Painted', 'Outer Steel Cowl', 'ACCESSORY', 900.00, 720.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 488.14, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'ASC-100-GREY'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: ASC-150-GREY  (acc)  Astberg ASC 150 Outer Steel Cowl 150mm — Grey Painted
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('ASC-150-GREY', 'Astberg ASC 150 Outer Steel Cowl 150mm — Grey Painted', 'Outer Steel Cowl', 'ACCESSORY', 1150.00, 930.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 630.51, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'ASC-150-GREY'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: ASC-200-GREY  (acc)  Astberg ASC 200 Outer Steel Cowl 200mm — Grey Painted
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('ASC-200-GREY', 'Astberg ASC 200 Outer Steel Cowl 200mm — Grey Painted', 'Outer Steel Cowl', 'ACCESSORY', 1930.00, 1535.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 1040.68, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'ASC-200-GREY'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: ASC-250-GREY  (acc)  Astberg ASC 250 Outer Steel Cowl 250mm — Grey Painted
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('ASC-250-GREY', 'Astberg ASC 250 Outer Steel Cowl 250mm — Grey Painted', 'Outer Steel Cowl', 'ACCESSORY', 4250.00, 3150.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 2135.59, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'ASC-250-GREY'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: UV-FILTER-BOX-150  (acc)  Astberg UV Light Filter Box 150mm
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('UV-FILTER-BOX-150', 'Astberg UV Light Filter Box 150mm', 'Air Purification Box', 'ACCESSORY', 17490.00, 14500.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 9830.51, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'UV-FILTER-BOX-150'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: APE-75  (acc)  Astberg APE 75 Double Wall Corrugated Flexible Duct 75mm
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('APE-75', 'Astberg APE 75 Double Wall Corrugated Flexible Duct 75mm', 'Double Wall Corrugated Duct', 'ACCESSORY', 16800.00, 14000.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 9491.53, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'APE-75'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: APE-110  (acc)  Astberg APE 110 Double Wall Corrugated Flexible Duct 110mm
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('APE-110', 'Astberg APE 110 Double Wall Corrugated Flexible Duct 110mm', 'Double Wall Corrugated Duct', 'ACCESSORY', 19200.00, 16000.00, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 10847.46, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'APE-110'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: AHC-350TH  (erv)  Astberg AHC 350 TH Energy Recovery Ventilator (ERV/HRV)
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('AHC-350TH', 'Astberg AHC 350 TH Energy Recovery Ventilator (ERV/HRV)', 'ERV/HRV', 'FRESH_AIR', 66990.00, 56771.19, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 45416.95, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'AHC-350TH'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: AHC-1500TH  (erv)  Astberg AHC 1500 TH Energy Recovery Ventilator (ERV/HRV)
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('AHC-1500TH', 'Astberg AHC 1500 TH Energy Recovery Ventilator (ERV/HRV)', 'ERV/HRV', 'FRESH_AIR', 172990.00, 146601.69, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 117281.36, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'AHC-1500TH'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: AXX-40TH-S  (erv)  Astberg AXX 40 TH-S Energy Recovery Ventilator (ERV/HRV)
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('AXX-40TH-S', 'Astberg AXX 40 TH-S Energy Recovery Ventilator (ERV/HRV)', 'ERV/HRV', 'FRESH_AIR', 287990.00, 244059.32, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 195247.46, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'AXX-40TH-S'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();

-- NEW: AXX-50TH-S  (erv)  Astberg AXX 50 TH-S Energy Recovery Ventilator (ERV/HRV)
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, hsn_code, unit, is_active)
VALUES ('AXX-50TH-S', 'Astberg AXX 50 TH-S Energy Recovery Ventilator (ERV/HRV)', 'ERV/HRV', 'FRESH_AIR', 299990.00, 254228.81, 18.00, '8414', 'pcs', TRUE)
ON CONFLICT (sku) DO NOTHING;
INSERT INTO product_costs (product_id, cost_price, supplier)
SELECT id, 203383.05, 'Astberg Ventilation Pvt Ltd'
FROM products WHERE sku = 'AXX-50TH-S'
ON CONFLICT (product_id) DO UPDATE
  SET cost_price = EXCLUDED.cost_price,
      supplier   = EXCLUDED.supplier,
      updated_at = NOW();
