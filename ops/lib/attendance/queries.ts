import { and, asc, between, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  attendanceDays,
  attendancePublicHolidays,
  attendanceSettings,
  attendanceTaskLogs,
  employeePayrollSettings,
  users,
} from "@/db/schema";
import {
  effectiveDayCredit,
  expectedCreditsForMonth,
} from "@/lib/attendance/credit";
import { istMonthRange } from "@/lib/attendance/ist-date";

/**
 * Shared query layer for the monthly grid (admin) + employee self-view +
 * payroll preview. Keeps the same monthly math in one place so all three
 * surfaces show identical numbers.
 *
 * The functions are pure-read (no mutations). They're called from server
 * components and never directly by client code.
 */

export interface DayCell {
  // Row id in attendance_days. null if no row exists yet for this date
  // (the date is in the cycle but the employee hasn't punched). Needed
  // for the day-override editor to know whether to update or insert.
  dayId: string | null;
  date: string; // YYYY-MM-DD
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInStatus: string | null;
  checkOutStatus: string | null;
  checkInDistanceM: number | null;
  checkOutDistanceM: number | null;
  hoursWorked: number | null;
  dayCredit: number | null;
  overrideKind: string | null;
  overrideCredit: number | null;
  effectiveCredit: number;
  isWeekendOff: boolean;
  isPublicHoliday: boolean;
  publicHolidayName: string | null;
  hasPending: boolean;
  // Anti-fraud commit 3 (2026-06-22) — surface overtime state so UI can
  // badge pending-overtime days. true when raw dayCredit > 1.0 AND
  // OWNER hasn't yet approved the overtime for this date.
  hasPendingOvertime: boolean;
  // Phase 2 (2026-06-22): task log entries for this day. Populated
  // only when caller passes includeTaskLogs=true to
  // loadMonthlyAttendance. Empty array means "no logs filled" (could
  // be employee-skipped, day pre-dates the feature, or in-progress).
  taskLogs?: Array<{
    hourStart: string;
    hourEnd: string;
    description: string;
  }>;
}

export interface MonthlyAttendance {
  yearMonth: string; // "YYYY-MM"
  daysInMonth: number;
  firstDate: string;
  lastDate: string;
  expectedCredits: number;
  actualCredits: number;
  publicHolidays: { date: string; name: string }[];
  cells: DayCell[];
}

