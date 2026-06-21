import Link from "next/link";
import { and, desc, eq, gte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendanceDays, users } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import { istDateString } from "@/lib/attendance/ist-date";
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

  // Anti-fraud commit 2 (2026-06-22): compute each pending employee's
  // off-site punch count over the last 30 days. Surfaced on the approval
  // card so OWNER can spot suspicious patterns (e.g. "this employee has
  // claimed 12 off-site days this month" = red flag).
  const today = istDateString();
  const thirtyDaysAgo = (() => {
    const d = new Date(`${today}T00:00:00+05:30`);
    d.setUTCDate(d.getUTCDate() - 30);
    return d.toISOString().slice(0, 10);
  })();
  const userIdsToScan = Array.from(
    new Set(rows.map((r) => r.day.userId).filter((id): id is string => Boolean(id))),
  );
  // Map: userId → count of days in last 30d where either side was
  // PENDING / OWNER_APPROVED off-site (anything that wasn't AUTO_APPROVED).
  const offsiteCountByUser = new Map<string, number>();
  if (userIdsToScan.length > 0) {
    const offsiteRows = await db
      .select({
        userId: attendanceDays.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(attendanceDays)
      .where(
        and(
          gte(attendanceDays.date, thirtyDaysAgo),
          or(
            eq(attendanceDays.checkInStatus, "PENDING"),
            eq(attendanceDays.checkInStatus, "OWNER_APPROVED"),
            eq(attendanceDays.checkOutStatus, "PENDING"),
            eq(attendanceDays.checkOutStatus, "OWNER_APPROVED"),
          ),
        ),
      )
      .groupBy(attendanceDays.userId);
    for (const r of offsiteRows) {
      offsiteCountByUser.set(r.userId, r.count);
    }
  }

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
                  offsiteCount30d={offsiteCountByUser.get(day.userId) ?? 0}
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
                          ip: day.checkInIp,
                          ipMatch: day.checkInIpMatch,
                          clockSkewMs: day.checkInClockSkewMs,
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
                          ip: day.checkOutIp,
                          ipMatch: day.checkOutIpMatch,
                          clockSkewMs: day.checkOutClockSkewMs,
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
