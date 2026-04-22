-- BreatheWise Ops — Phase 1 initial schema
-- Creates all Phase 1 tables + views + RLS policies + grants + triggers.
-- Apply once against an empty Supabase project.
--
-- RLS model:
--   * Supabase's default `authenticated` role gets table-level grants.
--   * Cost/margin tables (product_costs, product_cost_history,
--     quote_tier_financials) + quote_line_items.cost_price_snapshot access
--     are restricted to OWNER via RLS using profiles.role.
--   * Non-OWNER reads of line items go through quote_line_items_safe view.

-- =========================================================================
-- Extensions
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- profiles, login_attempts
-- =========================================================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'EMPLOYEE', 'VIEWER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  totp_secret_encrypted TEXT,
  totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can always read their own row (needed for role lookup).
CREATE POLICY profiles_self_read ON profiles
  FOR SELECT USING (id = auth.uid());

-- Owner can read and modify any profile.
CREATE POLICY profiles_owner_all ON profiles
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

-- No self-update policy: any change to a profile row (TOTP enrolment,
-- last_login_at, role, etc.) is performed by server actions using the
-- service role, never directly by the client session. This prevents
-- privilege escalation where a self-update policy would otherwise let
-- authenticated users set their own role = 'OWNER'.

CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_address INET NOT NULL,
  email TEXT,
  succeeded BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, attempted_at);

-- login_attempts is written by server actions using the service role; RLS
-- blocks the authenticated role from touching it directly.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- products, product_costs, product_cost_history
-- =========================================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('FRESH_AIR', 'EXHAUST', 'ACCESSORY', 'LABOUR', 'CONSUMABLE')),
  mrp NUMERIC(12, 2),
  default_unit_price NUMERIC(12, 2) NOT NULL,
  default_gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
  unit TEXT NOT NULL DEFAULT 'pcs',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read active products.
CREATE POLICY products_read ON products
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only OWNER writes products (server actions also check).
CREATE POLICY products_owner_write ON products
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

CREATE POLICY products_owner_update ON products
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

CREATE POLICY products_owner_delete ON products
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

