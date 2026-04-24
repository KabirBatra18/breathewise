-- BreatheWise Ops — Phase 1 initial schema (inhouse simple auth variant)
-- Username/password + bcrypt + signed-cookie sessions. No Supabase Auth,
-- no TOTP, no RLS. All DB access happens through the server via a single
-- privileged connection; role checks are enforced at the server-action
-- layer. Apply once against an empty database.

-- =========================================================================
-- Extensions
-- =========================================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- users, login_attempts
-- =========================================================================
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'EMPLOYEE', 'VIEWER')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_username ON users(username) WHERE is_active = TRUE;

CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  ip_address INET NOT NULL,
  username TEXT,
  succeeded BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_login_attempts_ip_time ON login_attempts(ip_address, attempted_at);

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

CREATE TABLE product_costs (
  product_id UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  cost_price NUMERIC(12, 2) NOT NULL,
  supplier TEXT,
  notes TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_cost_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  previous_cost NUMERIC(12, 2),
  new_cost NUMERIC(12, 2) NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
$$ LANGUAGE plpgsql;

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
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- =========================================================================
-- quotes, quote_sections, quote_line_items
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
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  sent_by UUID REFERENCES users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
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
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

CREATE TABLE quote_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  clause_id UUID REFERENCES terms_clauses(id),
  title_snapshot TEXT NOT NULL,
  body_snapshot TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

-- =========================================================================
-- audit_log
-- =========================================================================
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

INSERT INTO company_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- =========================================================================
-- Per-year quote number sequence helper
-- =========================================================================
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
-- Opportunistic login_attempts pruning
-- =========================================================================
CREATE OR REPLACE FUNCTION prune_login_attempts() RETURNS VOID AS $$
BEGIN
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- Auto-refresh updated_at on any UPDATE
-- =========================================================================
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
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
