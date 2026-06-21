import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendanceDays, attendanceSettings } from "@/db/schema";
import { requireAuth } from "@/lib/auth/server";
import { istDateString } from "@/lib/attendance/ist-date";
import { AttendancePanel } from "@/components/attendance/attendance-panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const me = await requireAuth();

  // Today's row (may not exist yet). Loads in parallel with settings
  // because the page header reads from settings (radius, expected hours).
  const today = istDateString(new Date());
  const [todayRows, settingsRows] = await Promise.all([
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
  ]);
  const todayRow = todayRows[0] ?? null;
  const settings = settingsRows[0];

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
