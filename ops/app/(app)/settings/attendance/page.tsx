import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { attendanceSettings } from "@/db/schema";
import { requireOwner } from "@/lib/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Info } from "lucide-react";
import { AttendanceSettingsForm } from "@/components/attendance/settings-form";

export const metadata = { title: "Attendance settings" };

export default async function AttendanceSettingsPage() {
  await requireOwner();
  const [settings] = await db
    .select()
    .from(attendanceSettings)
    .where(eq(attendanceSettings.id, 1))
    .limit(1);

  if (!settings) {
    // Should never happen — migration 0017 always inserts the singleton.
    return <p className="p-6">Settings row missing. Re-run migrations.</p>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Attendance settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Office geofence, expected hours, weekly offs. Changes apply to
          new punches; existing day records are not retroactively re-graded.
        </p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 text-xs">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="space-y-2">
            <p className="font-medium">How geofencing works</p>
            <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
              <li>
                Set your office latitude + longitude below. Open Google
                Maps, drop a pin on the office, right-click → &ldquo;What&apos;s
                here?&rdquo;, copy the lat,lng pair into the fields.
              </li>
              <li>
                Or click <strong>Use current location</strong> if you&apos;re
                physically at the office right now.
              </li>
              <li>
                Radius of 200m comfortably covers a building footprint
                plus typical GPS jitter. Increase if your office is in
                a large compound.
              </li>
              <li>
                Punches within the radius auto-approve. Outside the
                radius go to /attendance/admin for your manual approval
                with a required reason from the employee.
              </li>
            </ul>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Office &amp; geofence</CardTitle>
          <CardDescription>
            The single point that defines &ldquo;at the office&rdquo;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AttendanceSettingsForm
            initial={{
              officeLatitude:
                settings.officeLatitude != null
                  ? Number(settings.officeLatitude)
                  : null,
              officeLongitude:
                settings.officeLongitude != null
                  ? Number(settings.officeLongitude)
                  : null,
              officeRadiusMeters: settings.officeRadiusMeters,
              accuracyRejectThresholdM: settings.accuracyRejectThresholdM,
              expectedHoursPerDay: Number(settings.expectedHoursPerDay),
              weeklyOffsPerWeek: settings.weeklyOffsPerWeek,
              paidLeavesPerMonth: Number(settings.paidLeavesPerMonth),
              trustedOfficeIps: settings.trustedOfficeIps ?? [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
