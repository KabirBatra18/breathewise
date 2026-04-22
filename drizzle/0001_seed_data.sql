-- Phase 1 seed data: catalog, default T&C clauses, sample client.
-- Safe to re-run — uses ON CONFLICT DO NOTHING.

-- =========================================================================
-- Astberg catalog (starter — 6 products from the Mohit Jain reference quote)
-- =========================================================================
INSERT INTO products (sku, name, description, category, mrp, default_unit_price, default_gst_rate, unit)
VALUES
  (
    'AST-ERV-AHE50',
    'Astberg ERV AHE-50 500CMH',
    'Astberg ERV HRV Energy/Heat Recovery Fresh Air Ventilation, HEPA + Carbon + Dust Filter, AHE-50 500CMH (Fresh Air + Exhaust + Purification with Temperature Recovery)',
    'FRESH_AIR',
    NULL,
    87703.00,
    18.00,
    'pcs'
  ),
  (
    'AST-DIFF-100',
    'Astberg ABS Disk Diffuser 100mm',
    'Astberg ABS Disk Diffuser with Volume Controller Valve, 100mm / 4"',
    'ACCESSORY',
    490.00,
    410.00,
    18.00,
    'pcs'
  ),
  (
    'AST-COWL-150',
    'Astberg Steel Cowl 150mm (ASCGP 150)',
    'Astberg Steel Outer Pipe Cowl with Mesh, Grey Paint, 150mm / 6" (ASCGP 150)',
    'ACCESSORY',
    1090.00,
    880.00,
    18.00,
    'pcs'
  ),
  (
    'AST-COWL-100',
    'Astberg Steel Cowl 100mm (ASCGP 100)',
    'Astberg Steel Outer Pipe Cowl with Mesh, Grey Paint, 100mm / 4" (ASCGP 100)',
    'ACCESSORY',
    840.00,
    680.00,
    18.00,
    'pcs'
  ),
  (
    'AST-AEE-150',
    'Astberg AEE-150 Circular Duct Fan',
    'Astberg AEE-150 Circular Duct Fan, 150mm / 6"',
    'EXHAUST',
    NULL,
    8805.00,
    18.00,
    'pcs'
  ),
  (
    'AST-AHT15-34',
    'Astberg AHT15-34 Kitchen Inline Blower',
    'Astberg Metal Kitchen Circular Inline Duct Blower Ventilation Fan, AHT15-34, 450CMH, 150mm / 6"',
    'EXHAUST',
    9790.00,
    7990.00,
    18.00,
    'pcs'
  )
ON CONFLICT (sku) DO NOTHING;

-- =========================================================================
-- Default T&C clauses (from Mohit Jain reference quote)
-- =========================================================================
-- Skipped entirely if any default clauses already exist, so re-running the
-- migration never duplicates or conflicts with user-edited titles.
INSERT INTO terms_clauses (title, body, category, applies_to, is_default, sort_order)
SELECT * FROM (VALUES
(
  'Scope of quotation',
  'This quotation covers machinery and primary accessories only. Piping charges are not included and will be quoted separately once the site drawings are finalised.',
  'SCOPE', 'BOTH', TRUE, 1
),
(
  'Unlisted ducting fittings',
  'Certain installation components — including but not limited to elbow joints, T-joints, Y-joints, reducers, couplers, and similar ducting fittings — are not included in this quotation. The exact type and quantity of these fittings can only be determined after precise site drawings are prepared. Drawings will be commenced only upon receipt of the 20% advance payment, and the cost of these fittings will be quoted as a separate addendum thereafter.',
  'SCOPE', 'BOTH', TRUE, 2
),
(
  'Payment schedule',
  '20% advance payment is required for finalisation of the floor plan and commencement of drawings. 100% payment of equipment cost is required before procurement of goods.',
  'PAYMENT', 'BOTH', TRUE, 3
),
(
  'Labour payment & supervision',
  'The labour charges (Section C) are payable to Urban Tech Home Solutions on Day 1 of the project, in full. Urban Tech Home Solutions will act as the sole intermediary between the client and the installation team. In this capacity, UTHS is responsible for supervising the installation team, ensuring the quality and integrity of workmanship, preventing any substandard or problematic practices on site, and safeguarding the client against the risk of the team abandoning the project mid-way. UTHS will release payment to the installation team on a daily basis, against work actually completed each day. This structure ensures that the client deals only with UTHS for all labour-related matters, while UTHS retains financial control over the installation team throughout the project.',
  'LABOUR', 'BOTH', TRUE, 4
),
(
  'Installation consumables (at actuals)',
  'The quantity of installation consumables — including adhesives, sealants, insulation tapes, glues, clamps, screws, and similar materials — required during the installation process cannot be precisely predicted in advance, as it depends on on-site conditions and actual usage. These consumables will be billed at actuals as per consumption during the installation, and are to be borne by the client over and above the amounts quoted above.',
  'SCOPE', 'BOTH', TRUE, 5
),
(
  'Diffuser sizing & quantity adjustments',
  'The size and quantity of diffusers listed in this quotation are indicative. Some diffusers may be changed to a different size — particularly at locations where 6-inch / 150mm pipes are used — based on the final site drawing and actual on-site requirements. Any resultant cost adjustment will be reflected in the final invoice.',
  'SCOPE', 'BOTH', TRUE, 6
),
(
  'GST applicability',
  'GST @ 18% has been charged on Sections A & B as per applicable rates. Labour charges in Section C are quoted on a lump-sum basis.',
  'TAX', 'BOTH', TRUE, 7
),
(
  'Price validity',
  'Prices are valid for 15 days from the date of this quotation.',
  'VALIDITY', 'BOTH', TRUE, 8
),
(
  'Delivery timeline',
  'Delivery timeline to be confirmed upon order confirmation and receipt of advance payment.',
  'DELIVERY', 'BOTH', TRUE, 9
)) AS t(title, body, category, applies_to, is_default, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM terms_clauses WHERE is_default = TRUE);

-- =========================================================================
-- Sample client (Mohit Jain, from the reference quote)
-- =========================================================================
INSERT INTO clients (name, phone, notes)
SELECT 'Mr. Mohit Jain', NULL, 'Sample client seeded from reference quotation (BW-2026-0001).'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE name = 'Mr. Mohit Jain');
