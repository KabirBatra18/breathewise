-- ============================================================================
-- Migration 0020 — End-of-day task logs
-- ============================================================================
-- One row per (employee day, hour bucket). Captures what the employee
-- did during each hour they were on the clock. Filled at end-of-day,
-- gated: the next-day Check In is blocked until the prior unlogged day
-- is logged (decision recorded 2026-06-22).
--
-- Hours are stored as full timestamps (start + end) rather than a single
-- "hour number" because bucket boundaries can be partial — the first
-- bucket on a 10:23 check-in starts at 10:00 but with a 23min head, the
-- last bucket on a 14:12 check-out ends at 14:12. We bucket on whole
-- hour boundaries in the UI for simplicity, but the raw timestamps
-- here capture the actual work range.
--
-- No BEGIN/COMMIT — runner wraps in sql.begin().
-- ============================================================================

CREATE TABLE attendance_task_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_id UUID NOT NULL REFERENCES attendance_days(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  -- Hourly bucket bounds. start < end always. Both stored in UTC; the
  -- IST-local hour labels rebuild in the UI.
  hour_start TIMESTAMPTZ NOT NULL,
  hour_end TIMESTAMPTZ NOT NULL,
  -- Free-form description of what the employee did this hour. Empty
  -- string allowed (some hours genuinely have nothing — break, idle).
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One row per (day, hour bucket start). Lets us replace-all on save
  -- by upserting at the bucket boundary.
  UNIQUE (day_id, hour_start),

  -- Sanity: start must be before end. Belt-and-suspenders.
  CHECK (hour_start < hour_end)
);

CREATE TRIGGER attendance_task_logs_set_updated_at
  BEFORE UPDATE ON attendance_task_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Lookups by day are the dominant query (employee viewing their own
-- day, OWNER viewing a specific day from the grid).
CREATE INDEX idx_attendance_task_logs_day
  ON attendance_task_logs (day_id);

-- For the gating logic: "does this user have a checked-out day with
-- check_out_at IS NOT NULL and zero rows in attendance_task_logs?"
-- The query joins attendance_days LEFT JOIN attendance_task_logs and
-- groups by day_id; this index covers the join side.
CREATE INDEX idx_attendance_task_logs_user
  ON attendance_task_logs (user_id);
