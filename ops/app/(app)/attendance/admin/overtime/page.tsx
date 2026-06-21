import Link from "next/link";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendanceDays, users } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { OvertimeApprovalCard } from "@/components/attendance/overtime-approval-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overtime queue" };

/**
 * OWNER-only page for approving overtime on a day-by-day basis.
 *
 * Anti-fraud commit 3 (2026-06-22): when an employee's day_credit comes
 * out > 1.0 (worked > 4h on a 4-hour-expected day), the extra credit is
 * capped at 1.0 in queries.ts until OWNER approves overtime here. This
 * makes the "check in at office at 9am, leave, come back at 6pm to
 * check out" exploit a 1.0-credit day instead of a 2.0/2.5 windfall.
 *
 * Default: shows the 30 most recent days with pending overtime. Uses
 * idx_attendance_days_overtime_pending (partial index added in
 * migration 0018) so the query stays fast as history grows.
 */
export default async function OvertimeQueuePage() {
  await requireOwner();

  const pending = await db
    .select({
      day: attendanceDays,
      userName: users.fullName,
      userUsername: users.username,
    })
    .from(attendanceDays)
    .leftJoin(users, eq(users.id, attendanceDays.userId))
    .where(
      and(
        gt(attendanceDays.dayCredit, sql`1.0`),
        isNull(attendanceDays.overtimeApprovedAt),
      ),
    )
    .orderBy(desc(attendanceDays.date), desc(attendanceDays.updatedAt))
    .limit(60);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Overtime queue
          </h1>
          <p className="text-sm text-muted-foreground">
            Days where the employee accumulated more than one credit of
            work. Until you approve, only 1.0 counts toward their salary.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          render={<Link href="/attendance/admin" />}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to approvals
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending overtime approvals</CardTitle>
          <CardDescription>
            {pending.length === 0
              ? "All clear — no overtime currently awaiting your approval."
              : `${pending.length} day${pending.length === 1 ? "" : "s"} waiting.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pending.length === 0 ? (
            <p className="rounded-md border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
              Nothing here.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map(({ day, userName, userUsername }) => (
                <OvertimeApprovalCard
                  key={day.id}
                  dayId={day.id}
                  employeeName={userName ?? userUsername ?? "Unknown"}
                  date={day.date as unknown as string}
                  hoursWorked={
                    day.hoursWorked != null ? Number(day.hoursWorked) : 0
                  }
                  rawDayCredit={
                    day.dayCredit != null ? Number(day.dayCredit) : 0
                  }
                  cappedCredit={1.0}
                  checkInAt={day.checkInAt?.toISOString() ?? null}
                  checkOutAt={day.checkOutAt?.toISOString() ?? null}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How overtime works</p>
        <p className="mt-1">
          Working &gt; 4 hours produces a credit &gt; 1.0 (e.g. 8h = 2.0
          credits, a double shift). To stop the &ldquo;punch in then leave
          for 8 hours&rdquo; exploit, those extra credits are not paid
          unless you explicitly approve overtime for that specific day.
          Approve = the full day_credit (1.5 / 2.0 / 2.5 / 3.0) counts
          toward salary. Reject = cap stays at 1.0.
        </p>
      </div>
    </div>
  );
}