CREATE TABLE product_costs (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  cost_price NUMERIC(12, 2) NOT NULL,
  supplier TEXT,
  notes TEXT,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE product_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_costs_owner_only ON product_costs
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

CREATE TABLE product_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  previous_cost NUMERIC(12, 2),
  new_cost NUMERIC(12, 2) NOT NULL,
  changed_by UUID REFERENCES profiles(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE product_cost_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_cost_history_owner_only ON product_cost_history
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

-- Trigger: each UPDATE or INSERT on product_costs appends a history row.
CREATE OR REPLACE FUNCTION log_product_cost_change() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_cost_history (product_id, previous_cost, new_cost, changed_by)
  VALUES (
    NEW.product_id,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.cost_price ELSE NULL END,
    NEW.cost_price,
    NEW.updated_by
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER product_costs_history_trg
  AFTER INSERT OR UPDATE OF cost_price ON product_costs
  FOR EACH ROW
  EXECUTE FUNCTION log_product_cost_change();

-- =========================================================================
-- clients
-- =========================================================================
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID,
  name TEXT NOT NULL,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state TEXT,
  pincode TEXT,
  gstin TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_read ON clients
  FOR SELECT USING (
    auth.role() = 'authenticated' AND deleted_at IS NULL
  );

CREATE POLICY clients_write_employee_or_owner ON clients
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

CREATE POLICY clients_update_employee_or_owner ON clients
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

CREATE POLICY clients_delete_owner_only ON clients
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

-- =========================================================================
-- quotes, quote_sections, quote_line_items, quote_line_items_safe view
-- =========================================================================
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL UNIQUE,
  client_id UUID NOT NULL REFERENCES clients(id),
  lead_id UUID,
  quote_type TEXT NOT NULL CHECK (quote_type IN ('ROUGH', 'PRECISE')),
  parent_quote_id UUID REFERENCES quotes(id),
  status TEXT NOT NULL CHECK (status IN (
    'DRAFT', 'SENT', 'NEGOTIATING',
    'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED',
    'ADVANCE_PAID', 'SUPERSEDED'
  )),
  rough_discount_percent NUMERIC(5, 2),
  accepted_tier_label TEXT,
  accepted_discount_percent NUMERIC(5, 2),
  validity_days INTEGER NOT NULL DEFAULT 15,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  closed_at TIMESTAMPTZ,
  closed_reason TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY quotes_read ON quotes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY quotes_write ON quotes
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

CREATE POLICY quotes_update ON quotes
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

CREATE POLICY quotes_delete ON quotes
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

CREATE TABLE quote_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  section_letter TEXT NOT NULL,
  title TEXT NOT NULL,
  gst_rate NUMERIC(5, 2) NOT NULL DEFAULT 18.00,
  sort_order INTEGER NOT NULL,
  is_labour_style BOOLEAN NOT NULL DEFAULT FALSE,
  applies_discount BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT quote_sections_letter_unique UNIQUE (quote_id, section_letter)
);

ALTER TABLE quote_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_sections_all_auth ON quote_sections
  FOR ALL USING (auth.role() = 'authenticated');

CREATE TABLE quote_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_section_id UUID NOT NULL REFERENCES quote_sections(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  sno INTEGER NOT NULL,
  description TEXT NOT NULL,
  mrp NUMERIC(12, 2),
  quantity NUMERIC(12, 2) NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  unit TEXT NOT NULL DEFAULT 'pcs',
  sort_order INTEGER NOT NULL,
  cost_price_snapshot NUMERIC(12, 2)
);

-- Base-table SELECT allowed only to OWNER (includes cost_price_snapshot).
-- Non-owners read the safe view below.
ALTER TABLE quote_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_line_items_owner_read ON quote_line_items
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

CREATE POLICY quote_line_items_write ON quote_line_items
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

CREATE POLICY quote_line_items_update ON quote_line_items
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

CREATE POLICY quote_line_items_delete ON quote_line_items
  FOR DELETE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

-- Safe view — excludes cost_price_snapshot. Declared with
-- security_invoker = false (Postgres 15 default, made explicit here) so
-- the view runs with creator privileges and can SELECT from the base
-- table even though RLS on the base table restricts SELECT to OWNER.
-- Supabase's linter flags views without security_invoker = on; that flag
-- is suppressed intentionally for this view — this is the whole point of
-- the column-filter pattern.
CREATE VIEW quote_line_items_safe
  WITH (security_invoker = false) AS
  SELECT id, quote_section_id, product_id, sno, description, mrp,
         quantity, unit_price, unit, sort_order
  FROM quote_line_items;

GRANT SELECT ON quote_line_items_safe TO authenticated;

-- =========================================================================
-- quote_sends, quote_tier_financials
-- =========================================================================
CREATE TABLE quote_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  tier_label TEXT NOT NULL CHECK (tier_label IN ('ROUGH', 'Q1', 'Q2', 'Q3')),
  discount_percent NUMERIC(5, 2) NOT NULL,
  pdf_url TEXT NOT NULL,
  sent_via TEXT CHECK (sent_via IN ('DOWNLOAD', 'WHATSAPP_LINK')),
  sent_to TEXT,
  sent_by UUID REFERENCES profiles(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

ALTER TABLE quote_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_sends_all_auth ON quote_sends
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

CREATE TABLE quote_tier_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  tier_label TEXT NOT NULL CHECK (tier_label IN ('ROUGH', 'Q1', 'Q2', 'Q3')),
  discount_percent NUMERIC(5, 2) NOT NULL,
  revenue_pre_discount NUMERIC(12, 2) NOT NULL,
  discount_amount NUMERIC(12, 2) NOT NULL,
  revenue_post_discount NUMERIC(12, 2) NOT NULL,
  gst_amount NUMERIC(12, 2) NOT NULL,
  total_invoice_value NUMERIC(12, 2) NOT NULL,
  cost_of_goods NUMERIC(12, 2) NOT NULL,
  labour_cost_estimate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  consumables_cost_estimate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_margin NUMERIC(12, 2) NOT NULL,
  gross_margin_percent NUMERIC(6, 2) NOT NULL,
  is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT quote_tier_unique UNIQUE (quote_id, tier_label)
);

ALTER TABLE quote_tier_financials ENABLE ROW LEVEL SECURITY;

CREATE POLICY qtf_owner_only ON quote_tier_financials
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

-- =========================================================================
-- payments
-- =========================================================================
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id),
  payment_type TEXT NOT NULL CHECK (payment_type IN (
    'ROUGH_ADVANCE_20', 'PRECISE_BALANCE',
    'INTERIM', 'LABOUR_DAY', 'MISC'
  )),
  amount NUMERIC(12, 2) NOT NULL,
  payment_mode TEXT CHECK (payment_mode IN ('UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE')),
  reference_number TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  recorded_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY payments_read ON payments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY payments_write ON payments
  FOR INSERT WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) IN ('OWNER', 'EMPLOYEE')
  );

