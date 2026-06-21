import Link from "next/link";
import { desc, eq, or } from "drizzle-orm";
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
import { Settings } from "lucide-react";
import { PendingApprovalCard } from "@/components/attendance/pending-approval-card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance · Admin" };

export default async function AttendanceAdminPage() {
  await requireOwner();

  // Pull every day-row that has a PENDING punch on either side. Joined to
  // users for the display name. Index idx_attendance_days_pending covers
  // this query.
  const rows = await db
    .select({
      day: attendanceDays,
      userName: users.fullName,
      userUsername: users.username,
    })
    .from(attendanceDays)
    .leftJoin(users, eq(users.id, attendanceDays.userId))
    .where(
      or(
        eq(attendanceDays.checkInStatus, "PENDING"),
        eq(attendanceDays.checkOutStatus, "PENDING"),
      ),
    )
    .orderBy(desc(attendanceDays.date), desc(attendanceDays.updatedAt));

  // Missed-checkout anomalies are surfaced in the monthly grid (Commit F),
  // where OWNER can click a specific day and enter the actual checkout
  // time via editDayCheckoutAction. This page only handles pending-
  // approval punches.

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Attendance · Admin
          </h1>
          <p className="text-sm text-muted-foreground">
            Approve off-site punches, fix missed checkouts, declare
            public holidays.
          </p>
        </div>
        <Button variant="outline" size="sm" render={<Link href="/settings/attendance" />}>
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>
            {rows.length === 0
              ? "Nothing waiting — every punch today was at the office."
              : `${rows.length} day${rows.length === 1 ? "" : "s"} need your attention.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="rounded-md border-2 border-dashed py-10 text-center text-sm text-muted-foreground">
              All clear.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map(({ day, userName, userUsername }) => (
                <PendingApprovalCard
                  key={day.id}
                  dayId={day.id}
                  employeeName={userName ?? userUsername ?? "Unknown"}
                  date={day.date as unknown as string}
                  checkIn={
                    day.checkInAt
                      ? {
                          at: day.checkInAt.toISOString(),
                          lat: day.checkInLat != null ? Number(day.checkInLat) : null,
                          lng: day.checkInLng != null ? Number(day.checkInLng) : null,
                          distanceM: day.checkInDistanceM,
                          accuracyM: day.checkInAccuracyM,
                          status: day.checkInStatus,
                          note: day.checkInOffsiteNote,
                        }
                      : null
                  }
                  checkOut={
                    day.checkOutAt
                      ? {
                          at: day.checkOutAt.toISOString(),
                          lat: day.checkOutLat != null ? Number(day.checkOutLat) : null,
                          lng: day.checkOutLng != null ? Number(day.checkOutLng) : null,
                          distanceM: day.checkOutDistanceM,
                          accuracyM: day.checkOutAccuracyM,
                          status: day.checkOutStatus,
                          note: day.checkOutOffsiteNote,
                        }
                      : null
                  }
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
