import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireOwner } from "@/lib/auth/server";
import {
  listPayrollEmployees,
  loadMonthlyAttendance,
} from "@/lib/attendance/queries";
import { computeMonthlySalary } from "@/lib/attendance/credit";
import { istDateString } from "@/lib/attendance/ist-date";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PayrollEmployeeRow } from "@/components/attendance/payroll-employee-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payroll" };

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: { m?: string };
}) {
  await requireOwner();
  const yearMonth = normalizeYearMonth(searchParams.m);

  const employees = await listPayrollEmployees();
  // For each employee, pull their monthly attendance + compute salary.
  const rows = await Promise.all(
    employees.map(async (e) => {
      const att = await loadMonthlyAttendance(e.userId, yearMonth);
      const monthly = e.monthlySalary != null ? Number(e.monthlySalary) : 0;
      const salary = computeMonthlySalary({
        monthlySalary: monthly,
        actualCredits: att.actualCredits,
        expectedCredits: att.expectedCredits,
      });
      return {
        employee: e,
        att,
        monthlySalary: monthly,
        computedSalary: salary,
      };
    }),
  );

  const totalPayroll = rows.reduce((s, r) => s + r.computedSalary, 0);
  const { prev, next } = adjacentMonths(yearMonth);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Salary computation from each employee&apos;s monthly attendance
            credits. Symmetric pro-rate — overtime pays more, undertime
            pays less.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/attendance/admin/grid" />}
          >
            Attendance grid
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/settings/attendance" />}
          >
            Settings
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Month
          </p>
          <p className="text-lg font-semibold">{formatYearMonth(yearMonth)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Total payroll
          </p>
          <p className="text-lg font-semibold tabular-nums">
            ₹{formatMoney(totalPayroll)}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            render={<Link href={`/payroll?m=${prev}`} />}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            render={<Link href={`/payroll?m=${next}`} />}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No payroll-tracked employees yet. Add salary settings below for
            each non-OWNER user.
          </CardContent>
        </Card>
      ) : (
        rows.map((r) => (
          <PayrollEmployeeRow
            key={r.employee.userId}
            employee={{
              userId: r.employee.userId,
              fullName: r.employee.fullName,
              username: r.employee.username,
              monthlySalary: r.monthlySalary,
              joinedOn: r.employee.joinedOn
                ? (r.employee.joinedOn as unknown as string)
                : null,
              isActive: r.employee.isPayrollActive ?? false,
            }}
            month={{
              yearMonth,
              actualCredits: r.att.actualCredits,
              expectedCredits: r.att.expectedCredits,
              computedSalary: r.computedSalary,
            }}
          />
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

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
