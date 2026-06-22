import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { payrollPayments } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import {
  listPayrollEmployees,
  loadCycleAttendance,
} from "@/lib/attendance/queries";
import { computeMonthlySalary } from "@/lib/attendance/credit";
import {
  currentPayCycle,
  previousPayCycle,
} from "@/lib/attendance/pay-cycle";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PayrollEmployeeRow } from "@/components/attendance/payroll-employee-row";

export const dynamic = "force-dynamic";
export const metadata = { title: "Payroll" };

/**
 * Per-employee pay-cycle payroll view.
 *
 * Pay model agreed 2026-06-22: each employee is paid on the day-of-month
 * of their joined_on. Pay cycle is (D of prev month → D of current
 * month] inclusive of pay date. Lock + audit history via payrollPayments.
 *
 * For each employee:
 *   1. Compute their current in-progress cycle from joined_on
 *   2. If today is on/after pay date AND no payrollPayments row exists
 *      for this cycle → show "Ready to pay" with the salary calc
 *   3. Also show the most recently paid cycle as a small history line
 *   4. If joined_on is missing, surface a "Configure first" prompt
 */
export default async function PayrollPage() {
  await requireOwner();

  const employees = await listPayrollEmployees();
  const rows = await Promise.all(
    employees.map(async (e) => {
      const baseMonthly =
        e.monthlySalary != null ? Number(e.monthlySalary) : 0;
      const joinedOn = e.joinedOn
        ? (e.joinedOn as unknown as string)
        : null;

      // Without joined_on we can't anchor the pay cycle. Render a
      // "configure first" card.
      if (!joinedOn) {
        return {
          employee: e,
          baseMonthly,
          joinedOn: null,
          state: "unconfigured" as const,
        };
      }

      const current = currentPayCycle({ joinedOn });
      const previous = previousPayCycle({ joinedOn });

      // Load attendance for whichever cycle is most actionable. If the
      // PREVIOUS cycle exists and isn't yet paid, it's the priority
      // (OWNER's pending action). Otherwise show the in-progress current
      // cycle so OWNER can monitor.
      const [prevPaid, prevCycleAtt, currentAtt] = await Promise.all([
        previous
          ? db
              .select({ id: payrollPayments.id })
              .from(payrollPayments)
              .where(
                eq(payrollPayments.userId, e.userId) &&
                  eq(payrollPayments.payDate, previous.end),
              )
              .limit(1)
              .then((r) => r[0] ?? null)
          : Promise.resolve(null),
        previous
          ? loadCycleAttendance({
              userId: e.userId,
              start: previous.start,
              end: previous.end,
            })
          : Promise.resolve(null),
        loadCycleAttendance({
          userId: e.userId,
          start: current.start,
          end: current.end,
        }),
      ]);

      const prevSalary = prevCycleAtt
        ? computeMonthlySalary({
            monthlySalary: baseMonthly,
            actualCredits: prevCycleAtt.actualCredits,
            expectedCredits: prevCycleAtt.expectedCredits,
          })
        : 0;
      const currentSalary = computeMonthlySalary({
        monthlySalary: baseMonthly,
        actualCredits: currentAtt.actualCredits,
        expectedCredits: currentAtt.expectedCredits,
      });

      return {
        employee: e,
        baseMonthly,
        joinedOn,
        state: "configured" as const,
        currentCycle: current,
        currentAtt,
        currentSalary,
        previousCycle: previous,
        previousAtt: prevCycleAtt,
        previousSalary: prevSalary,
        previousPaidId: prevPaid?.id ?? null,
      };
    }),
  );

  // Recent payment history (last 20 across all employees) — surfaced
  // at the bottom of the page so OWNER can see what's been paid.
  const recentPayments = await db
    .select()
    .from(payrollPayments)
    .orderBy(desc(payrollPayments.paidAt))
    .limit(20);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Each employee&apos;s salary is computed for THEIR own pay cycle —
            anchored to the day-of-month they joined. Click an employee
            below to see the breakdown and mark as paid.
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

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No payroll-tracked employees yet. Add salary settings below
            for each non-OWNER user.
          </CardContent>
        </Card>
      ) : (
        rows.map((r) =>
          r.state === "unconfigured" ? (
            <PayrollEmployeeRow
              key={r.employee.userId}
              employee={{
                userId: r.employee.userId,
                fullName: r.employee.fullName,
                username: r.employee.username,
                monthlySalary: r.baseMonthly,
                joinedOn: null,
                isActive: r.employee.isPayrollActive ?? false,
              }}
              cycleMode="unconfigured"
            />
          ) : (
            <PayrollEmployeeRow
              key={r.employee.userId}
              employee={{
                userId: r.employee.userId,
                fullName: r.employee.fullName,
                username: r.employee.username,
                monthlySalary: r.baseMonthly,
                joinedOn: r.joinedOn,
                isActive: r.employee.isPayrollActive ?? false,
              }}
              cycleMode="configured"
              current={{
                start: r.currentCycle!.start,
                end: r.currentCycle!.end,
                payDate: r.currentCycle!.end,
                actualCredits: r.currentAtt!.actualCredits,
                expectedCredits: r.currentAtt!.expectedCredits,
                computedSalary: r.currentSalary,
                isComplete: r.currentCycle!.isComplete,
              }}
              previous={
                r.previousCycle && r.previousAtt
                  ? {
                      start: r.previousCycle.start,
                      end: r.previousCycle.end,
                      payDate: r.previousCycle.end,
                      actualCredits: r.previousAtt.actualCredits,
                      expectedCredits: r.previousAtt.expectedCredits,
                      computedSalary: r.previousSalary,
                      alreadyPaid: !!r.previousPaidId,
                    }
                  : null
              }
            />
          ),
        )
      )}

      {recentPayments.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <p className="text-sm font-medium">Recent payments</p>
            <p className="text-xs text-muted-foreground">
              Snapshot of what was actually paid, frozen at pay time.
            </p>
            <div className="mt-2 space-y-1 text-xs">
              {recentPayments.map((p) => {
                const empName =
                  employees.find((e) => e.userId === p.userId)?.fullName ??
                  "—";
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                  >
                    <span>
                      <strong>{empName}</strong> · cycle{" "}
                      {p.periodStart as unknown as string} →{" "}
                      {p.periodEnd as unknown as string}
                    </span>
                    <span className="tabular-nums">
                      ₹
                      {new Intl.NumberFormat("en-IN", {
                        minimumFractionDigits: 2,
                      }).format(Number(p.paidAmount))}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