export async function loadMonthlyAttendance(
  userId: string,
  yearMonth: string,
  opts?: { includeTaskLogs?: boolean },
): Promise<MonthlyAttendance> {
  const { first, last, daysInMonth } = istMonthRange(yearMonth);
  const [dayRows, holidayRows, settingsRows, payrollRows] = await Promise.all([
    db
      .select()
      .from(attendanceDays)
      .where(
        and(
          eq(attendanceDays.userId, userId),
          between(attendanceDays.date, first, last),
        ),
      )
      .orderBy(asc(attendanceDays.date)),
    db
      .select()
      .from(attendancePublicHolidays)
      .where(between(attendancePublicHolidays.date, first, last))
      .orderBy(asc(attendancePublicHolidays.date)),
    db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.id, 1))
      .limit(1),
    // Audit-fix 2026-06-22: pull the employee's joined_on so we can
    // pro-rate expectedCredits for mid-month joiners. Without this, an
    // employee joining on the 15th of a 30-day month appeared as
    // 13/26 instead of 13/13 — halving their salary on /payroll.
    db
      .select({ joinedOn: employeePayrollSettings.joinedOn })
      .from(employeePayrollSettings)
      .where(eq(employeePayrollSettings.userId, userId))
      .limit(1),
  ]);
  const settings = settingsRows[0];
  if (!settings) throw new Error("Attendance settings not initialised");
  const joinedOn = payrollRows[0]?.joinedOn
    ? (payrollRows[0].joinedOn as unknown as string)
    : null;

  // Index by date for cell building.
  const byDate = new Map(
    dayRows.map((d) => [d.date as unknown as string, d]),
  );
  const holidayByDate = new Map(
    holidayRows.map((h) => [h.date as unknown as string, h]),
  );

  // Phase 2 (2026-06-22): when the caller asks for task logs, fetch
  // them in a SINGLE batched query keyed by the day_ids we already
  // have. Skip the query entirely if no caller asked (employee
  // self-view + payroll don't need this; only OWNER admin grid does).
  const logsByDayId = new Map<
    string,
    Array<{ hourStart: string; hourEnd: string; description: string }>
  >();
  if (opts?.includeTaskLogs && dayRows.length > 0) {
    const dayIds = dayRows.map((d) => d.id);
    const logs = await db
      .select({
        dayId: attendanceTaskLogs.dayId,
        hourStart: attendanceTaskLogs.hourStart,
        hourEnd: attendanceTaskLogs.hourEnd,
        description: attendanceTaskLogs.description,
      })
      .from(attendanceTaskLogs)
      .where(inArray(attendanceTaskLogs.dayId, dayIds))
      .orderBy(asc(attendanceTaskLogs.hourStart));
    for (const l of logs) {
      const arr = logsByDayId.get(l.dayId) ?? [];
      arr.push({
        hourStart: l.hourStart.toISOString(),
        hourEnd: l.hourEnd.toISOString(),
        description: l.description,
      });
      logsByDayId.set(l.dayId, arr);
    }
  }

  // Build a full row of cells covering every date in the month.
  const cells: DayCell[] = [];
  let actualCredits = 0;
  const [yStr, mStr] = yearMonth.split("-");
  const year = Number(yStr);
  const month = Number(mStr) - 1; // JS month index

  for (let dayN = 1; dayN <= daysInMonth; dayN++) {
    const dateStr = `${yStr}-${mStr}-${String(dayN).padStart(2, "0")}`;
    const row = byDate.get(dateStr);
    const holiday = holidayByDate.get(dateStr) ?? null;
    const jsDate = new Date(Date.UTC(year, month, dayN));
    // For the floating-weekly-off concept we don't enforce a specific
    // weekday — but Sunday is still the cultural default in India, so
    // we surface a "this is a Sunday" hint in the grid UI. The payroll
    // math doesn't care; it just sums credits.
    const isSunday = jsDate.getUTCDay() === 0;

    const overrideKind = row?.overrideKind ?? null;
    const overrideCredit =
      row?.overrideCredit != null ? Number(row.overrideCredit) : null;
    const dayCredit =
      row?.dayCredit != null ? Number(row.dayCredit) : null;
    const overtimeApprovedAt = row?.overtimeApprovedAt ?? null;

    // Priority: OWNER override beats public holiday beats raw day_credit.
    // raw day_credit > 1.0 caps at 1.0 unless OWNER approved overtime.
    const effective = overrideKind
      ? effectiveDayCredit({
          dayCredit,
          overrideKind,
          overrideCredit,
          overtimeApprovedAt,
        })
      : holiday
        ? 1.0
        : effectiveDayCredit({
            dayCredit,
            overrideKind: null,
            overrideCredit: null,
            overtimeApprovedAt,
          });

    actualCredits += effective;

    cells.push({
      dayId: row?.id ?? null,
      date: dateStr,
      checkInAt: row?.checkInAt?.toISOString() ?? null,
      checkOutAt: row?.checkOutAt?.toISOString() ?? null,
      checkInStatus: row?.checkInStatus ?? null,
      checkOutStatus: row?.checkOutStatus ?? null,
      checkInDistanceM: row?.checkInDistanceM ?? null,
      checkOutDistanceM: row?.checkOutDistanceM ?? null,
      hoursWorked: row?.hoursWorked != null ? Number(row.hoursWorked) : null,
      dayCredit,
      overrideKind,
      overrideCredit,
      effectiveCredit: effective,
      isWeekendOff: isSunday && !row && !holiday,
      isPublicHoliday: !!holiday,
      publicHolidayName: holiday?.name ?? null,
      hasPending:
        row?.checkInStatus === "PENDING" || row?.checkOutStatus === "PENDING",
      hasPendingOvertime:
        dayCredit != null && dayCredit > 1.0 && !overtimeApprovedAt,
      taskLogs:
        opts?.includeTaskLogs && row ? logsByDayId.get(row.id) ?? [] : undefined,
    });
  }

  const expectedCredits = expectedCreditsForMonth({
    daysInMonth,
    weeklyOffsPerWeek: settings.weeklyOffsPerWeek,
    publicHolidaysInMonth: holidayRows.length,
    // Pro-rate the expectation for mid-month joiners. A user joining
    // on the 15th of a 30-day month has expected ≈ 14 (joined late),
    // not 26 (full month) — matches their actual delivery rate
    // instead of halving their salary on /payroll.
    joinedOn,
    yearMonth,
  });

  return {
    yearMonth,
    daysInMonth,
    firstDate: first,
    lastDate: last,
    expectedCredits,
    actualCredits: Math.round(actualCredits * 10) / 10,
    publicHolidays: holidayRows.map((h) => ({
      date: h.date as unknown as string,
      name: h.name,
    })),
    cells,
  };
}

/**
 * Same shape as loadMonthlyAttendance but for an arbitrary date range
 * (e.g. an employee's pay cycle, which is rarely a calendar month).
 *
 * Salary math:
 *   expectedCredits = (active_days × (7 - weeklyOffsPerWeek) / 7) − publicHolidays
 *   actualCredits = sum of effective credits across each day in range
 *
 * "active days" = max(0, end - start + 1), unless joinedOn falls inside
 * the range, in which case days before joinedOn don't count.
 *
 * Both start and end are inclusive YYYY-MM-DD strings (IST local).
 */
