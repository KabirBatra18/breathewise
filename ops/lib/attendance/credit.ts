/**
 * Day-credit algorithm for the attendance / payroll system.
 *
 * The single rule: every half of an expected shift = half a credit,
 * floor to the nearest half-step. Produces 0, 0.5, 1.0, 1.5, 2.0, 2.5, …
 *
 * Concrete table for expected_hours_per_day = 4:
 *
 *   0h – 1h59m  → 0    (effectively absent)
 *   2h – 3h59m  → 0.5  (half-day penalty — no grace below the full shift)
 *   4h – 5h59m  → 1.0  (full normal day)
 *   6h – 7h59m  → 1.5  (day-and-a-half; meaningful overtime)
 *   8h – 9h59m  → 2.0  (double shift)
 *  10h – 11h59m → 2.5
 *  12h+         → 3.0+  (no cap — the math just keeps going)
 *
 * Architecture decision recorded in memory/project_attendance_architecture.md
 * Approved by Kabir on 2026-06-21: no grace at the 4h boundary, half-step
 * increments throughout, symmetric for shorts and longs.
 *
 * The output of this function is FROZEN onto attendance_days.day_credit at
 * checkout time — historical months don't recompute if the rule is ever
 * tuned. (We'd run a one-off backfill instead of a silent retroactive shift.)
 */
export function dayCredit(
  hoursWorked: number,
  expectedHoursPerDay: number,
): number {
  if (!isFinite(hoursWorked) || hoursWorked < 0) return 0;
  if (!isFinite(expectedHoursPerDay) || expectedHoursPerDay <= 0) {
    throw new Error("expectedHoursPerDay must be a positive number");
  }
  const halfShift = expectedHoursPerDay / 2;
  const halfSteps = Math.floor(hoursWorked / halfShift);
  return halfSteps / 2;
}

/**
 * Computes hours_worked from two ISO-like timestamps. Returns a number with
 * 2-decimal precision (e.g. 4.25 for 4h15m). Returns null if checkOut is
 * before checkIn (anomaly — OWNER must fix manually) or either timestamp
 * is missing.
 */
export function computeHoursWorked(
  checkInAt: Date | null | undefined,
  checkOutAt: Date | null | undefined,
): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const ms = checkOutAt.getTime() - checkInAt.getTime();
  if (ms <= 0) return null;
  // Round to 2 decimals (= ~36-second granularity). More precision is
  // false precision given GPS jitter on the timestamps.
  return Math.round((ms / 3_600_000) * 100) / 100;
}

/**
 * Returns the effective credit for a day row, accounting for OWNER overrides.
 *
 * Priority order:
 *   1. If override_kind is set, use the override_credit (or the default
 *      for that kind if override_credit is null).
 *   2. Otherwise return day_credit as stored (server already computed
 *      this at checkout time via dayCredit() above).
 *   3. If the day has no punches and no override, return 0 — treated as
 *      a weekly off / absent at the monthly-roll-up layer.
 */
export function effectiveDayCredit(day: {
  dayCredit: number | string | null;
  overrideKind: string | null;
  overrideCredit: number | string | null;
}): number {
  if (day.overrideKind) {
    if (day.overrideCredit != null) {
      return Number(day.overrideCredit);
    }
    // Defaults per override kind when override_credit is not specified.
    switch (day.overrideKind) {
      case "PAID_LEAVE":
      case "PUBLIC_HOLIDAY":
      case "WFH":
        return 1.0;
      case "UNPAID_LEAVE":
        return 0.0;
      default:
        return 0.0;
    }
  }
  if (day.dayCredit != null) return Number(day.dayCredit);
  return 0;
}

/**
 * Monthly expected credits — what an employee SHOULD deliver in a given
 * month for full salary. Subtracts weekly offs and declared public
 * holidays from the calendar day count.
 *
 * Approximation: (days_in_month / 7) × weekly_offs_per_week. For a
 * 30-day month with 1 weekly off, gives ~4.28 → rounded to 4, leaving
 * 26 expected credits. Public holidays declared by OWNER also subtract.
 */
export function expectedCreditsForMonth(args: {
  daysInMonth: number;
  weeklyOffsPerWeek: number;
  publicHolidaysInMonth: number;
}): number {
  const weeklyOffs = Math.floor(args.daysInMonth / 7) * args.weeklyOffsPerWeek;
  const expected = args.daysInMonth - weeklyOffs - args.publicHolidaysInMonth;
  return Math.max(0, expected);
}

/**
 * The salary calculator. Pure math, no DB. Caller passes the totals
 * already aggregated from attendance_days.
 *
 * pay = monthly_salary × (actual_credits / expected_credits)
 *
 * Symmetric — overtime pays more, undertime pays less. Returns a number
 * with paisa precision (2 decimals); caller can format for display.
 */
export function computeMonthlySalary(args: {
  monthlySalary: number;
  actualCredits: number;
  expectedCredits: number;
}): number {
  if (args.expectedCredits <= 0) return 0;
  const ratio = args.actualCredits / args.expectedCredits;
  return Math.round(args.monthlySalary * ratio * 100) / 100;
}
