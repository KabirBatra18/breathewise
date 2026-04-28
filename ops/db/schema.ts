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
  mrp: money("mrp"),
  defaultUnitPrice: money("default_unit_price").notNull(),
  defaultGstRate: percent("default_gst_rate").notNull().default("18.00"),
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
  legalName: text("legal_name").notNull().default("Urban Tech Home Solutions Pvt Ltd"),
  brandName: text("brand_name").notNull().default("BreatheWise"),
  tagline: text("tagline").notNull().default("Ventilation & Air Quality Solutions"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  gstin: text("gstin"),
  logoUrl: text("logo_url"),
  defaultRoughDiscountPercent: percent("default_rough_discount_percent").notNull().default("5.00"),
  defaultPreciseTiers: percent("default_precise_tiers").array().notNull().default(sql`ARRAY[5.00, 10.00, 15.00]::numeric(5,2)[]`),
  defaultValidityDays: integer("default_validity_days").notNull().default(15),
  quoteNumberPrefix: text("quote_number_prefix").notNull().default("BW"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
