/**
 * Per-employee pay-cycle math.
 *
 * Kabir's pay model (agreed 2026-06-22):
 *   Each employee is paid on the SAME DAY-OF-MONTH as their joined_on
 *   date. Pay cycle = (prev pay date, current pay date] — inclusive of
 *   the pay date itself, exclusive of the prior pay date.
 *
 * Example, employee joined 2026-04-13:
 *   • Pay date every month is the 13th
 *   • Cycle ending Jul 13 covers Jun 14 → Jul 13 (inclusive both ends)
 *   • Cycle ending Aug 13 covers Jul 14 → Aug 13
 *
 * Edge cases:
 *   • joined_on day = 31, but the prev month has 30 days → pay date in
 *     that month = last day of the month (30th)
 *   • Employee joined this month and the first pay date hasn't occurred
 *     yet → current cycle starts on joined_on, ends on the first pay date
 *
 * This file is PURE FUNCTIONS — no DB, fully unit-testable. The DB
 * layer that ties it to attendance_days lives in lib/attendance/queries.ts.
 */

export interface PayCycle {
  // The pay date this cycle ends on, in YYYY-MM-DD (IST local).
  payDate: string;
  // First date covered by this cycle, inclusive (YYYY-MM-DD).
  start: string;
  // Last date covered by this cycle, inclusive (YYYY-MM-DD = payDate).
  end: string;
  // Whether `payDate` has already passed relative to `asOf`. If true,
  // this cycle is the "previous, completed" cycle. If false, it's the
  // "current, in-progress" cycle.
  isComplete: boolean;
}

/**
 * Given an employee's joined_on date and a reference "today", returns
 * the current in-progress pay cycle + the most recently completed one.
 * Both are inclusive of their boundaries.
 */
export function currentPayCycle(args: {
  joinedOn: string; // YYYY-MM-DD
  asOf?: string; // YYYY-MM-DD; defaults to today IST
}): PayCycle {
  const asOf = args.asOf ?? istTodayString();
  const [, , joinedDayStr] = args.joinedOn.split("-");
  const joinedDay = Number(joinedDayStr);
  if (!Number.isInteger(joinedDay) || joinedDay < 1 || joinedDay > 31) {
    throw new Error(`Invalid joined_on day: ${args.joinedOn}`);
  }

  // Determine the END date of the current in-progress cycle.
  // Logic: look at the asOf date. The current cycle ends on the NEXT
  // pay date that's >= asOf. (A pay date that EQUALS asOf is the last
  // day of the current cycle, so it's still "current" until that
  // calendar day ends.)
  const [yStr, mStr, dStr] = asOf.split("-");
  let y = Number(yStr);
  let m = Number(mStr);
  const d = Number(dStr);

  // Pay date in current month, clamped to last-day-of-month if
  // joinedDay > daysInMonth.
  const payDateThisMonth = Math.min(joinedDay, daysInMonth(y, m));

  let cycleEndY: number;
  let cycleEndM: number;
  let cycleEndD: number;

  if (d <= payDateThisMonth) {
    // We're on or before this month's pay date — current cycle ends here.
    cycleEndY = y;
    cycleEndM = m;
    cycleEndD = payDateThisMonth;
  } else {
    // We're past this month's pay date — current cycle ends next month.
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    cycleEndY = y;
    cycleEndM = m;
    cycleEndD = Math.min(joinedDay, daysInMonth(y, m));
  }

  // Cycle start = day after the PREVIOUS pay date (one month before
  // cycleEnd).
  let prevY = cycleEndY;
  let prevM = cycleEndM - 1;
  if (prevM < 1) {
    prevM = 12;
    prevY -= 1;
  }
  const prevPayDay = Math.min(joinedDay, daysInMonth(prevY, prevM));
  const startDate = addDays(`${pad(prevY, 4)}-${pad(prevM, 2)}-${pad(prevPayDay, 2)}`, 1);

  const endDate = `${pad(cycleEndY, 4)}-${pad(cycleEndM, 2)}-${pad(cycleEndD, 2)}`;
  // If the employee joined AFTER our computed cycle start, clamp the
  // cycle start to their joined_on date (their first cycle is partial).
  const effectiveStart = startDate < args.joinedOn ? args.joinedOn : startDate;

  // Is this cycle already complete? Yes if asOf > end. We compute "is
  // complete" not "is paid" — paid is a separate state tracked in
  // payroll_payments. A cycle that's complete-but-unpaid is what shows
  // up as "ready to pay" in /payroll.
  const isComplete = asOf > endDate;

  return {
    payDate: endDate,
    start: effectiveStart,
    end: endDate,
    isComplete,
  };
}

/**
 * Returns the pay cycle BEFORE the current one (the most recent
 * completed cycle). Useful when OWNER opens /payroll the day before
 * payday and wants to see what's about to be paid.
 */
export function previousPayCycle(args: {
  joinedOn: string;
  asOf?: string;
}): PayCycle | null {
  const asOf = args.asOf ?? istTodayString();
  const current = currentPayCycle({ joinedOn: args.joinedOn, asOf });
  // The previous cycle ends one day before current.start.
  const prevEnd = addDays(current.start, -1);
  // If prevEnd is on or before the employee's joined_on, there is no
  // previous completed cycle (we don't pay on the joining day for 0
  // days worked). Use <= so a "current cycle starting from joined_on"
  // case correctly yields no previous cycle.
  if (prevEnd <= args.joinedOn) return null;
  return currentPayCycle({ joinedOn: args.joinedOn, asOf: prevEnd });
}

// ─── helpers ────────────────────────────────────────────────────────────

function istTodayString(): string {
  const offset = 330; // IST = UTC+5:30
  const ms = Date.now() + offset * 60 * 1000;
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Returns the date `delta` days after `dateStr` (negative goes backward).
 * Pure date math on IST-local YYYY-MM-DD strings — no timezone surprises.
 */
export function addDays(dateStr: string, delta: number): string {
  const [yStr, mStr, dStr] = dateStr.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1, 2)}-${pad(utc.getUTCDate(), 2)}`;
}

/**
 * Lists all pay cycles for an employee from `joinedOn` up to and
 * including the cycle that contains `asOf`. Used by the salary slip
 * history view + by the "find unpaid cycles" logic on /payroll.
 *
 * Returns oldest first. Bounded at 60 cycles defensively.
 */
export function listPayCyclesSince(args: {
  joinedOn: string;
  asOf?: string;
}): PayCycle[] {
  const asOf = args.asOf ?? istTodayString();
  const cycles: PayCycle[] = [];
  // Start the day AFTER joined_on so we don't synthesise a zero-day
  // pay cycle on the joining day itself.
  let cursor = addDays(args.joinedOn, 1);
  for (let i = 0; i < 60; i++) {
    const cycle = currentPayCycle({ joinedOn: args.joinedOn, asOf: cursor });
    // Re-derive isComplete relative to the user's asOf (not the cursor).
    // The cursor is an internal walker; the user wants to know which
    // cycles are complete from THEIR vantage point.
    const isComplete = asOf > cycle.end;
    cycles.push({ ...cycle, isComplete });
    if (cycle.end >= asOf) break;
    cursor = addDays(cycle.end, 1);
  }
  return cycles;
}
