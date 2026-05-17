import {
  bigserial,
  boolean,
  date,
  index,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const money = (name: string) =>
  numeric(name, { precision: 12, scale: 2 });
const percent = (name: string) =>
  numeric(name, { precision: 5, scale: 2 });

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  role: text("role").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  createdBy: uuid("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    ipAddress: inet("ip_address").notNull(),
    username: text("username"),
    succeeded: boolean("succeeded").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ipTimeIdx: index("idx_login_attempts_ip_time").on(t.ipAddress, t.attemptedAt),
  }),
);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sku: text("sku").unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  subcategory: text("subcategory"),
  mrp: money("mrp"),
  defaultUnitPrice: money("default_unit_price").notNull(),
  defaultGstRate: percent("default_gst_rate").notNull().default("18.00"),
  // HSN / SAC code — Rule 46(g) of CGST Rules makes it mandatory on
  // tax invoices. We default everything to 8414 (fans/blowers and
  // ventilation devices — covers ERVs too, since they're ventilation
  // not air-conditioning) via the 0006 migration and let the user
  // refine the dozen non-fan entries (filters → 8421) in the catalog.
  hsnCode: text("hsn_code"),
  unit: text("unit").notNull().default("pcs"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const productCosts = pgTable("product_costs", {
  productId: uuid("product_id")
    .primaryKey()
    .references(() => products.id, { onDelete: "cascade" }),
  costPrice: money("cost_price").notNull(),
  supplier: text("supplier"),
  notes: text("notes"),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productCostHistory = pgTable("product_cost_history", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  previousCost: money("previous_cost"),
  newCost: money("new_cost").notNull(),
  changedBy: uuid("changed_by").references(() => users.id),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  leadId: uuid("lead_id"),
  name: text("name").notNull(),
  companyName: text("company_name"),
  email: text("email"),
  phone: text("phone"),
  addressLine1: text("address_line_1"),
  addressLine2: text("address_line_2"),
  city: text("city"),
  state: text("state"),
  // GST state code (e.g. "07" for Delhi). Rule 46(g) needs this on
  // every tax invoice to determine place of supply. 0006 backfills
  // from the free-text `state` column for the standard 36 states/UTs.
  stateCode: text("state_code"),
  pincode: text("pincode"),
  gstin: text("gstin"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const quotes = pgTable("quotes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteNumber: text("quote_number").notNull().unique(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  leadId: uuid("lead_id"),
  quoteType: text("quote_type").notNull(),
  parentQuoteId: uuid("parent_quote_id"),
  status: text("status").notNull(),
  roughDiscountPercent: percent("rough_discount_percent"),
  acceptedTierLabel: text("accepted_tier_label"),
  acceptedDiscountPercent: percent("accepted_discount_percent"),
  acceptedTotal: money("accepted_total"),
  acceptedNotes: text("accepted_notes"),
  showSavingsOnPdf: boolean("show_savings_on_pdf").notNull().default(false),
  // New-model discount lever: total saving from MRP in rupees. NULL =
  // legacy path (uses roughDiscountPercent). Set => engine uses
  // computeQuoteTotalsForTarget.
  discountTargetSaving: money("discount_target_saving"),
  validityDays: integer("validity_days").notNull().default(15),
  issueDate: date("issue_date").notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedReason: text("closed_reason"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteSections = pgTable(
  "quote_sections",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    sectionLetter: text("section_letter").notNull(),
    title: text("title").notNull(),
    gstRate: percent("gst_rate").notNull().default("18.00"),
    sortOrder: integer("sort_order").notNull(),
    isLabourStyle: boolean("is_labour_style").notNull().default(false),
    appliesDiscount: boolean("applies_discount").notNull().default(true),
  },
  (t) => ({
    quoteSectionUnique: unique("quote_sections_letter_unique").on(
      t.quoteId,
      t.sectionLetter,
    ),
  }),
);

export const quoteLineItems = pgTable("quote_line_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteSectionId: uuid("quote_section_id")
    .notNull()
    .references(() => quoteSections.id, { onDelete: "cascade" }),
  productId: uuid("product_id").references(() => products.id),
  sno: integer("sno").notNull(),
  description: text("description").notNull(),
  mrp: money("mrp"),
  quantity: money("quantity").notNull(),
  unitPrice: money("unit_price").notNull(),
  unit: text("unit").notNull().default("pcs"),
  sortOrder: integer("sort_order").notNull(),
  costPriceSnapshot: money("cost_price_snapshot"),
});

export const quoteSends = pgTable("quote_sends", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  tierLabel: text("tier_label").notNull(),
  discountPercent: percent("discount_percent").notNull(),
  pdfUrl: text("pdf_url").notNull(),
  sentVia: text("sent_via"),
  sentTo: text("sent_to"),
  sentBy: uuid("sent_by").references(() => users.id),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

export const quoteTierFinancials = pgTable(
  "quote_tier_financials",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    quoteId: uuid("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    tierLabel: text("tier_label").notNull(),
    discountPercent: percent("discount_percent").notNull(),
    revenuePreDiscount: money("revenue_pre_discount").notNull(),
    discountAmount: money("discount_amount").notNull(),
    revenuePostDiscount: money("revenue_post_discount").notNull(),
    gstAmount: money("gst_amount").notNull(),
    totalInvoiceValue: money("total_invoice_value").notNull(),
    costOfGoods: money("cost_of_goods").notNull(),
    labourCostEstimate: money("labour_cost_estimate").notNull().default("0"),
    consumablesCostEstimate: money("consumables_cost_estimate").notNull().default("0"),
    grossMargin: money("gross_margin").notNull(),
    grossMarginPercent: numeric("gross_margin_percent", {
      precision: 6,
      scale: 2,
    }).notNull(),
    isFrozen: boolean("is_frozen").notNull().default(false),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tierUnique: unique("quote_tier_unique").on(t.quoteId, t.tierLabel),
  }),
);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id),
  paymentType: text("payment_type").notNull(),
  amount: money("amount").notNull(),
  paymentMode: text("payment_mode"),
  referenceNumber: text("reference_number"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  notes: text("notes"),
  recordedBy: uuid("recorded_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const termsClauses = pgTable("terms_clauses", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  body: text("body").notNull(),
  category: text("category").notNull(),
  appliesTo: text("applies_to").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  sortOrder: integer("sort_order").notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quoteTerms = pgTable("quote_terms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id, { onDelete: "cascade" }),
  clauseId: uuid("clause_id").references(() => termsClauses.id),
  titleSnapshot: text("title_snapshot").notNull(),
  bodySnapshot: text("body_snapshot").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

// ============================================================
// Tax invoices — frozen, GST-compliant documents born from quotes.
// Rule 46 / Section 31 of CGST: every column here maps to a
// mandatory field on a tax invoice.
// ============================================================
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // DRAFT invoices have no number until Finalize. NULL during DRAFT,
  // sequential BW/INV/2627/NNNN once ISSUED. The unique index allows
  // many NULLs (Postgres semantics) so multiple drafts coexist.
  invoiceNumber: text("invoice_number").unique(),
  // Lifecycle: DRAFT (editable) or ISSUED (frozen legal document).
  status: text("status").notNull().default("ISSUED"),
  quoteId: uuid("quote_id")
    .notNull()
    .references(() => quotes.id),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id),
  issueDate: date("issue_date").notNull().defaultNow(),
  // Optional date of removal/dispatch of goods (Rule 46(c)). Renders
  // on the PDF only when set and different from issue_date.
  dateOfRemoval: date("date_of_removal"),
  // Supply geography frozen at issue
  supplierState: text("supplier_state").notNull(),
  supplierStateCode: text("supplier_state_code").notNull(),
  placeOfSupply: text("place_of_supply").notNull(),
  placeOfSupplyCode: text("place_of_supply_code").notNull(),
  isInterState: boolean("is_inter_state").notNull(),
  reverseCharge: boolean("reverse_charge").notNull().default(false),
  includeLabour: boolean("include_labour").notNull().default(false),
  // Frozen supplier snapshot
  supplierLegalName: text("supplier_legal_name").notNull(),
  supplierAddress: text("supplier_address"),
  supplierGstin: text("supplier_gstin"),
  supplierPan: text("supplier_pan"),
  supplierPhone: text("supplier_phone"),
  supplierEmail: text("supplier_email"),
  // Frozen buyer snapshot
  buyerName: text("buyer_name").notNull(),
  buyerCompany: text("buyer_company"),
  buyerAddress: text("buyer_address"),
  buyerGstin: text("buyer_gstin"),
  buyerPhone: text("buyer_phone"),
  buyerEmail: text("buyer_email"),
  buyerState: text("buyer_state"),
  buyerStateCode: text("buyer_state_code"),
  // Bank snapshot
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankIfsc: text("bank_ifsc"),
  bankBranch: text("bank_branch"),
  // Totals — total_invoice_value is the ROUNDED amount printed on
  // the invoice. The precise value can be reconstructed as
  // total_taxable_value + total_cgst + total_sgst + total_igst, and
  // `round_off` captures the delta (typically ±₹0.50).
  totalTaxableValue: money("total_taxable_value").notNull(),
  totalCgst: money("total_cgst").notNull().default("0"),
  totalSgst: money("total_sgst").notNull().default("0"),
  totalIgst: money("total_igst").notNull().default("0"),
  roundOff: percent("round_off").notNull().default("0"),
  totalInvoiceValue: money("total_invoice_value").notNull(),
  // Optional ship-to (delivery) address. When delivery_state is set
  // and differs from buyer_state, the place of supply uses the
  // delivery state — correctly flipping CGST+SGST ↔ IGST.
  deliveryAddress: text("delivery_address"),
  deliveryState: text("delivery_state"),
  deliveryStateCode: text("delivery_state_code"),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // Auto-touched by the trg_invoices_updated_at DB trigger so the
  // drafts list can sort by recency.
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const invoiceLines = pgTable("invoice_lines", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  sno: integer("sno").notNull(),
  sectionLetter: text("section_letter"),
  sectionTitle: text("section_title"),
  isLabourStyle: boolean("is_labour_style").notNull().default(false),
  skuSnapshot: text("sku_snapshot"),
  description: text("description").notNull(),
  hsnCode: text("hsn_code"),
  quantity: money("quantity").notNull(),
  unit: text("unit").notNull(),
  unitPrice: money("unit_price").notNull(),
  gstRate: percent("gst_rate").notNull(),
  taxableValue: money("taxable_value").notNull(),
  cgstRate: percent("cgst_rate").notNull().default("0"),
  cgstAmount: money("cgst_amount").notNull().default("0"),
  sgstRate: percent("sgst_rate").notNull().default("0"),
  sgstAmount: money("sgst_amount").notNull().default("0"),
  igstRate: percent("igst_rate").notNull().default("0"),
  igstAmount: money("igst_amount").notNull().default("0"),
  lineTotal: money("line_total").notNull(),
  sortOrder: integer("sort_order").notNull(),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const companySettings = pgTable("company_settings", {
  id: integer("id").primaryKey().default(1),
  legalName: text("legal_name").notNull().default("Urban Tech Home Solutions"),
  brandName: text("brand_name").notNull().default("BreatheWise"),
  tagline: text("tagline").notNull().default("Ventilation & Air Quality Solutions"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  logoUrl: text("logo_url"),
  // Supplier state + GST state code. Set in 0006 to Delhi / 07.
  // Needed on every tax invoice to decide intra-state (CGST + SGST)
  // vs inter-state (IGST) based on the buyer's state.
  state: text("state"),
  stateCode: text("state_code"),
  pan: text("pan"),
  // Bank details printed on the tax invoice's payment block. Optional
  // on PI (we don't render them there).
  bankName: text("bank_name"),
  bankAccount: text("bank_account"),
  bankIfsc: text("bank_ifsc"),
  bankBranch: text("bank_branch"),
  defaultRoughDiscountPercent: percent("default_rough_discount_percent").notNull().default("5.00"),
  defaultPreciseTiers: percent("default_precise_tiers").array().notNull().default(sql`ARRAY[5.00, 10.00, 15.00]::numeric(5,2)[]`),
  defaultValidityDays: integer("default_validity_days").notNull().default(15),
  quoteNumberPrefix: text("quote_number_prefix").notNull().default("BW"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
