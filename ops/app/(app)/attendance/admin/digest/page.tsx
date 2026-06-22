import Link from "next/link";
import { and, asc, between, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  attendanceDays,
  attendanceTaskLogs,
  users,
} from "@/db/schema";
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
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Weekly digest" };

/**
 * Weekly digest of every employee's task logs.
 *
 * OWNER-only review surface for the end-of-day hourly logs. Defaults
 * to the last 7 calendar days (including today). Each day is grouped
 * with its constituent employees + their hourly entries underneath.
 *
 * Use case: Sunday review, OWNER skims everyone's last week to spot:
 *   • Days with no log at all (delinquent compliance)
 *   • Suspicious patterns (8 days of "office paperwork" in a row)
 *   • Concentrations on a single client (overdue for invoicing?)
 *
 * Adjacent-week nav (prev/next 7 days) makes it easy to scrub through
 * history.
 */
export default async function WeeklyDigestPage({
  searchParams,
}: {
  searchParams: { d?: string };
}) {
  await requireOwner();

  // Anchor date — defaults to today IST. The week ENDS on this date
  // (inclusive). Going back 6 days gives a 7-day window.
  const anchor = normalizeDate(searchParams.d);
  const start = addDays(anchor, -6);

  // Single grouped query: every day + log row in the window, joined
  // to the user for display name. Day-rows without logs still appear
  // (LEFT JOIN) so empty days are visible too.
  const rows = await db
    .select({
      dayId: attendanceDays.id,
      date: attendanceDays.date,
      checkInAt: attendanceDays.checkInAt,
      checkOutAt: attendanceDays.checkOutAt,
      hoursWorked: attendanceDays.hoursWorked,
      userId: attendanceDays.userId,
      userName: users.fullName,
      userUsername: users.username,
    })
    .from(attendanceDays)
    .leftJoin(users, eq(users.id, attendanceDays.userId))
    .where(between(attendanceDays.date, start, anchor))
    .orderBy(asc(attendanceDays.date), asc(users.fullName));

  // Single fetch of all logs in the window — join via day_id locally.
  const logRows =
    rows.length > 0
      ? await db
          .select()
          .from(attendanceTaskLogs)
          .where(
            and(
              between(attendanceTaskLogs.hourStart, dayStartUtc(start), dayEndUtc(anchor)),
            ),
          )
          .orderBy(asc(attendanceTaskLogs.hourStart))
      : [];
  const logsByDayId = new Map<string, typeof logRows>();
  for (const l of logRows) {
    const arr = logsByDayId.get(l.dayId) ?? [];
    arr.push(l);
    logsByDayId.set(l.dayId, arr);
  }

  // Group rows by date (DESC for display — most recent first).
  const byDate = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.date as unknown as string;
    const arr = byDate.get(key) ?? [];
    arr.push(r);
    byDate.set(key, arr);
  }
  const orderedDates = Array.from(byDate.keys()).sort().reverse();

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Weekly digest
          </h1>
          <p className="text-sm text-muted-foreground">
            Last 7 days · everyone&apos;s hourly task logs · skim for
            patterns.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/attendance/admin" />}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to approvals
          </Button>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/attendance/admin/grid" />}
          >
            Monthly grid
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Window
          </p>
          <p className="text-sm font-medium">
            {formatDay(start)} – {formatDay(anchor)}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            render={
              <Link
                href={`/attendance/admin/digest?d=${addDays(anchor, -7)}`}
              />
            }
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            render={
              <Link
                href={`/attendance/admin/digest?d=${addDays(anchor, 7)}`}
              />
            }
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {orderedDates.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No attendance records in this 7-day window.
          </CardContent>
        </Card>
      ) : (
        orderedDates.map((date) => {
          const dayRows = byDate.get(date)!;
          return (
            <Card key={date}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{formatDay(date)}</CardTitle>
                <CardDescription>
                  {dayRows.length} {dayRows.length === 1 ? "person" : "people"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dayRows.map((r) => {
                  const logs = logsByDayId.get(r.dayId) ?? [];
                  return (
                    <div
                      key={r.dayId}
                      className="rounded-md border bg-muted/20 p-3"
                    >
                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium">
                          {r.userName ?? r.userUsername ?? "Unknown"}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          {r.checkInAt
                            ? formatTime(r.checkInAt.toISOString())
                            : "—"}
                          {" → "}
                          {r.checkOutAt
                            ? formatTime(r.checkOutAt.toISOString())
                            : "(open)"}
                          {r.hoursWorked != null
                            ? ` · ${Number(r.hoursWorked).toFixed(2)}h`
                            : ""}
                        </span>
                      </div>
                      {logs.length === 0 ? (
                        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                          <Clock className="-mt-0.5 mr-1 inline h-3 w-3" />
                          No task log filled.
                        </p>
                      ) : (
                        <ul className="space-y-0.5 text-xs">
                          {logs.map((l) => (
                            <li
                              key={l.id}
                              className="flex items-baseline gap-2"
                            >
                              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                                {formatTime(l.hourStart.toISOString())}–
                                {formatTime(l.hourEnd.toISOString())}
                              </span>
                              <span>
                                {l.description || (
                                  <span className="italic text-muted-foreground">
                                    (blank)
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

function normalizeDate(input?: string): string {
  if (input && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  return istDateString();
}

function addDays(yyyymmdd: string, delta: number): string {
  const [y, m, d] = yyyymmdd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const ny = dt.getUTCFullYear();
  const nm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const nd = String(dt.getUTCDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

// UTC boundary of an IST date for between() comparisons against
// timestamptz columns (hourStart in attendance_task_logs).
function dayStartUtc(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T00:00:00+05:30`);
}
function dayEndUtc(yyyymmdd: string): Date {
  return new Date(`${yyyymmdd}T23:59:59+05:30`);
}

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${iso}T00:00:00+05:30`));
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
