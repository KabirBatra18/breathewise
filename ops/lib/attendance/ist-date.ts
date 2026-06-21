/**
 * IST (India Standard Time = UTC+5:30) date helpers for the attendance
 * system. The attendance_days table is keyed by local date — what counts
 * as "today" follows the IST calendar regardless of server timezone.
 *
 * UTHS operates exclusively in India; no timezone configuration needed.
 * If we ever expand to multiple timezones (e.g. a UAE branch), this is
 * the only file that needs to flex.
 */

const IST_OFFSET_MIN = 330; // +5:30

/**
 * Returns the IST date as a string in YYYY-MM-DD format for a given
 * instant (defaults to "now"). Used as the value for attendance_days.date.
 */
export function istDateString(at: Date = new Date()): string {
  const utcMs = at.getTime();
  const istMs = utcMs + IST_OFFSET_MIN * 60 * 1000;
  const ist = new Date(istMs);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns the first and last YYYY-MM-DD dates of an IST calendar month.
 * Used for the monthly grid + payroll calc.
 *
 * @param yearMonth — "YYYY-MM" (e.g. "2026-06")
 */
export function istMonthRange(yearMonth: string): {
  first: string;
  last: string;
  daysInMonth: number;
} {
  const [yStr, mStr] = yearMonth.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    throw new Error(`Invalid yearMonth: ${yearMonth}`);
  }
  // Date constructor treats month as 0-indexed; day 0 of next month is
  // the last day of this month. Both ends of the range are exclusive
  // of timezone since we only care about YYYY-MM-DD strings.
  const lastDayOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    first: `${yStr}-${mStr}-01`,
    last: `${yStr}-${mStr}-${String(lastDayOfMonth).padStart(2, "0")}`,
    daysInMonth: lastDayOfMonth,
  };
}
