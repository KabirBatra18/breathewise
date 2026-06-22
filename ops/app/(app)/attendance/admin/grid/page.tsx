import Link from "next/link";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { asc, between } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendancePublicHolidays } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import {
  listPayrollEmployees,
  loadMonthlyAttendance,
} from "@/lib/attendance/queries";
import { istDateString, istMonthRange } from "@/lib/attendance/ist-date";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthlyGrid } from "@/components/attendance/monthly-grid";
import { HolidayManager } from "@/components/attendance/holiday-manager";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance grid" };

export default async function AttendanceGridPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  await requireOwner();
  const yearMonth = normalizeYearMonth(searchParams.m);

  // List of employees + each one's monthly attendance fetched in
  // parallel (one query per employee — acceptable at UTHS scale of
  // 2-5 employees; we'd batch via a single grouped query at higher
  // scale). The public holidays for the month are fetched once.
  const employees = await listPayrollEmployees();
  const { first, last } = istMonthRange(yearMonth);
  const holidays = await db
    .select()
    .from(attendancePublicHolidays)
    .where(between(attendancePublicHolidays.date, first, last))
    .orderBy(asc(attendancePublicHolidays.date));

  const perEmployee = await Promise.all(
    employees.map(async (e) => ({
      employee: e,
      attendance: await loadMonthlyAttendance(e.userId, yearMonth),
    })),
  );

  const { prev, next } = adjacentMonths(yearMonth);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Attendance grid
          </h1>
          <p className="text-sm text-muted-foreground">
            Monthly view of every payroll-tracked employee. Hover a day
            for details.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/attendance/admin" />}
          >
            Pending approvals
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/payroll" />}
          >
            Payroll
          </Button>
        </div>
      </div>

      <div className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-800 dark:bg-sky-950/30 dark:text-sky-100">
        <p>
          <strong>Click any day cell</strong> to mark it as paid leave,
          unpaid leave, WFH, or a one-person public holiday. Used for
          backfilling days the system didn&apos;t track (e.g. days
          worked before the attendance feature shipped) and for
          correcting missed punches.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{formatYearMonth(yearMonth)}</span>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            render={<Link href={`/attendance/admin/grid?m=${prev}`} />}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            render={<Link href={`/attendance/admin/grid?m=${next}`} />}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <HolidayManager
        yearMonth={yearMonth}
        holidays={holidays.map((h) => ({
          id: h.id,
          date: h.date as unknown as string,
          name: h.name,
          note: h.note,
        }))}
      />

      {perEmployee.length === 0 ? (
        <p className="rounded-md border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
          No payroll-tracked employees yet. Add salary settings at{" "}
          <Link href="/payroll" className="underline">
            /payroll
          </Link>{" "}
          for each employee.
        </p>
      ) : (
        perEmployee.map(({ employee, attendance }) => (
          <Card key={employee.userId}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {employee.fullName}
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {employee.username}
                </span>
              </CardTitle>
              <CardDescription>
                {attendance.actualCredits} / {attendance.expectedCredits}{" "}
                credits
                {attendance.actualCredits > attendance.expectedCredits ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                    +
                    {(
                      attendance.actualCredits - attendance.expectedCredits
                    ).toFixed(1)}{" "}
                    overtime
                  </span>
                ) : attendance.actualCredits < attendance.expectedCredits ? (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                    -
                    {(
                      attendance.expectedCredits - attendance.actualCredits
                    ).toFixed(1)}{" "}
                    short
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MonthlyGrid
                attendance={attendance}
                showLegend={false}
                editForUserId={employee.userId}
              />
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function normalizeYearMonth(input?: string): string {
  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const [y, m] = input.split("-").map(Number);
    if (m >= 1 && m <= 12 && y >= 2020 && y <= 2100) return input;
  }
  return istDateString().slice(0, 7);
}

function adjacentMonths(yearMonth: string): { prev: string; next: string } {
  const [y, m] = yearMonth.split("-").map(Number);
  const prev =
    m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const next =
    m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  return { prev, next };
}

function formatYearMonth(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
