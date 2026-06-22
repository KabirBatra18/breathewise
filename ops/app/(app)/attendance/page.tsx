import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  attendanceDays,
  attendanceSettings,
  attendanceTaskLogs,
} from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { istDateString } from "@/lib/attendance/ist-date";
import {
  findUnloggedDays,
  loadRecentTaskDescriptions,
} from "@/app/(app)/attendance/task-log-actions";
import { AttendancePanel } from "@/components/attendance/attendance-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const me = await requireAuth();

  // Today's row + the most recent prior open shift (audit-fix 2026-06-22:
  // employees who forgot to check out yesterday had no way to know until
  // OWNER flagged it; now we surface a sticky banner).
  const today = istDateString(new Date());
  const [todayRows, settingsRows, openPriorRows] = await Promise.all([
    db
      .select()
      .from(attendanceDays)
      .where(
        and(eq(attendanceDays.userId, me.id), eq(attendanceDays.date, today)),
      )
      .limit(1),
    db
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.id, 1))
      .limit(1),
    // Most recent open shift before today: has check_in but no check_out.
    // Limit 1 — only show the most recent unresolved one so OWNER isn't
    // overwhelmed if multiple days are stale (rare in practice).
    db
      .select({
        date: attendanceDays.date,
        checkInAt: attendanceDays.checkInAt,
      })
      .from(attendanceDays)
      .where(
        and(
          eq(attendanceDays.userId, me.id),
          lt(attendanceDays.date, today),
          isNotNull(attendanceDays.checkInAt),
          isNull(attendanceDays.checkOutAt),
        ),
      )
      .orderBy(desc(attendanceDays.date))
      .limit(1),
  ]);
  const todayRow = todayRows[0] ?? null;
  const settings = settingsRows[0];
  const openPrior = openPriorRows[0] ?? null;

  // Task-log gate (2026-06-22): completed days with zero task logs.
  // Surfaces as a blocking banner — the next Check In is gated until
  // the oldest one is logged.
  const unlogged = await findUnloggedDays(me.id, today);

  // Autocomplete suggestions for the task log form. Pulls this user's
  // distinct recent task descriptions so common entries ("Sharma
  // residence install") become 1-tap repeats.
  const recentDescriptions = await loadRecentTaskDescriptions(me.id);

  // If today's already checked out AND has no task log → offer the
  // log screen inline (same screen they'd reach via the banner for
  // prior days). Most natural UX: right after Check Out, the panel
  // transitions to the log screen automatically.
  let todayTaskLogs: Array<{
    hourStart: string;
    hourEnd: string;
    description: string;
  }> = [];
  if (todayRow?.checkOutAt) {
    const logs = await db
      .select()
      .from(attendanceTaskLogs)
      .where(eq(attendanceTaskLogs.dayId, todayRow.id))
      .orderBy(attendanceTaskLogs.hourStart);
    todayTaskLogs = logs.map((l) => ({
      hourStart: l.hourStart.toISOString(),
      hourEnd: l.hourEnd.toISOString(),
      description: l.description,
    }));
  }

  // The client component takes plain JSON so we serialise dates to
  // strings here (server-rendered) rather than relying on Next's
  // RSC serialiser to do it for Date objects (which it can, but
  // becoming explicit makes hydration mismatches easier to spot).
  return (
    <div className="mx-auto max-w-md p-4 sm:p-6 lg:p-8">
      <AttendancePanel
        consented={!!me.attendanceConsentAt}
        officeConfigured={
          settings?.officeLatitude != null && settings?.officeLongitude != null
        }
        expectedHoursPerDay={Number(settings?.expectedHoursPerDay ?? 4)}
        officeRadiusM={settings?.officeRadiusMeters ?? 200}
        openPriorShift={
          openPrior
            ? {
                date: openPrior.date as unknown as string,
                checkInAt: openPrior.checkInAt!.toISOString(),
              }
            : null
        }
        unloggedDays={unlogged}
        todayDayId={todayRow?.id ?? null}
        todayTaskLogs={todayTaskLogs}
        recentTaskDescriptions={recentDescriptions}
        today={
          todayRow
            ? {
                checkInAt: todayRow.checkInAt?.toISOString() ?? null,
                checkInStatus: todayRow.checkInStatus,
                checkInDistanceM: todayRow.checkInDistanceM,
                checkInOffsiteNote: todayRow.checkInOffsiteNote,
                checkOutAt: todayRow.checkOutAt?.toISOString() ?? null,
                checkOutStatus: todayRow.checkOutStatus,
                checkOutDistanceM: todayRow.checkOutDistanceM,
                hoursWorked:
                  todayRow.hoursWorked != null
                    ? Number(todayRow.hoursWorked)
                    : null,
                dayCredit:
                  todayRow.dayCredit != null
                    ? Number(todayRow.dayCredit)
                    : null,
              }
            : null
        }
      />
    </div>
  );
}