export async function loadCycleAttendance(args: {
  userId: string;
  start: string;
  end: string;
}): Promise<{
  start: string;
  end: string;
  totalDays: number;
  expectedCredits: number;
  actualCredits: number;
  publicHolidays: { date: string; name: string }[];
  cells: DayCell[];
}> {
  const { userId, start, end } = args;
  if (end < start) throw new Error(`end ${end} is before start ${start}`);

  const [dayRows, holidayRows, settingsRows, payrollRows] = await Promise.all([
    db
      .select()
      .from(attendanceDays)
      .where(
        and(
          eq(attendanceDays.userId, userId),
          between(attendanceDays.date, start, end),
        ),
      )
      .orderBy(asc(attendanceDays.date)),
    db
      .select()
      .from(attendancePublicHolidays)
      .where(between(attendancePublicHolidays.date, start, end))
      .orderBy(asc(attendancePublicHolidays.date)),
    db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.id, 1))
      .limit(1),
    db
      .select({ joinedOn: employeePayrollSettings.joinedOn })
      .from(employeePayrollSettings)
      .where(eq(employeePayrollSettings.userId, userId))
      .limit(1),
  ]);
  const settings = settingsRows[0];
  if (!settings) throw new Error("Attendance settings not initialised");
  const joinedOn = payrollRows[0]?.joinedOn
    ? (payrollRows[0].joinedOn as unknown as string)
    : null;

  const byDate = new Map(dayRows.map((d) => [d.date as unknown as string, d]));
  const holidayByDate = new Map(
    holidayRows.map((h) => [h.date as unknown as string, h]),
  );

  // Walk each date in the inclusive range.
  const cells: DayCell[] = [];
  let actualCredits = 0;
  let activeDays = 0;
  let cursor = start;
  while (cursor <= end) {
    const [yStr, mStr, dStr] = cursor.split("-");
    const jsDate = new Date(Date.UTC(Number(yStr), Number(mStr) - 1, Number(dStr)));
    const isSunday = jsDate.getUTCDay() === 0;
    const row = byDate.get(cursor);
    const holiday = holidayByDate.get(cursor) ?? null;
    const overrideKind = row?.overrideKind ?? null;
    const overrideCredit =
      row?.overrideCredit != null ? Number(row.overrideCredit) : null;
    const dayCredit =
      row?.dayCredit != null ? Number(row.dayCredit) : null;
    const overtimeApprovedAt = row?.overtimeApprovedAt ?? null;

    const beforeJoining = joinedOn != null && cursor < joinedOn;
    if (!beforeJoining) activeDays += 1;

    const effective = beforeJoining
      ? 0
      : overrideKind
        ? effectiveDayCredit({ dayCredit, overrideKind, overrideCredit, overtimeApprovedAt })
        : holiday
          ? 1.0
          : effectiveDayCredit({ dayCredit, overrideKind: null, overrideCredit: null, overtimeApprovedAt });

    actualCredits += effective;

    cells.push({
      dayId: row?.id ?? null,
      date: cursor,
      checkInAt: row?.checkInAt?.toISOString() ?? null,
      checkOutAt: row?.checkOutAt?.toISOString() ?? null,
      checkInStatus: row?.checkInStatus ?? null,
      checkOutStatus: row?.checkOutStatus ?? null,
      checkInDistanceM: row?.checkInDistanceM ?? null,
      checkOutDistanceM: row?.checkOutDistanceM ?? null,
      hoursWorked: row?.hoursWorked != null ? Number(row.hoursWorked) : null,
      dayCredit,
      overrideKind,
      overrideCredit,
      effectiveCredit: effective,
      isWeekendOff: isSunday && !row && !holiday && !beforeJoining,
      isPublicHoliday: !!holiday,
      publicHolidayName: holiday?.name ?? null,
      hasPending:
        row?.checkInStatus === "PENDING" || row?.checkOutStatus === "PENDING",
      hasPendingOvertime:
        dayCredit != null && dayCredit > 1.0 && !overtimeApprovedAt,
    });

    cursor = addOneDay(cursor);
  }

  // Expected credits = activeDays × (work-week ratio) − holidays in range
  const workDayRatio = (7 - settings.weeklyOffsPerWeek) / 7;
  const expectedFromCalendar = activeDays * workDayRatio;
  const expectedCredits = Math.max(
    0,
    Math.round((expectedFromCalendar - holidayRows.length) * 10) / 10,
  );

  return {
    start,
    end,
    totalDays: activeDays,
    expectedCredits,
    actualCredits: Math.round(actualCredits * 10) / 10,
    publicHolidays: holidayRows.map((h) => ({
      date: h.date as unknown as string,
      name: h.name,
    })),
    cells,
  };
}

// Local helper to avoid importing addDays from pay-cycle into the DB
// layer (cycle math should be a leaf).
function addOneDay(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Lists active payroll-tracked employees + their basic profile info.
 * Used by the monthly admin grid and the payroll list. Excludes OWNER
 * accounts (you don't pay yourself a salary through this).
 */
export async function listPayrollEmployees() {
  // Outer join so users without payroll settings still appear (so the
  // OWNER can set up payroll for a new employee).
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      fullName: users.fullName,
      role: users.role,
      isUserActive: users.isActive,
      monthlySalary: employeePayrollSettings.monthlySalary,
      joinedOn: employeePayrollSettings.joinedOn,
      isPayrollActive: employeePayrollSettings.isActive,
    })
    .from(users)
    .leftJoin(
      employeePayrollSettings,
      eq(employeePayrollSettings.userId, users.id),
    )
    .where(eq(users.isActive, true))
    .orderBy(asc(users.fullName));

  return rows.filter((r) => r.role !== "OWNER");
}
