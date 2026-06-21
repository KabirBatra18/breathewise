-- ============================================================================
-- Migration 0018 — Attendance anti-fraud signals
-- ============================================================================
-- Architecture: see memory/project_attendance_architecture.md and
-- memory/feedback_attendance_antifraud_choice.md
--
-- Three additive changes (all NULLABLE; no backfill needed):
--   1. attendance_settings.trusted_office_ips   text[]  — OWNER-configured
--      list of public IPs that count as "at the office". Empty array = IP
--      check disabled.
--   2. attendance_days + attendance_punches gain `client_ip`, `ip_match`,
--      and `clock_skew_ms` for the IP-based geofence + clock-skew
--      forensic signals.
--   3. attendance_days gains overtime_approved_{by,at} + note for the
--      OWNER overtime-approval queue. day_credit values > 1.0 only count
--      toward salary once OWNER has explicitly approved the overtime.
--
-- No BEGIN/COMMIT — the migrate runner wraps this in sql.begin().
-- See feedback_migrate_runner_hardcoded for the historical rationale.
-- ============================================================================

-- ─── 1. Trusted office IPs (attendance_settings) ──────────────────────────
ALTER TABLE attendance_settings
  ADD COLUMN trusted_office_ips TEXT[] NOT NULL DEFAULT '{}';


-- ─── 2. Per-day IP + clock skew (attendance_days) ─────────────────────────
ALTER TABLE attendance_days
  ADD COLUMN check_in_ip TEXT,
  ADD COLUMN check_in_ip_match BOOLEAN,
  ADD COLUMN check_in_clock_skew_ms INTEGER,
  ADD COLUMN check_out_ip TEXT,
  ADD COLUMN check_out_ip_match BOOLEAN,
  ADD COLUMN check_out_clock_skew_ms INTEGER;


-- ─── 3. Per-punch IP + clock skew (attendance_punches) ────────────────────
ALTER TABLE attendance_punches
  ADD COLUMN client_ip TEXT,
  ADD COLUMN ip_match BOOLEAN,
  ADD COLUMN clock_skew_ms INTEGER;


-- ─── 4. Overtime approval (attendance_days) ───────────────────────────────
-- When day_credit > 1.0 (employee worked >= 6h on a 4h-expected day):
--   • Until overtime_approved_at is set, queries.ts treats the day as
--     effective_credit = 1.0 (overtime not yet approved).
--   • Once OWNER approves overtime on this day, the full day_credit
--     value counts.
-- This closes the "punch in then leave" exploit — extra credit doesn't
-- auto-grant; OWNER's explicit per-day approval is required.
ALTER TABLE attendance_days
  ADD COLUMN overtime_approved_by UUID REFERENCES users(id),
  ADD COLUMN overtime_approved_at TIMESTAMPTZ,
  ADD COLUMN overtime_approval_note TEXT;


-- ─── 5. Helpful indexes ───────────────────────────────────────────────────
-- Days awaiting overtime approval: rare query, fast scan when needed.
CREATE INDEX idx_attendance_days_overtime_pending
  ON attendance_days (date DESC)
  WHERE day_credit > 1.0 AND overtime_approved_at IS NULL;

-- IP-mismatch days: for OWNER's "recent off-site" pattern detection.
CREATE INDEX idx_attendance_days_ip_mismatch
  ON attendance_days (user_id, date DESC)
  WHERE (check_in_ip_match = FALSE OR check_out_ip_match = FALSE);
