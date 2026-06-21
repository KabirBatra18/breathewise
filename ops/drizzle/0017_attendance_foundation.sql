-- ============================================================================
-- Migration 0017 — Attendance + payroll foundation
-- ============================================================================
-- Architecture: memory/project_attendance_architecture.md
--
-- Tables:
--   • attendance_settings        — singleton; office lat/lng + radius + rules
--   • attendance_public_holidays — OWNER-declared, ad-hoc per month
--   • attendance_days            — one row per employee per date (the
--                                   operational table); single IN, single OUT
--   • attendance_punches         — append-only audit log of every IN/OUT
--                                   event, immutable once written
--   • employee_payroll_settings  — per-user monthly salary + join date
--
-- The day-credit math runs server-side at checkout time (not via a trigger);
-- the value is frozen onto attendance_days.day_credit so historical months
-- don't recompute if we ever tune the algorithm.
--
-- All lat/lng columns are nullable so a fresh deployment can run before the
-- OWNER has configured the office on the map.
--
-- The migrate runner wraps each migration in sql.begin(); do NOT add an
-- explicit BEGIN/COMMIT here. See [[feedback_migrate_runner_hardcoded]].
-- ============================================================================

-- ─── attendance_settings (singleton, OWNER-edited) ────────────────────────
CREATE TABLE attendance_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Office geofence — null until OWNER picks on the map. While null,
  -- every punch goes to PENDING because there's no geofence to check.
  office_latitude NUMERIC(10, 7),
  office_longitude NUMERIC(10, 7),
  office_radius_meters INT NOT NULL DEFAULT 200
    CHECK (office_radius_meters >= 10 AND office_radius_meters <= 5000),
  -- Punches with browser-reported accuracy worse than this are rejected
  -- (UI tells the user to step outside and retry). 500m is the
  -- standard "indoor cellular triangulation" boundary.
  accuracy_reject_threshold_m INT NOT NULL DEFAULT 500
    CHECK (accuracy_reject_threshold_m >= 100),
  -- Standard expected hours per day. Drives the half-shift math:
  -- credit = floor(hours_worked / (expected/2)) / 2.
  expected_hours_per_day NUMERIC(3, 1) NOT NULL DEFAULT 4.0
    CHECK (expected_hours_per_day >= 1.0 AND expected_hours_per_day <= 16.0),
  weekly_offs_per_week INT NOT NULL DEFAULT 1
    CHECK (weekly_offs_per_week >= 0 AND weekly_offs_per_week <= 7),
  paid_leaves_per_month NUMERIC(3, 1) NOT NULL DEFAULT 1.0
    CHECK (paid_leaves_per_month >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER attendance_settings_set_updated_at
  BEFORE UPDATE ON attendance_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Insert the singleton row so application code can always assume it exists.
-- Office lat/lng remain null; OWNER configures via /settings/attendance.
INSERT INTO attendance_settings (id) VALUES (1);


-- ─── attendance_public_holidays ───────────────────────────────────────────
-- OWNER-declared per month, ad-hoc. Each holiday auto-credits 1.0 to every
-- active employee for that date (no punch needed).
CREATE TABLE attendance_public_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  declared_by UUID REFERENCES users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attendance_public_holidays_date
  ON attendance_public_holidays (date);


-- ─── attendance_days (operational table — one row per user per date) ──────
CREATE TABLE attendance_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,

  -- Check-in fields. All null until the employee punches in.
  check_in_at TIMESTAMPTZ,
  check_in_lat NUMERIC(10, 7),
  check_in_lng NUMERIC(10, 7),
  check_in_accuracy_m INT,
  check_in_distance_m INT,
  check_in_status TEXT
    CHECK (check_in_status IN (
      'AUTO_APPROVED', 'PENDING', 'OWNER_APPROVED', 'OWNER_REJECTED'
    )),
  check_in_offsite_note TEXT,

  -- Check-out fields. All null until the employee punches out.
  check_out_at TIMESTAMPTZ,
  check_out_lat NUMERIC(10, 7),
  check_out_lng NUMERIC(10, 7),
  check_out_accuracy_m INT,
  check_out_distance_m INT,
  check_out_status TEXT
    CHECK (check_out_status IN (
      'AUTO_APPROVED', 'PENDING', 'OWNER_APPROVED', 'OWNER_REJECTED'
    )),
  check_out_offsite_note TEXT,

  -- Derived at checkout time (server computes and freezes onto the row).
  hours_worked NUMERIC(6, 2),
  day_credit NUMERIC(3, 1),

  -- OWNER overrides — for approved leaves, holidays, manual fixes.
  override_kind TEXT
    CHECK (override_kind IN (
      'PAID_LEAVE', 'UNPAID_LEAVE', 'PUBLIC_HOLIDAY', 'WFH'
    )),
  -- When OWNER wants a partial credit (e.g. half-day paid leave). NULL =
  -- use the default for the override_kind (1.0 for PAID_LEAVE/HOLIDAY/WFH,
  -- 0.0 for UNPAID_LEAVE).
  override_credit NUMERIC(3, 1),
  override_note TEXT,
  override_by UUID REFERENCES users(id),
  override_at TIMESTAMPTZ,

  -- Set when OWNER approves/rejects a PENDING off-site punch.
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  approval_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per employee per local date. Server normalizes to IST date
  -- before insert so this constraint behaves predictably across midnight.
  UNIQUE (user_id, date)
);

