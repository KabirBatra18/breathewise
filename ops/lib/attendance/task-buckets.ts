/**
 * Hourly bucket computation for the end-of-day task log.
 *
 * Given a check-in time and a check-out time, returns a list of hourly
 * IST buckets that cover the work span. Bucket boundaries are aligned
 * to whole IST hours, so the first bucket may start partway through
 * the hour (if the employee checked in mid-hour) and the last bucket
 * may end partway through (if they checked out mid-hour).
 *
 * Example: check-in 10:23, check-out 14:12 → 5 buckets:
 *   • 10:23–11:00  ("first hour" — 37 min)
 *   • 11:00–12:00
 *   • 12:00–13:00
 *   • 13:00–14:00
 *   • 14:00–14:12  ("last hour" — 12 min)
 *
 * Pure function — no DB, fully unit-testable. The IST timezone is
 * hardcoded since the whole app is India-only.
 */

const IST_OFFSET_MIN = 330; // UTC+5:30

export interface HourBucket {
  // ISO timestamp strings. Stored verbatim in attendance_task_logs.
  startIso: string;
  endIso: string;
  // Display labels in IST 12-hour format.
  label: string; // e.g. "10:23 AM – 11:00 AM"
  // Minutes covered by this bucket (helpful for the UI to indicate
  // partial-hour first/last buckets).
  minutes: number;
}

export function hourlyBuckets(checkInAt: Date, checkOutAt: Date): HourBucket[] {
  if (checkOutAt.getTime() <= checkInAt.getTime()) {
    return [];
  }
  const buckets: HourBucket[] = [];
  // Walk from check-in to check-out, aligning to whole IST hours.
  let cursor = checkInAt;
  // Defensive cap — a single day shift cannot exceed 24 buckets.
  for (let i = 0; i < 30; i++) {
    if (cursor.getTime() >= checkOutAt.getTime()) break;
    const nextBoundary = nextWholeISTHour(cursor);
    const bucketEnd = nextBoundary < checkOutAt ? nextBoundary : checkOutAt;
    const minutes = Math.round(
      (bucketEnd.getTime() - cursor.getTime()) / 60_000,
    );
    if (minutes <= 0) break;
    buckets.push({
      startIso: cursor.toISOString(),
      endIso: bucketEnd.toISOString(),
      label: `${formatIstTime(cursor)} – ${formatIstTime(bucketEnd)}`,
      minutes,
    });
    cursor = bucketEnd;
  }
  return buckets;
}

/**
 * Returns the next whole IST hour boundary strictly after `at`.
 * Example: 10:23:45 IST → 11:00:00 IST.
 */
function nextWholeISTHour(at: Date): Date {
  // Shift to IST minutes-since-epoch, round UP to the next hour, shift
  // back. Pure arithmetic, no Intl needed at the boundary.
  const istMs = at.getTime() + IST_OFFSET_MIN * 60_000;
  const istMsInHour = Math.floor(istMs / 3_600_000) * 3_600_000;
  const nextIstHourMs = istMsInHour + 3_600_000;
  return new Date(nextIstHourMs - IST_OFFSET_MIN * 60_000);
}

function formatIstTime(at: Date): string {
  // 12-hour "10:23 AM" style. Uses Intl with the Asia/Kolkata
  // timezone — guaranteed correct regardless of where the server is.
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(at);
}