-- =========================================================================
-- terms_clauses, quote_terms
-- =========================================================================
CREATE TABLE terms_clauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL,
  applies_to TEXT NOT NULL CHECK (applies_to IN ('ROUGH', 'PRECISE', 'BOTH')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE terms_clauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY terms_clauses_read ON terms_clauses
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY terms_clauses_owner_write ON terms_clauses
  FOR ALL USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

CREATE TABLE quote_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  clause_id UUID REFERENCES terms_clauses(id),
  title_snapshot TEXT NOT NULL,
  body_snapshot TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

ALTER TABLE quote_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_terms_all_auth ON quote_terms
  FOR ALL USING (auth.role() = 'authenticated');

-- =========================================================================
-- audit_log
-- =========================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES profiles(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_owner_read ON audit_log
  FOR SELECT USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

-- Writes happen exclusively via service-role from server actions.

-- =========================================================================
-- company_settings (singleton)
-- =========================================================================
CREATE TABLE company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  legal_name TEXT NOT NULL DEFAULT 'Urban Tech Home Solutions Pvt Ltd',
  brand_name TEXT NOT NULL DEFAULT 'BreatheWise',
  tagline TEXT NOT NULL DEFAULT 'Ventilation & Air Quality Solutions',
  address TEXT,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  logo_url TEXT,
  default_rough_discount_percent NUMERIC(5, 2) NOT NULL DEFAULT 5.00,
  default_precise_tiers NUMERIC(5, 2)[] NOT NULL DEFAULT ARRAY[5.00, 10.00, 15.00]::numeric(5,2)[],
  default_validity_days INTEGER NOT NULL DEFAULT 15,
  quote_number_prefix TEXT NOT NULL DEFAULT 'BW',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the singleton row.
INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_settings_read ON company_settings
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY company_settings_owner_write ON company_settings
  FOR UPDATE USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'OWNER'
  );

-- =========================================================================
-- Per-year quote number sequence helper
-- =========================================================================
-- Called from server actions inside a transaction to atomically allocate
-- the next number for a given year. Uses an advisory lock keyed on year.
CREATE OR REPLACE FUNCTION next_quote_number(prefix TEXT, year INT) RETURNS TEXT AS $$
DECLARE
  next_n INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('quote_number_' || year));
  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(quote_number, '-', 3) AS INT)
  ), 0) + 1 INTO next_n
  FROM quotes
  WHERE quote_number LIKE prefix || '-' || year::TEXT || '-%';
  RETURN prefix || '-' || year::TEXT || '-' || LPAD(next_n::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- Opportunistic login_attempts pruning (no cron needed)
-- =========================================================================
-- Called inside the login rate-limit check; deletes rows older than 24h.
CREATE OR REPLACE FUNCTION prune_login_attempts() RETURNS VOID AS $$
BEGIN
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- Auto-refresh updated_at on any UPDATE
-- =========================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER products_set_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER clients_set_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER quotes_set_updated_at BEFORE UPDATE ON quotes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER terms_clauses_set_updated_at BEFORE UPDATE ON terms_clauses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER company_settings_set_updated_at BEFORE UPDATE ON company_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