CREATE TRIGGER attendance_days_set_updated_at
  BEFORE UPDATE ON attendance_days
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_attendance_days_user_date
  ON attendance_days (user_id, date DESC);

CREATE INDEX idx_attendance_days_pending
  ON attendance_days (date DESC)
  WHERE check_in_status = 'PENDING' OR check_out_status = 'PENDING';


-- ─── attendance_punches (append-only audit log) ───────────────────────────
-- Every check_in / check_out also writes a row here. Never UPDATEd or
-- DELETEd — gives us a forensic trail if a day row is later edited.
CREATE TABLE attendance_punches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID NOT NULL REFERENCES attendance_days(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('CHECK_IN', 'CHECK_OUT')),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- What the browser said the wall-clock was at punch time. Useful
  -- forensic signal if device clock was tampered with.
  captured_client_time TIMESTAMPTZ,
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  accuracy_m INT,
  distance_from_office_m INT,
  resulting_status TEXT NOT NULL,
  device_fingerprint TEXT
);

CREATE INDEX idx_attendance_punches_day
  ON attendance_punches (day_id);
CREATE INDEX idx_attendance_punches_user_time
  ON attendance_punches (user_id, captured_at DESC);


-- ─── employee_payroll_settings (per user, opt-in) ─────────────────────────
-- One row per employee who's on payroll. OWNER skips this for users they
-- don't want to pay through the system (e.g. founders, contractors).
CREATE TABLE employee_payroll_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  -- Monthly base salary in INR (paisa precision). Pay = monthly_salary ×
  -- (actual_credits / expected_credits).
  monthly_salary NUMERIC(12, 2) NOT NULL DEFAULT 0
    CHECK (monthly_salary >= 0),
  joined_on DATE,
  leave_balance NUMERIC(4, 1) NOT NULL DEFAULT 0,
  -- is_active = false pauses payroll for this user without deleting the
  -- row. Their attendance still records (e.g. for legal / audit).
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER employee_payroll_settings_set_updated_at
  BEFORE UPDATE ON employee_payroll_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ─── users.attendance_consent_at (DPDP-Act consent timestamp) ─────────────
-- Records when each user accepted the location-capture consent banner.
-- NULL = banner not yet shown / accepted. UI gates the Check In button on
-- this being non-null.
ALTER TABLE users
  ADD COLUMN attendance_consent_at TIMESTAMPTZ;
