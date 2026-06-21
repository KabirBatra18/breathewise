import { and, asc, between, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  attendanceDays,
  attendancePublicHolidays,
  attendanceSettings,
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
): Promise<MonthlyAttendance> {
  const { first, last, daysInMonth } = istMonthRange(yearMonth);
  const [dayRows, holidayRows, settingsRows] = await Promise.all([
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
  ]);
  const settings = settingsRows[0];
  if (!settings) throw new Error("Attendance settings not initialised");

  // Index by date for cell building.
  const byDate = new Map(
    dayRows.map((d) => [d.date as unknown as string, d]),
  );
  const holidayByDate = new Map(
    holidayRows.map((h) => [h.date as unknown as string, h]),
  );

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

    const effective = holiday
      ? 1.0
      : effectiveDayCredit({
          dayCredit,
          overrideKind,
          overrideCredit,
        });

    actualCredits += effective;

    cells.push({
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
    });
  }

  const expectedCredits = expectedCreditsForMonth({
    daysInMonth,
    weeklyOffsPerWeek: settings.weeklyOffsPerWeek,
    publicHolidaysInMonth: holidayRows.length,
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
