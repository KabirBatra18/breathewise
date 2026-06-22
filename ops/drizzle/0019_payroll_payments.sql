-- ============================================================================
-- Migration 0019 — Payroll payment lock table
-- ============================================================================
-- One row per (employee, pay cycle that was paid). When OWNER marks a
-- cycle paid, we INSERT a row freezing the credit total + amount at that
-- moment. Future overrides on days inside that cycle stop affecting the
-- already-paid amount (audit / regulatory expectation).
--
-- Architecture: see memory/project_attendance_architecture.md and
-- memory/feedback_attendance_antifraud_choice.md.
--
-- No BEGIN/COMMIT — runner wraps in sql.begin().
-- ============================================================================

CREATE TABLE payroll_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  -- The pay-date the cycle ended on (YYYY-MM-DD).
  pay_date DATE NOT NULL,
  -- Cycle bounds, both inclusive. Snapshotted onto the row so future
  -- joined_on edits don't shift historical cycles.
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  -- Frozen at moment of payment — survives any retroactive override.
  expected_credits NUMERIC(5, 2) NOT NULL,
  actual_credits NUMERIC(5, 2) NOT NULL,
  monthly_salary_at_payment NUMERIC(12, 2) NOT NULL,
  computed_amount NUMERIC(12, 2) NOT NULL,
  -- OWNER can override the computed amount (e.g. round up to a clean
  -- number, add a one-off bonus). Defaults to computed_amount; this
  -- is what was ACTUALLY paid.
  paid_amount NUMERIC(12, 2) NOT NULL,
  notes TEXT,
  paid_by UUID NOT NULL REFERENCES users(id),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One payment per (user, pay_date). If OWNER ever needs to record a
  -- correction, they delete + re-insert (audit-logged).
  UNIQUE (user_id, pay_date)
);

CREATE INDEX idx_payroll_payments_user_date
  ON payroll_payments (user_id, pay_date DESC);
